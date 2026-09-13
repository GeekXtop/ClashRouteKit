import { rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  addVendorRepo,
  removeVendorRepo,
  updateVendorRepo,
  type AuthorProjectConfigV2,
  type RouteKitProjectConfig,
  type VendorRepoConfig,
  type VendorRepoV2,
} from "@clash-route-kit/core";
import {
  projectConfigPath,
  readAuthorProjectFile,
  writeProjectConfigFile,
  type ProjectConfigFileResult,
  type ProjectOptions,
  type ReadText,
  type WriteText,
} from "../config/configRepository.js";
import { writeFileAtomic } from "../config/atomic.js";
import { serializeAuthorProjectV2, validateAuthorProjectV2Yaml } from "../config/authorProjectV2.js";

export type { ReadText, WriteText };

export interface VendorRepoInput {
  name: string;
  url: string;
  branch?: string;
  /** Local clone folder under vendor/; defaults to the repo name when omitted. */
  folder?: string;
  catalog?: { reldir: string; kind: "domain-list" | "list-dir" | "provider-yaml" | "ini-template" };
  templateReldir?: string;
}

export function normalizeVendorRepoInput(input: VendorRepoInput): VendorRepoConfig {
  const name = input.name.trim();
  if (!name) {
    throw new Error("vendor repo name is required");
  }
  // The local folder (where git clones to) is decoupled from the display name;
  // relative dirs are resolved against vendor/<folder>/, not vendor/<name>/.
  const folder = input.folder?.trim().replace(/^\/+|\/+$/g, "") || name;
  const repo: VendorRepoConfig = { name, url: input.url.trim(), path: `vendor/${folder}` };
  if (input.branch?.trim()) {
    repo.branch = input.branch.trim();
  }
  const reldir = input.catalog?.reldir.trim().replace(/^\/+|\/+$/g, "");
  if (input.catalog && reldir) {
    repo.catalog = { dir: `vendor/${folder}/${reldir}`, kind: input.catalog.kind };
  }
  const templateReldir = input.templateReldir?.trim().replace(/^\/+|\/+$/g, "");
  if (templateReldir) {
    repo.templateDir = `vendor/${folder}/${templateReldir}`;
  }
  return repo;
}

export interface VendorRepoMutationOptions extends ProjectOptions {
  readText?: ReadText;
  writeText?: WriteText;
  statMtime?: (filePath: string) => Promise<number>;
  removePath?: (filePath: string) => Promise<void>;
}

/** Delete a directory under vendor/, refusing anything outside it (or vendor/ itself). */
async function clearVendorDirectory(
  options: ProjectOptions & { removePath?: (filePath: string) => Promise<void> },
  relPath: string,
): Promise<void> {
  const vendorRoot = path.resolve(options.root, "vendor");
  const target = path.resolve(options.root, relPath);
  if (target === vendorRoot || !target.startsWith(`${vendorRoot}${path.sep}`)) {
    throw new Error(`Refusing to clear path outside vendor/: ${relPath}`);
  }
  const removePath = options.removePath ?? ((filePath: string) => rm(filePath, { recursive: true, force: true }));
  await removePath(target);
}

/** v2 作者配置下的 vendor 仓库增删改结果（HTTP 响应不携带 v1 解析字段）。 */
export interface VendorRepoV2MutationResult {
  ok: true;
  schemaVersion: 2;
  yaml: string;
  mtime: number;
}

export type VendorRepoMutationResult = ProjectConfigFileResult | VendorRepoV2MutationResult;

/** vendorRepos 清单级 mutation：core 的 add/update/remove 只读取 config.vendorRepos，用最小占位对象复用其校验逻辑。 */
function mutateVendorRepoList(
  repos: readonly VendorRepoConfig[],
  mutate: (config: RouteKitProjectConfig) => RouteKitProjectConfig,
): VendorRepoConfig[] {
  return mutate({ vendorRepos: [...repos] } as unknown as RouteKitProjectConfig).vendorRepos;
}

