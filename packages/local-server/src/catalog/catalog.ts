import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  convertDomainListCommunity,
  parseDomainListEntry,
  type DomainListEntryInfo,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";
import type { ProjectOptions, ReadText } from "../config/configRepository.js";
import { listProjectRuleFiles } from "../rules/ruleFiles.js";

export type { ReadText };

export type ReadDirectory = (directory: string) => Promise<string[]>;

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

export interface CatalogEntriesOptions extends ProjectOptions {
  origin: string;
  readDirectory?: ReadDirectory;
  origins?: CatalogOriginDef[];
}

export interface CatalogEntryOptions extends ProjectOptions {
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

export interface CatalogSourcesOptions extends ProjectOptions {
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

function catalogDataDir(options: ProjectOptions & { origins?: CatalogOriginDef[] }, origin: string): string {
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
