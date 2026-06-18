import { execFile } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  convertDomainListCommunity,
  parseDomainListEntry,
  parseRouteKitConfig,
  serializeRouteKitConfig,
  type DomainListEntryInfo,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";
import {
  checkConfig,
  generateOutputs,
  syncVendor,
  type GenerateResult,
  type ProgramOptions,
} from "../../cli/src/program.js";
import { addVendorRepo } from "../src/configMutations.js";

const execFileAsync = promisify(execFile);

export type RouteKitAction = "check" | "generate" | "sync-vendor" | "git-status" | "git-commit" | "git-push";

export interface RouteKitActionResult {
  action: RouteKitAction;
  ok: boolean;
  output: string;
}

interface RouteKitActionDependencies {
  checkConfig?: typeof checkConfig;
  generateOutputs?: typeof generateOutputs;
  runCommand?: RunCommand;
  only?: string;
}

type RouteKitActionOptions = ProgramOptions & RouteKitActionDependencies;
type RunCommand = (command: string, args: string[], cwd: string) => Promise<string>;
type ReadDirectory = (directory: string) => Promise<string[]>;
type ReadText = (filePath: string) => Promise<string>;
type WriteText = (filePath: string, text: string) => Promise<void>;

export interface ProjectConfigFileOptions extends ProgramOptions {
  readText?: ReadText;
}

export interface WriteProjectConfigFileOptions extends ProgramOptions {
  config: RouteKitProjectConfig;
  writeText?: WriteText;
}

export interface ProjectConfigFileResult {
  yaml: string;
  config: RouteKitProjectConfig;
}

export interface ProjectRuleFilesOptions extends ProgramOptions {
  readDirectory?: ReadDirectory;
}

export interface ProjectRuleFileOptions extends ProgramOptions {
  file: string;
  readText?: ReadText;
}

export interface WriteProjectRuleFileOptions extends ProgramOptions {
  file: string;
  text: string;
  writeText?: WriteText;
}

export interface ProjectRuleFileResult {
  file: string;
  text: string;
}

function projectConfigPath(options: ProgramOptions): string {
  return path.resolve(options.root, options.configFile);
}

function rulesDirectory(options: ProgramOptions): string {
  return path.resolve(options.root, "config/rules");
}

function resolveRuleFile(options: ProgramOptions, file: string): string {
  if (!/^[A-Za-z0-9_.-]+\.list$/.test(file)) {
    throw new Error(`Invalid rule file: ${file}`);
  }

  const directory = rulesDirectory(options);
  const resolved = path.resolve(directory, file);
  if (!resolved.startsWith(`${directory}${path.sep}`)) {
    throw new Error(`Invalid rule file: ${file}`);
  }
  return resolved;
}

export async function readProjectConfigFile(
  options: ProjectConfigFileOptions,
): Promise<ProjectConfigFileResult> {
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  const yaml = await readText(projectConfigPath(options));
  return {
    yaml,
    config: parseRouteKitConfig(yaml),
  };
}

export async function writeProjectConfigFile(
  options: WriteProjectConfigFileOptions,
): Promise<ProjectConfigFileResult> {
  const writeText = options.writeText ?? ((filePath: string, text: string) => writeFile(filePath, text, "utf8"));
  const yaml = serializeRouteKitConfig(options.config);
  await writeText(projectConfigPath(options), yaml);
  return {
    yaml,
    config: options.config,
  };
}

export async function listProjectRuleFiles(options: ProjectRuleFilesOptions): Promise<string[]> {
  const readDirectory = options.readDirectory ?? ((directory: string) => readdir(directory));
  return (await readDirectory(rulesDirectory(options)))
    .filter((file) => /^[A-Za-z0-9_.-]+\.list$/.test(file))
    .sort();
}

export async function readProjectRuleFile(options: ProjectRuleFileOptions): Promise<ProjectRuleFileResult> {
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  return {
    file: options.file,
    text: await readText(resolveRuleFile(options, options.file)),
  };
}

export async function writeProjectRuleFile(
  options: WriteProjectRuleFileOptions,
): Promise<ProjectRuleFileResult> {
  const writeText = options.writeText ?? ((filePath: string, text: string) => writeFile(filePath, text, "utf8"));
  const text = options.text.replace(/\r\n?/g, "\n").replace(/\n?$/, "\n");
  await writeText(resolveRuleFile(options, options.file), text);
  return {
    file: options.file,
    text,
  };
}

