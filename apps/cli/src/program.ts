import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  collectDomainProviderRules,
  convertDomainListCommunity,
  generateDomainProvider,
  renderIni,
  summarizeDomainProvider,
  type DomainProviderRule,
  type DomainProviderSummary,
  type RouteKitProjectConfig,
  type RuleProviderSource,
  type SourceBase,
  type VendorRepoConfig,
} from "@clash-route-kit/core";
import YAML from "yaml";

const execFileAsync = promisify(execFile);

export interface ProgramOptions {
  root: string;
  configFile: string;
}

export interface SourceContributionSummary {
  name: string;
  type: RuleProviderSource["type"];
  inputRules: number;
  domainRules: number;
}

export interface ProviderOutputSummary extends DomainProviderSummary {
  name: string;
  output: string;
  path: string;
  sources: SourceContributionSummary[];
}

export interface DuplicateRuleSummary {
  rule: string;
  sources: string[];
}

export interface ProviderDuplicateSummary {
  provider: string;
  rules: DuplicateRuleSummary[];
}

export interface ProviderOverlapSummary {
  rule: string;
  providers: string[];
}

export interface GenerateResult {
  templatePath: string;
  rulePaths: string[];
  reportPath: string;
  providers: ProviderOutputSummary[];
  duplicates: ProviderDuplicateSummary[];
  overlaps: ProviderOverlapSummary[];
}

export interface VendorSyncResult {
  name: string;
  action: "clone" | "pull";
  path: string;
}

export interface SyncVendorOptions extends ProgramOptions {
  runGit?: (args: string[], cwd: string) => Promise<void>;
}

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
  const config = await readConfig(options);
  const repos = readVendorRepos(config, options.configFile);
  const results: VendorSyncResult[] = [];
  await mkdir(path.join(options.root, "vendor"), { recursive: true });

  for (const repo of repos) {
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

function readVendorRepos(config: RouteKitProjectConfig, configFile: string): VendorRepoConfig[] {
  if (!Array.isArray(config.vendorRepos)) {
    throw new Error(`Missing vendorRepos in ${configFile}`);
  }

  return config.vendorRepos;
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

async function readLocalGeositeTags(root: string): Promise<Set<string> | null> {
  const dataPath = path.join(root, "vendor/domain-list-community/data");
  if (!existsSync(dataPath)) return null;

  const entries = await readdir(dataPath, { withFileTypes: true });
  return new Set(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name),
  );
}

function sourceLabel(source: RuleProviderSource): string {
  if (source.type === "domain-list-community") {
    return `domain-list-community:${source.entry}`;
  }
  return source.path;
}

function duplicateRulesBySource(
  provider: string,
  sourceRules: Array<{ source: string; rules: DomainProviderRule[] }>,
): ProviderDuplicateSummary | null {
  const rulesByKey = new Map<string, { rule: string; sources: string[] }>();
  for (const source of sourceRules) {
    for (const rule of source.rules) {
      const existing = rulesByKey.get(rule.key) ?? { rule: rule.rule, sources: [] };
      existing.sources.push(source.source);
      rulesByKey.set(rule.key, existing);
    }
  }

  const duplicateRules = [...rulesByKey.values()]
    .filter((rule) => rule.sources.length > 1)
    .map((rule) => ({
      rule: rule.rule,
      sources: rule.sources.sort(),
    }))
    .sort((left, right) => left.rule.localeCompare(right.rule));

  return duplicateRules.length > 0 ? { provider, rules: duplicateRules } : null;
}

function overlapRulesByProvider(
  providerRules: Array<{ provider: string; rules: DomainProviderRule[] }>,
): ProviderOverlapSummary[] {
  const rulesByKey = new Map<string, { rule: string; providers: string[] }>();
  for (const provider of providerRules) {
    for (const rule of provider.rules) {
      const existing = rulesByKey.get(rule.key) ?? { rule: rule.rule, providers: [] };
      existing.providers.push(provider.provider);
      rulesByKey.set(rule.key, existing);
    }
  }

  return [...rulesByKey.values()]
    .filter((rule) => rule.providers.length > 1)
    .map((rule) => ({
      rule: rule.rule,
      providers: rule.providers.sort(),
    }))
    .sort((left, right) => left.rule.localeCompare(right.rule));
}

export async function generateOutputs(options: ProgramOptions): Promise<GenerateResult> {
  const config = await readConfig(options);
  const templatePath = path.join(options.root, "output/templates", config.template.output);
  const reportPath = path.join(options.root, "output/reports/rule-report.json");
  await mkdir(path.dirname(templatePath), { recursive: true });
  await writeFile(templatePath, renderIni(config), "utf8");

  const rulePaths: string[] = [];
  const providers: ProviderOutputSummary[] = [];
  const duplicates: ProviderDuplicateSummary[] = [];
  const finalProviderRules: Array<{ provider: string; rules: DomainProviderRule[] }> = [];
  for (const provider of config.ruleProviders ?? []) {
    const rules: string[] = [];
    const sources: SourceContributionSummary[] = [];
    const sourceRulesForReport: Array<{ source: string; rules: DomainProviderRule[] }> = [];
    for (const source of provider.sources) {
      const sourceRules = await readRules(options.root, source);
      const sourceSummary = summarizeDomainProvider({
        source: sourceLabel(source),
        rules: sourceRules,
      });
      sourceRulesForReport.push({
        source: source.name,
        rules: collectDomainProviderRules({
          source: sourceLabel(source),
          rules: sourceRules,
        }),
      });
      sources.push({
        name: source.name,
        type: source.type,
        inputRules: sourceSummary.inputRules,
        domainRules: sourceSummary.domainRules,
      });
      rules.push(...sourceRules);
    }

    const rulePath = path.join(options.root, "output/rules", provider.output);
    await mkdir(path.dirname(rulePath), { recursive: true });
    const exclude = [
      ...(provider.exclude ?? []),
      ...(provider.remove ?? []),
    ];
    await writeFile(
      rulePath,
      generateDomainProvider({
        source: provider.sources.map(sourceLabel).join(", "),
        rules,
        exclude,
      }),
      "utf8",
    );
    rulePaths.push(rulePath);
    const duplicateSummary = duplicateRulesBySource(provider.name, sourceRulesForReport);
    if (duplicateSummary) duplicates.push(duplicateSummary);
    finalProviderRules.push({
      provider: provider.name,
      rules: collectDomainProviderRules({
        source: provider.name,
        rules,
        exclude,
      }),
    });
    providers.push({
      name: provider.name,
      output: provider.output,
      path: rulePath,
      ...summarizeDomainProvider({
        source: provider.name,
        rules,
        exclude,
      }),
      sources,
    });
  }

  const overlaps = overlapRulesByProvider(finalProviderRules);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        providers,
        duplicates,
        overlaps,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    templatePath,
    rulePaths,
    reportPath,
    providers,
    duplicates,
    overlaps,
  };
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
  const geositeTags = await readLocalGeositeTags(options.root);
  const diagnostics: string[] = [];

  for (const module of config.modules) {
    if (module.enabled === false) continue;
    if (!groupNames.has(module.policy)) {
      diagnostics.push(`Module ${module.id} references missing policy group: ${module.policy}`);
    }
    if (geositeTags) {
      for (const tag of module.geosite ?? []) {
        if (!geositeTags.has(tag)) {
          diagnostics.push(`Module ${module.id} references missing geosite tag: ${tag}`);
        }
      }
    }
  }
  if (!groupNames.has(config.final.policy)) {
    diagnostics.push(`Final references missing policy group: ${config.final.policy}`);
  }

  return diagnostics;
}
