import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  convertDomainListCommunity,
  generateDomainProvider,
  renderIni,
  type RouteKitProjectConfig,
  type RuleProviderSource,
  type SourceBase,
} from "@clash-route-kit/core";
import YAML from "yaml";

const execFileAsync = promisify(execFile);

export interface ProgramOptions {
  root: string;
  configFile: string;
}

export interface GenerateResult {
  templatePath: string;
  rulePaths: string[];
}

export interface VendorRepo {
  name: string;
  url: string;
  path: string;
}

export interface VendorSyncResult {
  name: string;
  action: "clone" | "pull";
  path: string;
}

export interface SyncVendorOptions {
  root: string;
  runGit?: (args: string[], cwd: string) => Promise<void>;
}

export const vendorRepos: VendorRepo[] = [
  {
    name: "domain-list-community",
    url: "https://github.com/v2fly/domain-list-community.git",
    path: "vendor/domain-list-community",
  },
  {
    name: "ACL4SSR",
    url: "https://github.com/ACL4SSR/ACL4SSR.git",
    path: "vendor/ACL4SSR",
  },
  {
    name: "Rules",
    url: "https://github.com/dler-io/Rules.git",
    path: "vendor/Rules",
  },
];

function resolveBasePath(root: string, source: SourceBase, fallbackBasePath?: string): string {
  if (source.basePath) return resolveInputPath(root, source.basePath);
  if (fallbackBasePath) return resolveInputPath(root, fallbackBasePath);
  return root;
}

async function defaultRunGit(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

export async function syncVendor(options: SyncVendorOptions): Promise<VendorSyncResult[]> {
  const runGit = options.runGit ?? defaultRunGit;
  const results: VendorSyncResult[] = [];
  await mkdir(path.join(options.root, "vendor"), { recursive: true });

  for (const repo of vendorRepos) {
    const repoPath = path.join(options.root, repo.path);
    const gitDir = path.join(repoPath, ".git");
    if (existsSync(gitDir)) {
      await runGit(["-C", repoPath, "pull", "--ff-only"], options.root);
      results.push({ name: repo.name, action: "pull", path: repoPath });
      continue;
    }

    if (existsSync(repoPath)) {
      throw new Error(`Vendor path exists but is not a git repository: ${repoPath}`);
    }

    await runGit(["clone", "--depth", "1", repo.url, repoPath], options.root);
    results.push({ name: repo.name, action: "clone", path: repoPath });
  }

  return results;
}

function resolveInputPath(root: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(root, inputPath);
}

function resolveSourceFile(root: string, source: SourceBase, sourcePath: string): string {
  if (path.isAbsolute(sourcePath)) return sourcePath;
  return path.join(resolveBasePath(root, source), sourcePath);
}

export function resolveProjectRoot(start: string, configFile: string): string {
  if (path.isAbsolute(configFile)) {
    return path.dirname(configFile);
  }

  let current = path.resolve(start);
  while (true) {
    if (existsSync(path.join(current, configFile))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(start);
    }
    current = parent;
  }
}

async function readConfig(options: ProgramOptions): Promise<RouteKitProjectConfig> {
  const text = await readFile(path.join(options.root, options.configFile), "utf8");
  const config = YAML.parse(text) as RouteKitProjectConfig;
  const publishBaseUrl = process.env.CLASH_ROUTE_KIT_PUBLISH_BASE_URL;
  return publishBaseUrl ? { ...config, publishBaseUrl } : config;
}

async function readClashList(root: string, source: Extract<RuleProviderSource, { type: "clash-list" }>): Promise<string[]> {
  const text = await readFile(resolveSourceFile(root, source, source.path), "utf8");
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

async function readClashProvider(root: string, source: Extract<RuleProviderSource, { type: "clash-provider" }>): Promise<string[]> {
  const text = await readFile(resolveSourceFile(root, source, source.path), "utf8");
  const parsed = YAML.parse(text) as { payload?: unknown };
  if (!Array.isArray(parsed.payload)) return [];
  return parsed.payload.filter((entry): entry is string => typeof entry === "string");
}

async function readDomainListCommunity(root: string, source: Extract<RuleProviderSource, { type: "domain-list-community" }>): Promise<string[]> {
  const basePath = resolveBasePath(root, source, "vendor/domain-list-community/data");
  const entryPath = path.join(basePath, source.entry);
  const sourceUrl = pathToFileURL(entryPath).toString();

  return convertDomainListCommunity(await readFile(entryPath, "utf8"), {
    sourceUrl,
    fetchText: async (url) => readFile(fileURLToPath(url), "utf8"),
  });
}

async function readRules(root: string, source: RuleProviderSource): Promise<string[]> {
  if (source.type === "clash-list") {
    return readClashList(root, source);
  }
  if (source.type === "clash-provider") {
    return readClashProvider(root, source);
  }
  if (source.type === "domain-list-community") {
    return readDomainListCommunity(root, source);
  }

  throw new Error(`Unsupported rule provider source type: ${(source satisfies never)}`);
}

function sourceLabel(source: RuleProviderSource): string {
  if (source.type === "domain-list-community") {
    return `domain-list-community:${source.entry}`;
  }
  return source.path;
}

export async function generateOutputs(options: ProgramOptions): Promise<GenerateResult> {
  const config = await readConfig(options);
  const templatePath = path.join(options.root, "output/templates", config.template.output);
  await mkdir(path.dirname(templatePath), { recursive: true });
  await writeFile(templatePath, renderIni(config), "utf8");

  const rulePaths: string[] = [];
  for (const provider of config.ruleProviders ?? []) {
    const rules: string[] = [];
    for (const source of provider.sources) {
      rules.push(...(await readRules(options.root, source)));
    }

    const rulePath = path.join(options.root, "output/rules", provider.output);
    await mkdir(path.dirname(rulePath), { recursive: true });
    await writeFile(
      rulePath,
      generateDomainProvider({
        source: provider.sources.map(sourceLabel).join(", "),
        rules,
      }),
      "utf8",
    );
    rulePaths.push(rulePath);
  }

  return { templatePath, rulePaths };
}

export async function previewRules(options: ProgramOptions): Promise<string[]> {
  const config = await readConfig(options);
  const lines: string[] = [];
  for (const module of config.modules) {
    if (module.enabled === false) continue;
    for (const provider of module.providers ?? []) {
      lines.push(`${provider.behavior.toUpperCase()} ${provider.file} -> ${module.policy}`);
    }
    for (const tag of module.geosite ?? []) {
      lines.push(`GEOSITE ${tag} -> ${module.policy}`);
    }
    for (const tag of module.geoip ?? []) {
      lines.push(`GEOIP ${tag} -> ${module.policy}`);
    }
  }
  lines.push(`FINAL -> ${config.final.policy}`);
  return lines;
}

export async function checkConfig(options: ProgramOptions): Promise<string[]> {
  const config = await readConfig(options);
  const groupNames = new Set(config.proxyGroups.map((group) => group.name));
  const diagnostics: string[] = [];

  for (const module of config.modules) {
    if (module.enabled === false) continue;
    if (!groupNames.has(module.policy)) {
      diagnostics.push(`Module ${module.id} references missing policy group: ${module.policy}`);
    }
  }
  if (!groupNames.has(config.final.policy)) {
    diagnostics.push(`Final references missing policy group: ${config.final.policy}`);
  }

  return diagnostics;
}