interface CatalogOriginDef {
  id: string;
  label: string;
  kind: "domain-list" | "list-dir" | "provider-yaml" | "ini-template";
  dir: string;
}

const CATALOG_ORIGINS: CatalogOriginDef[] = [
  {
    id: "domain-list-community",
    label: "domain-list-community",
    kind: "domain-list",
    dir: "vendor/domain-list-community/data",
  },
  { id: "ACL4SSR", label: "ACL4SSR", kind: "list-dir", dir: "vendor/ACL4SSR/Clash" },
  { id: "dler-io", label: "dler-io", kind: "provider-yaml", dir: "vendor/Rules/Clash/Provider" },
  { id: "Aethersailor", label: "Aethersailor", kind: "list-dir", dir: "vendor/Custom_OpenClash_Rules/rule" },
];

export interface CatalogEntriesOptions extends ProgramOptions {
  origin: string;
  readDirectory?: ReadDirectory;
  origins?: CatalogOriginDef[];
}

export interface CatalogEntryOptions extends ProgramOptions {
  origin: string;
  name: string;
  readText?: ReadText;
  origins?: CatalogOriginDef[];
}

export interface CatalogSourceInfo {
  id: string;
  label: string;
  kind: "upstream" | "local";
  originKind?: string;
  count: number;
  syncedAt: number | null;
  browsable: boolean;
}

export interface CatalogSourcesOptions extends ProgramOptions {
  readDirectory?: ReadDirectory;
  statMtime?: (dirPath: string) => Promise<number>;
  origins?: CatalogOriginDef[];
}

export function catalogOriginsFromConfig(config: RouteKitProjectConfig): CatalogOriginDef[] {
  const fromConfig = config.vendorRepos
    .filter((repo) => repo.catalog)
    .map((repo) => ({ id: repo.name, label: repo.name, kind: repo.catalog!.kind, dir: repo.catalog!.dir }));
  return fromConfig.length > 0 ? fromConfig : CATALOG_ORIGINS;
}

function catalogOrigin(origin: string, origins: CatalogOriginDef[] = CATALOG_ORIGINS): CatalogOriginDef {
  const def = origins.find((item) => item.id === origin);
  if (!def) {
    throw new Error(`Unknown catalog origin: ${origin}`);
  }
  return def;
}

function catalogDataDir(options: ProgramOptions & { origins?: CatalogOriginDef[] }, origin: string): string {
  return path.resolve(options.root, catalogOrigin(origin, options.origins).dir);
}