/** v2 新增仓库时生成确定性稳定 id（name 的 slug，冲突追加序号）。 */
function withV2RepoId(repos: readonly VendorRepoV2[], repo: VendorRepoConfig): VendorRepoV2 {
  const base =
    repo.name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "") || "repo";
  let id = base;
  let n = 2;
  while (repos.some((item) => item.id === id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return { ...repo, id };
}

/** v2 作者配置：变更 vendorRepos 后走完整校验链并原子写回（schemaVersion: 2 置顶）。 */
async function saveV2VendorRepos(
  options: VendorRepoMutationOptions,
  v2: AuthorProjectConfigV2,
  repos: VendorRepoConfig[],
): Promise<VendorRepoV2MutationResult> {
  const yamlText = serializeAuthorProjectV2({ ...v2, vendorRepos: repos as VendorRepoV2[] });
  const validation = validateAuthorProjectV2Yaml(yamlText);
  const errors = validation.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length > 0) {
    throw new Error(errors.map((diagnostic) => `[${diagnostic.code}] ${diagnostic.message}`).join("; "));
  }
  const writeText = options.writeText ?? ((filePath: string, text: string) => writeFileAtomic(filePath, text));
  const statMtime =
    options.statMtime ?? ((filePath: string) => stat(filePath).then((info) => info.mtimeMs).catch(() => 0));
  const configPath = projectConfigPath(options);
  await writeText(configPath, yamlText);
  return { ok: true, schemaVersion: 2, yaml: yamlText, mtime: await statMtime(configPath) };
}

export async function addProjectVendorRepo(
  options: VendorRepoMutationOptions & { input: VendorRepoInput },
): Promise<VendorRepoMutationResult> {
  const document = await readAuthorProjectFile(options);
  if (document.schemaVersion === 2) {
    const repos = document.v2.vendorRepos ?? [];
    const next = withV2RepoId(repos, normalizeVendorRepoInput(options.input));
    return saveV2VendorRepos(options, document.v2, mutateVendorRepoList(repos, (config) => addVendorRepo(config, next)));
  }
  return writeProjectConfigFile({
    ...options,
    config: addVendorRepo(document.config, normalizeVendorRepoInput(options.input)),
  });
}

export interface VendorRepoUpdateResult extends ProjectConfigFileResult {
  /** True when the clone source/location changed and the old vendor dir was cleared (caller should re-sync). */
  resync: boolean;
}

export type VendorRepoUpdateMutationResult =
  | VendorRepoUpdateResult
  | (VendorRepoV2MutationResult & { resync: boolean });

export async function updateProjectVendorRepo(
  options: VendorRepoMutationOptions & { name: string; input: VendorRepoInput },
): Promise<VendorRepoUpdateMutationResult> {
  const document = await readAuthorProjectFile(options);
  const next = normalizeVendorRepoInput(options.input);
  if (document.schemaVersion === 2) {
    const repos = document.v2.vendorRepos ?? [];
    const previous = repos.find((repo) => repo.name === options.name);
    const result = await saveV2VendorRepos(
      options,
      document.v2,
      mutateVendorRepoList(repos, (config) => updateVendorRepo(config, options.name, next)),
    );
    const resync = Boolean(
      previous &&
        (previous.path !== next.path ||
          previous.url !== next.url ||
          (previous.branch ?? "") !== (next.branch ?? "")),
    );
    if (resync && previous) {
      await clearVendorDirectory(options, previous.path);
    }
    return { ...result, resync };
  }
  const { config } = document;
  const previous = config.vendorRepos.find((repo) => repo.name === options.name);
  const result = await writeProjectConfigFile({ ...options, config: updateVendorRepo(config, options.name, next) });
  const resync = Boolean(
    previous &&
      (previous.path !== next.path ||
        previous.url !== next.url ||
        (previous.branch ?? "") !== (next.branch ?? "")),
  );
  if (resync && previous) {
    // Clear the old clone so the next sync re-clones from the new source/folder.
    await clearVendorDirectory(options, previous.path);
  }
  return { ...result, resync };
}

export async function removeProjectVendorRepo(
  options: VendorRepoMutationOptions & { name: string },
): Promise<VendorRepoMutationResult> {
  const document = await readAuthorProjectFile(options);
  if (document.schemaVersion === 2) {
    return saveV2VendorRepos(
      options,
      document.v2,
      mutateVendorRepoList(document.v2.vendorRepos ?? [], (config) => removeVendorRepo(config, options.name)),
    );
  }
  return writeProjectConfigFile({ ...options, config: removeVendorRepo(document.config, options.name) });
}
