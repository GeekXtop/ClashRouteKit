import { execFile } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  ConfigDiagnosticError,
  convertDomainListCommunity,
  formatDiagnostic,
  hasDiagnosticErrors,
  parseDomainListEntry,
  parseRouteKitConfig,
  serializeRouteKitConfig,
  validateLegacyProjectConfig,
  type Diagnostic,
  type DomainListEntryInfo,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";
import {
  checkConfig,
  generateOutputs,
  syncVendor,
  type GenerateResult,
  type ProgramOptions,
} from "./program.js";
import { addVendorRepo, removeVendorRepo, updateVendorRepo } from "@clash-route-kit/core";
import type { VendorRepoConfig } from "@clash-route-kit/core";

const execFileAsync = promisify(execFile);

export type RouteKitAction = "check" | "generate" | "sync-vendor" | "git-status" | "git-commit" | "git-push";

export interface RouteKitActionResult {
  action: RouteKitAction;
  ok: boolean;
  output: string;
  diagnostics?: Diagnostic[];
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
type RemovePath = (filePath: string) => Promise<void>;

export interface ProjectConfigFileOptions extends ProgramOptions {
  readText?: ReadText;
  statMtime?: (filePath: string) => Promise<number>;
}

export interface WriteProjectConfigFileOptions extends ProgramOptions {
  config: RouteKitProjectConfig;
  writeText?: WriteText;
  statMtime?: (filePath: string) => Promise<number>;
}

export interface ProjectConfigFileResult {
  yaml: string;
  config: RouteKitProjectConfig;
  mtime: number;
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

export interface DeleteProjectRuleFileOptions extends ProgramOptions {
  file: string;
  removePath?: RemovePath;
}

export interface ProjectRuleFileResult {
  file: string;
  text: string;
}

export interface DeleteProjectRuleFileResult {
  file: string;
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
  const statMtime =
    options.statMtime ?? ((filePath: string) => stat(filePath).then((info) => info.mtimeMs).catch(() => 0));
  const configPath = projectConfigPath(options);
  const yaml = await readText(configPath);
  return {
    yaml,
    config: parseRouteKitConfig(yaml),
    mtime: await statMtime(configPath),
  };
}

export async function writeProjectConfigFile(
  options: WriteProjectConfigFileOptions,
): Promise<ProjectConfigFileResult> {
  const writeText = options.writeText ?? ((filePath: string, text: string) => writeFile(filePath, text, "utf8"));
  const statMtime =
    options.statMtime ?? ((filePath: string) => stat(filePath).then((info) => info.mtimeMs).catch(() => 0));
  const diagnostics = validateLegacyProjectConfig(options.config);
  if (hasDiagnosticErrors(diagnostics)) {
    throw new ConfigDiagnosticError(diagnostics);
  }
  const yaml = serializeRouteKitConfig(options.config);
  const configPath = projectConfigPath(options);
  await writeText(configPath, yaml);
  return {
    yaml,
    config: options.config,
    mtime: await statMtime(configPath),
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

export async function deleteProjectRuleFile(
  options: DeleteProjectRuleFileOptions,
): Promise<DeleteProjectRuleFileResult> {
  const removePath = options.removePath ?? ((filePath: string) => rm(filePath, { force: true }));
  await removePath(resolveRuleFile(options, options.file));
  return { file: options.file };
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
  const fromConfig: CatalogOriginDef[] = [];
  for (const repo of config.vendorRepos) {
    if (repo.catalog) {
      fromConfig.push({ id: repo.name, label: repo.name, kind: repo.catalog.kind, dir: repo.catalog.dir });
    }
    if (repo.templateDir) {
      fromConfig.push({
        id: `${repo.name}::templates`,
        label: `${repo.name} · 模板`,
        kind: "ini-template",
        dir: repo.templateDir,
      });
    }
  }
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

/** Run `fn` over `items` with a bounded number of in-flight promises (avoids EMFILE on huge dirs). */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, worker));
  return results;
}

export async function listCatalogEntries(options: CatalogEntriesOptions): Promise<string[]> {
  const def = catalogOrigin(options.origin, options.origins);
  const readDirectory = options.readDirectory ?? ((directory: string) => readdir(directory));
  let entries: string[];
  try {
    entries = await readDirectory(catalogDataDir(options, options.origin));
  } catch {
    // 数据目录不存在（未同步 / 同步失败）→ 返回空而非抛错，避免前端 "Invalid catalog entries response"
    return [];
  }
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

export interface CatalogEntryMeta {
  name: string;
  hasChildren: boolean;
  /** Not referenced by any other entry's include: — i.e. a top of the include graph. */
  root: boolean;
}

export async function listCatalogEntriesWithMeta(
  options: CatalogEntriesOptions & { readText?: ReadText },
): Promise<CatalogEntryMeta[]> {
  const def = catalogOrigin(options.origin, options.origins);
  const names = await listCatalogEntries(options);
  if (def.kind !== "domain-list") {
    return names.map((name) => ({ name, hasChildren: false, root: true }));
  }
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  const dir = catalogDataDir(options, options.origin);
  // Bounded concurrency: reading ~1500 files via Promise.all can exhaust file handles
  // on Windows, and failed reads would silently mark entries as childless (breaking nesting).
  const parsed = await mapWithConcurrency(names, 24, async (name) => {
    try {
      return { name, includes: parseDomainListEntry(await readText(path.join(dir, name))).includes };
    } catch {
      return { name, includes: [] as string[] };
    }
  });
  // An entry is a "root" only if no other entry pulls it in via include: — so sub-categories
  // (e.g. category-ads, included by category-ads-all) are nested, never duplicated at top level.
  const included = new Set<string>();
  for (const entry of parsed) {
    for (const name of entry.includes) included.add(name);
  }
  return parsed.map((entry) => ({
    name: entry.name,
    hasChildren: entry.includes.length > 0,
    root: !included.has(entry.name),
  }));
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

// ---- catalog search: match entry name + the entry's own domains (reverse lookup) ----

export interface CatalogSearchHit {
  name: string;
  matchedDomains: string[];
}

interface CatalogIndexRow {
  name: string;
  domains: string[];
}

const catalogIndexCache = new Map<string, CatalogIndexRow[]>();
const catalogGraphCache = new Map<string, CatalogGraph>();

/** Drop cached search indexes / include graphs (call after sync / vendor changes). */
export function clearCatalogIndexCache(origin?: string): void {
  if (origin) {
    catalogIndexCache.delete(origin);
    catalogGraphCache.delete(origin);
  } else {
    catalogIndexCache.clear();
    catalogGraphCache.clear();
  }
}

/** The entry's own domain tokens, WITHOUT expanding include: (cheap, what the file itself lists). */
function domainListOwnTokens(content: string): string[] {
  const tokens: string[] = [];
  for (const rawLine of content.replace(/\r\n?/g, "\n").split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const head = trimmed.split(/\s+/)[0]!;
    if (head.startsWith("include:") || head.startsWith("regexp:")) continue;
    if (head.startsWith("full:")) tokens.push(head.slice("full:".length));
    else if (head.startsWith("domain:")) tokens.push(head.slice("domain:".length));
    else if (head.startsWith("keyword:")) tokens.push(head.slice("keyword:".length));
    else if (!head.includes(":")) tokens.push(head);
  }
  return tokens;
}

async function entryOwnTokens(
  def: CatalogOriginDef,
  dir: string,
  name: string,
  readText: ReadText,
): Promise<string[]> {
  if (def.kind === "list-dir") {
    return listRules(await readText(path.join(dir, `${name}.list`))).map((rule) => rule.split(",").pop() ?? rule);
  }
  if (def.kind === "provider-yaml") {
    return parseProviderPayload(await readText(path.join(dir, `${name}.yaml`)));
  }
  if (def.kind === "domain-list") {
    return domainListOwnTokens(await readText(path.join(dir, name)));
  }
  return [];
}

async function buildCatalogIndex(
  options: CatalogEntriesOptions & { readText?: ReadText },
): Promise<CatalogIndexRow[]> {
  const def = catalogOrigin(options.origin, options.origins);
  const names = await listCatalogEntries(options);
  const dir = catalogDataDir(options, options.origin);
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  return mapWithConcurrency(names, 24, async (name) => {
    try {
      return { name, domains: (await entryOwnTokens(def, dir, name, readText)).map((token) => token.toLowerCase()) };
    } catch {
      return { name, domains: [] as string[] };
    }
  });
}

export interface CatalogSearchOptions extends CatalogEntriesOptions {
  query: string;
  readText?: ReadText;
  limit?: number;
  cache?: Map<string, CatalogIndexRow[]>;
}

export async function searchCatalog(options: CatalogSearchOptions): Promise<CatalogSearchHit[]> {
  const query = options.query.trim().toLowerCase();
  if (!query) return [];
  const cache = options.cache ?? catalogIndexCache;
  let index = cache.get(options.origin);
  if (!index) {
    index = await buildCatalogIndex(options);
    cache.set(options.origin, index);
  }
  const limit = options.limit ?? 200;
  const hits: CatalogSearchHit[] = [];
  for (const row of index) {
    const matchedDomains = row.domains.filter((domain) => domain.includes(query)).slice(0, 5);
    if (row.name.toLowerCase().includes(query) || matchedDomains.length > 0) {
      hits.push({ name: row.name, matchedDomains });
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

// ---- include graph: locate an entry's ancestry path from a root category ----

interface CatalogGraph {
  includes: Map<string, string[]>;
  roots: string[];
}

async function buildCatalogGraph(
  options: CatalogEntriesOptions & { readText?: ReadText },
): Promise<CatalogGraph> {
  const def = catalogOrigin(options.origin, options.origins);
  const names = await listCatalogEntries(options);
  if (def.kind !== "domain-list") {
    return { includes: new Map(), roots: names };
  }
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  const dir = catalogDataDir(options, options.origin);
  const parsed = await mapWithConcurrency(names, 24, async (name) => {
    try {
      return { name, includes: parseDomainListEntry(await readText(path.join(dir, name))).includes };
    } catch {
      return { name, includes: [] as string[] };
    }
  });
  const includes = new Map<string, string[]>();
  const included = new Set<string>();
  for (const entry of parsed) {
    includes.set(entry.name, entry.includes);
    for (const name of entry.includes) included.add(name);
  }
  return { includes, roots: parsed.filter((entry) => !included.has(entry.name)).map((entry) => entry.name) };
}

export interface CatalogPathOptions extends CatalogEntriesOptions {
  name: string;
  readText?: ReadText;
  graphCache?: Map<string, CatalogGraph>;
}

/**
 * Shortest include path from a top-level (`category-*`) root to `name`, inclusive.
 * Returns [] when the entry is not reachable from any category root (e.g. an orphan list).
 */
export async function findCatalogPath(options: CatalogPathOptions): Promise<string[]> {
  const cache = options.graphCache ?? catalogGraphCache;
  let graph = cache.get(options.origin);
  if (!graph) {
    graph = await buildCatalogGraph(options);
    cache.set(options.origin, graph);
  }
  const sources = graph.roots.filter((root) => root.startsWith("category-"));
  const queue: string[][] = sources.map((root) => [root]);
  const visited = new Set<string>(sources);
  while (queue.length > 0) {
    const trail = queue.shift()!;
    const last = trail[trail.length - 1]!;
    if (last === options.name) return trail;
    for (const include of graph.includes.get(last) ?? []) {
      if (visited.has(include)) continue;
      visited.add(include);
      queue.push([...trail, include]);
    }
  }
  return [];
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

export interface VendorRepoMutationOptions extends ProgramOptions {
  readText?: ReadText;
  writeText?: WriteText;
  statMtime?: (filePath: string) => Promise<number>;
  removePath?: (filePath: string) => Promise<void>;
}

/** Delete a directory under vendor/, refusing anything outside it (or vendor/ itself). */
async function clearVendorDirectory(
  options: ProgramOptions & { removePath?: (filePath: string) => Promise<void> },
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

function formatGenerateOutput(result: GenerateResult): string {
  const lines = [`[generate] template: ${result.templatePath}`];
  for (const provider of result.providers) {
    const sources = provider.sources
      .map((source) => `${source.name}:${source.outputRules}/${source.inputRules}`)
      .join(", ");
    lines.push(`[generate] rules: ${provider.path}`);
    lines.push(
      `[generate] summary: ${provider.name} output=${provider.outputRules} excluded=${provider.excludedRules} sources=[${sources}]`,
    );
  }
  const duplicateRuleCount = result.duplicates.reduce((count, provider) => count + provider.rules.length, 0);
  lines.push(`[generate] duplicates: providers=${result.duplicates.length} rules=${duplicateRuleCount}`);
  lines.push(`[generate] overlaps: rules=${result.overlaps.length}`);
  lines.push(`[generate] report: ${result.reportPath}`);
  return lines.join("\n");
}

function formatCheckOutput(diagnostics: readonly Diagnostic[]): string {
  return diagnostics.length === 0
    ? "[check] ok"
    : diagnostics.map((diagnostic) => `[check] ${formatDiagnostic(diagnostic)}`).join("\n");
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
      ok: !hasDiagnosticErrors(diagnostics),
      output: formatCheckOutput(diagnostics),
      diagnostics,
    };
  }

  if (action === "sync-vendor") {
    const results = await syncVendor(options);
    clearCatalogIndexCache();
    const lines = results.map((result) =>
      result.action === "error"
        ? `[sync-vendor] error: ${result.name} -> ${result.error ?? "unknown error"}`
        : `[sync-vendor] ${result.action}: ${result.name} -> ${result.path}`,
    );
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
    const diagnostics = await (options.checkConfig ?? checkConfig)(options);
    if (hasDiagnosticErrors(diagnostics)) {
      return {
        action,
        ok: false,
        output: formatCheckOutput(diagnostics),
        diagnostics,
      };
    }
    const output = await runCommand("git", ["push"], options.root);
    return {
      action,
      ok: true,
      output: output || "[git] pushed current branch",
      diagnostics,
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

      if (request.method === "DELETE") {
        void deleteProjectRuleFile({ ...options, file })
          .then((result) => writeJson(response, 200, result))
          .catch((error: unknown) => {
            writeJson(response, 400, {
              ok: false,
              output: error instanceof Error ? error.message : String(error),
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
        .then(({ config }) =>
          listCatalogEntriesWithMeta({ ...options, origin, origins: catalogOriginsFromConfig(config) }),
        )
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

    if (url.pathname === "/api/catalog/search") {
      const origin = url.searchParams.get("origin") ?? "";
      const query = url.searchParams.get("q") ?? "";
      void readProjectConfigFile(options)
        .then(({ config }) =>
          searchCatalog({ ...options, origin, query, origins: catalogOriginsFromConfig(config) }),
        )
        .then((hits) => writeJson(response, 200, { hits }))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/catalog/path") {
      const origin = url.searchParams.get("origin") ?? "";
      const name = url.searchParams.get("name") ?? "";
      void readProjectConfigFile(options)
        .then(({ config }) =>
          findCatalogPath({ ...options, origin, name, origins: catalogOriginsFromConfig(config) }),
        )
        .then((catalogPath) => writeJson(response, 200, { path: catalogPath }))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/vendor/add" || url.pathname === "/api/vendor/update") {
      if (request.method !== "POST") {
        writeJson(response, 405, { ok: false, output: "Method not allowed" });
        return;
      }
      const isUpdate = url.pathname === "/api/vendor/update";
      let body = "";
      request.on("data", (chunk: Buffer) => {
        body += chunk.toString("utf8");
      });
      request.on("end", () => {
        void Promise.resolve()
          .then(() => JSON.parse(body) as { name?: string; input?: VendorRepoInput })
          .then((payload) => {
            if (!payload.input) {
              throw new Error("Missing input");
            }
            if (isUpdate) {
              if (!payload.name) {
                throw new Error("Missing name");
              }
              return updateProjectVendorRepo({ ...options, name: payload.name, input: payload.input });
            }
            return addProjectVendorRepo({ ...options, input: payload.input });
          })
          .then((result) => {
            clearCatalogIndexCache();
            writeJson(response, 200, result);
          })
          .catch((error: unknown) => {
            writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) });
          });
      });
      return;
    }

    if (url.pathname === "/api/vendor/remove") {
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
          .then(() => JSON.parse(body) as { name?: string })
          .then((payload) => {
            if (!payload.name) {
              throw new Error("Missing name");
            }
            return removeProjectVendorRepo({ ...options, name: payload.name });
          })
          .then((result) => {
            clearCatalogIndexCache();
            writeJson(response, 200, result);
          })
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