function listRules(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function isValidEntryName(name: string): boolean {
  return /^[A-Za-z0-9_!.@ -]+$/.test(name) && !name.includes("..");
}

function parseProviderPayload(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim().replace(/^["']|["']$/g, ""))
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

export async function listCatalogEntries(options: CatalogEntriesOptions): Promise<string[]> {
  const def = catalogOrigin(options.origin, options.origins);
  const readDirectory = options.readDirectory ?? ((directory: string) => readdir(directory));
  const entries = await readDirectory(catalogDataDir(options, options.origin));
  if (def.kind === "list-dir") {
    return entries
      .filter((name) => name.endsWith(".list"))
      .map((name) => name.slice(0, -".list".length))
      .sort();
  }
  if (def.kind === "provider-yaml") {
    return entries
      .filter((name) => name.endsWith(".yaml"))
      .map((name) => name.slice(0, -".yaml".length))
      .sort();
  }
  if (def.kind === "ini-template") {
    return entries
      .filter((name) => name.endsWith(".ini"))
      .map((name) => name.slice(0, -".ini".length))
      .sort();
  }
  return entries.filter((name) => !name.includes(".")).sort();
}

export async function readCatalogEntry(
  options: CatalogEntryOptions,
): Promise<DomainListEntryInfo & { name: string }> {
  if (!isValidEntryName(options.name)) {
    throw new Error(`Invalid entry: ${options.name}`);
  }
  const def = catalogOrigin(options.origin, options.origins);
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  const dir = catalogDataDir(options, options.origin);
  if (def.kind === "list-dir") {
    const text = await readText(path.join(dir, `${options.name}.list`));
    return { name: options.name, includes: [], ruleCount: listRules(text).length };
  }
  if (def.kind === "provider-yaml") {
    const text = await readText(path.join(dir, `${options.name}.yaml`));
    return { name: options.name, includes: [], ruleCount: parseProviderPayload(text).length };
  }
  const text = await readText(path.join(dir, options.name));
  return { name: options.name, ...parseDomainListEntry(text) };
}

export async function readCatalogEntryDomains(options: CatalogEntryOptions): Promise<string[]> {
  if (!isValidEntryName(options.name)) {
    throw new Error(`Invalid entry: ${options.name}`);
  }
  const def = catalogOrigin(options.origin, options.origins);
  const dir = catalogDataDir(options, options.origin);
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  if (def.kind === "list-dir") {
    return listRules(await readText(path.join(dir, `${options.name}.list`)));
  }
  if (def.kind === "provider-yaml") {
    return parseProviderPayload(await readText(path.join(dir, `${options.name}.yaml`)));
  }
  const base = "https://catalog.local/";
  const fetchText = async (url: string): Promise<string> => {
    const entryName = decodeURIComponent(url.slice(base.length));
    if (!isValidEntryName(entryName)) {
      throw new Error(`Invalid include: ${entryName}`);
    }
    return readText(path.join(dir, entryName));
  };
  const content = await readText(path.join(dir, options.name));
  return convertDomainListCommunity(content, { sourceUrl: `${base}${options.name}`, fetchText });
}

export async function readCatalogTemplate(options: CatalogEntryOptions): Promise<{ name: string; ini: string }> {
  if (!isValidEntryName(options.name)) {
    throw new Error(`Invalid entry: ${options.name}`);
  }
  const dir = catalogDataDir(options, options.origin);
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  const ini = await readText(path.join(dir, `${options.name}.ini`));
  return { name: options.name, ini };
}

export async function listCatalogSources(options: CatalogSourcesOptions): Promise<CatalogSourceInfo[]> {
  const readDirectory = options.readDirectory ?? ((directory: string) => readdir(directory));
  const statMtime = options.statMtime ?? (async (dirPath: string) => (await stat(dirPath)).mtimeMs);
  const sources: CatalogSourceInfo[] = [];
  for (const def of options.origins ?? CATALOG_ORIGINS) {
    let count = 0;
    let syncedAt: number | null = null;
    try {
      count = (await listCatalogEntries({ ...options, origin: def.id, readDirectory })).length;
      syncedAt = await statMtime(path.resolve(options.root, def.dir));
    } catch {
      count = 0;
    }
    sources.push({
      id: def.id,
      label: def.label,
      kind: "upstream",
      originKind: def.kind,
      count,
      syncedAt,
      browsable: true,
    });
  }
  let localCount = 0;
  try {
    localCount = (await listProjectRuleFiles({ ...options, readDirectory })).length;
  } catch {
    localCount = 0;
  }
  sources.push({
    id: "local",
    label: "本地 .list",
    kind: "local",
    count: localCount,
    syncedAt: null,
    browsable: true,
  });
  return sources;
}

async function defaultRunCommand(command: string, args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync(command, args, { cwd });
  return [result.stdout, result.stderr].filter(Boolean).join("");
}

export interface GitRemoteOptions extends ProgramOptions {
  runCommand?: RunCommand;
}

export async function readGitRemote(options: GitRemoteOptions): Promise<string> {
  const runCommand = options.runCommand ?? defaultRunCommand;
  const output = await runCommand("git", ["remote", "get-url", "origin"], options.root);
  return output.trim();
}

function formatGenerateOutput(result: GenerateResult): string {
  const lines = [`[generate] template: ${result.templatePath}`];
  for (const provider of result.providers) {
    const sources = provider.sources
      .map((source) => `${source.name}:${source.domainRules}/${source.inputRules}`)
      .join(", ");
    lines.push(`[generate] rules: ${provider.path}`);
    lines.push(
      `[generate] summary: ${provider.name} output=${provider.outputRules} domain=${provider.domainRules} excluded=${provider.excludedRules} sources=[${sources}]`,
    );
  }
  const duplicateRuleCount = result.duplicates.reduce((count, provider) => count + provider.rules.length, 0);
  lines.push(`[generate] duplicates: providers=${result.duplicates.length} rules=${duplicateRuleCount}`);
  lines.push(`[generate] overlaps: rules=${result.overlaps.length}`);
  lines.push(`[generate] report: ${result.reportPath}`);
  return lines.join("\n");
}

export async function runRouteKitAction(
  action: RouteKitAction,
  options: RouteKitActionOptions,
): Promise<RouteKitActionResult> {
  const runCommand = options.runCommand ?? defaultRunCommand;

  if (action === "check") {
    const diagnostics = await (options.checkConfig ?? checkConfig)(options);
    return {
      action,
      ok: diagnostics.length === 0,
      output: diagnostics.length === 0 ? "[check] ok" : diagnostics.map((item) => `[check] ${item}`).join("\n"),
    };
  }

  if (action === "sync-vendor") {
    const results = await syncVendor(options);
    const lines = results.map((result) => `[sync-vendor] ${result.action}: ${result.name} -> ${result.path}`);
    return { action, ok: true, output: lines.length > 0 ? lines.join("\n") : "[sync-vendor] 无 vendorRepos" };
  }

  if (action === "git-status") {
    const output = await runCommand("git", ["status", "--short"], options.root);
    return {
      action,
      ok: true,
      output: output || "[git] working tree clean",
    };
  }

  if (action === "git-commit") {
    await runCommand("git", ["add", "config/routes.yaml", "config/rules"], options.root);
    const output = await runCommand("git", ["commit", "-m", "chore: update route config"], options.root);
    return {
      action,
      ok: true,
      output: output || "[git] committed route config",
    };
  }

  if (action === "git-push") {
    const output = await runCommand("git", ["push"], options.root);
    return {
      action,
      ok: true,
      output: output || "[git] pushed current branch",
    };
  }

  const result = await (options.generateOutputs ?? generateOutputs)(options);
  return {
    action,
    ok: true,
    output: formatGenerateOutput(result),
  };
}

function parseRouteKitAction(pathname: string): RouteKitAction | null {
  if (pathname === "/api/actions/check") return "check";
  if (pathname === "/api/actions/generate") return "generate";
  if (pathname === "/api/actions/sync-vendor") return "sync-vendor";
  if (pathname === "/api/actions/git-status") return "git-status";
  if (pathname === "/api/actions/git-commit") return "git-commit";
  if (pathname === "/api/actions/git-push") return "git-push";
  return null;
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

export function createRouteKitApiHandler(options: ProgramOptions) {
  return (request: IncomingMessage, response: ServerResponse, next: () => void): void => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/api/project/config") {
      if (request.method === "GET") {
        void readProjectConfigFile(options)
          .then((result) => writeJson(response, 200, result))
          .catch((error: unknown) => {
            writeJson(response, 500, {
              ok: false,
              output: error instanceof Error ? error.message : String(error),
            });
          });
        return;
      }

      if (request.method === "PUT") {
        let body = "";
        request.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
        });
        request.on("end", () => {
          void Promise.resolve()
            .then(() => JSON.parse(body) as { config?: RouteKitProjectConfig })
            .then((payload) => {
              if (!payload.config) {
                throw new Error("Missing config");
              }
              return writeProjectConfigFile({ ...options, config: payload.config });
            })
            .then((result) => writeJson(response, 200, result))
            .catch((error: unknown) => {
              writeJson(response, 400, {
                ok: false,
                output: error instanceof Error ? error.message : String(error),
              });
            });
        });
        return;
      }

      writeJson(response, 405, { ok: false, output: "Method not allowed" });
      return;
    }

    if (url.pathname === "/api/project/rules") {
      if (request.method !== "GET") {
        writeJson(response, 405, { ok: false, output: "Method not allowed" });
        return;
      }

      void listProjectRuleFiles(options)
        .then((files) => writeJson(response, 200, { files }))
        .catch((error: unknown) => {
          writeJson(response, 500, {
            ok: false,
            output: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (url.pathname.startsWith("/api/project/rules/")) {
      const file = decodeURIComponent(url.pathname.slice("/api/project/rules/".length));

      if (request.method === "GET") {
        void readProjectRuleFile({ ...options, file })
          .then((result) => writeJson(response, 200, result))
          .catch((error: unknown) => {
            writeJson(response, 400, {
              ok: false,
              output: error instanceof Error ? error.message : String(error),
            });
          });
        return;
      }

      if (request.method === "PUT") {
        let body = "";
        request.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
        });
        request.on("end", () => {
          void Promise.resolve()
            .then(() => JSON.parse(body) as { text?: unknown })
            .then((payload) => {
              if (typeof payload.text !== "string") {
                throw new Error("Missing rule file text");
              }
              return writeProjectRuleFile({ ...options, file, text: payload.text });
            })
            .then((result) => writeJson(response, 200, result))
            .catch((error: unknown) => {
              writeJson(response, 400, {
                ok: false,
                output: error instanceof Error ? error.message : String(error),
              });
            });
        });
        return;
      }

      writeJson(response, 405, { ok: false, output: "Method not allowed" });
      return;
    }

    if (url.pathname === "/api/catalog/sources") {
      void readProjectConfigFile(options)
        .then(({ config }) => listCatalogSources({ ...options, origins: catalogOriginsFromConfig(config) }))
        .then((sources) => writeJson(response, 200, { sources }))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/catalog/entries") {
      const origin = url.searchParams.get("origin") ?? "domain-list-community";
      void readProjectConfigFile(options)
        .then(({ config }) => listCatalogEntries({ ...options, origin, origins: catalogOriginsFromConfig(config) }))
        .then((entries) => writeJson(response, 200, { entries }))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/catalog/entry") {
      const origin = url.searchParams.get("origin") ?? "domain-list-community";
      const name = url.searchParams.get("name") ?? "";
      void readProjectConfigFile(options)
        .then(({ config }) => readCatalogEntry({ ...options, origin, name, origins: catalogOriginsFromConfig(config) }))
        .then((detail) => writeJson(response, 200, detail))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/catalog/domains") {
      const origin = url.searchParams.get("origin") ?? "domain-list-community";
      const name = url.searchParams.get("name") ?? "";
      void readProjectConfigFile(options)
        .then(({ config }) =>
          readCatalogEntryDomains({ ...options, origin, name, origins: catalogOriginsFromConfig(config) }),
        )
        .then((domains) => writeJson(response, 200, { domains }))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/catalog/template") {
      const origin = url.searchParams.get("origin") ?? "";
      const name = url.searchParams.get("name") ?? "";
      void readProjectConfigFile(options)
        .then(({ config }) =>
          readCatalogTemplate({ ...options, origin, name, origins: catalogOriginsFromConfig(config) }),
        )
        .then((template) => writeJson(response, 200, template))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/vendor/add") {
      if (request.method !== "POST") {
        writeJson(response, 405, { ok: false, output: "Method not allowed" });
        return;
      }
      let body = "";
      request.on("data", (chunk: Buffer) => {
        body += chunk.toString("utf8");
      });
      request.on("end", () => {
        void Promise.resolve()
          .then(() => JSON.parse(body) as { repo?: RouteKitProjectConfig["vendorRepos"][number] })
          .then((payload) => {
            if (!payload.repo) {
              throw new Error("Missing repo");
            }
            return readProjectConfigFile(options).then(({ config }) =>
              writeProjectConfigFile({ ...options, config: addVendorRepo(config, payload.repo!) }),
            );
          })
          .then((result) => writeJson(response, 200, result))
          .catch((error: unknown) => {
            writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) });
          });
      });
      return;
    }

    if (url.pathname === "/api/git/remote") {
      void readGitRemote(options)
        .then((remote) => writeJson(response, 200, { url: remote }))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (!url.pathname.startsWith("/api/actions/")) {
      next();
      return;
    }

    if (request.method !== "POST") {
      writeJson(response, 405, { ok: false, output: "Method not allowed" });
      return;
    }

    const action = parseRouteKitAction(url.pathname);
    if (!action) {
      writeJson(response, 404, { ok: false, output: "Unknown action" });
      return;
    }

    const only = url.searchParams.get("name") ?? undefined;
    void runRouteKitAction(action, only ? { ...options, only } : options)
      .then((result) => writeJson(response, result.ok ? 200 : 422, result))
      .catch((error: unknown) => {
        writeJson(response, 500, {
          action,
          ok: false,
          output: error instanceof Error ? error.message : String(error),
        });
      });
  };
}
