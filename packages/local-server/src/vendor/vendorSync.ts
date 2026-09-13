import { rm } from "node:fs/promises";
import path from "node:path";
import {
  addVendorRepo,
  removeVendorRepo,
  updateVendorRepo,
  type VendorRepoConfig,
} from "@clash-route-kit/core";
import {
  readProjectConfigFile,
  writeProjectConfigFile,
  type ProjectConfigFileResult,
  type ProjectOptions,
  type ReadText,
  type WriteText,
} from "../config/configRepository.js";

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

export async function addProjectVendorRepo(
  options: VendorRepoMutationOptions & { input: VendorRepoInput },
): Promise<ProjectConfigFileResult> {
  const { config } = await readProjectConfigFile(options);
  return writeProjectConfigFile({ ...options, config: addVendorRepo(config, normalizeVendorRepoInput(options.input)) });
}

export interface VendorRepoUpdateResult extends ProjectConfigFileResult {
  /** True when the clone source/location changed and the old vendor dir was cleared (caller should re-sync). */
  resync: boolean;
}

export async function updateProjectVendorRepo(
  options: VendorRepoMutationOptions & { name: string; input: VendorRepoInput },
): Promise<VendorRepoUpdateResult> {
  const { config } = await readProjectConfigFile(options);
  const previous = config.vendorRepos.find((repo) => repo.name === options.name);
  const next = normalizeVendorRepoInput(options.input);
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
): Promise<ProjectConfigFileResult> {
  const { config } = await readProjectConfigFile(options);
  return writeProjectConfigFile({ ...options, config: removeVendorRepo(config, options.name) });
}
