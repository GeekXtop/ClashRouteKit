import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ConfigDiagnosticError,
  collectRuleProviderRules,
  convertDomainListCommunity,
  generateRuleProvider,
  hasDiagnosticErrors,
  parseAuthorProjectConfig,
  parseIniToConfig,
  parseRouteKitConfig,
  planLegacyMigration,
  renderIni,
  serializeRouteKitConfig,
  summarizeRuleProvider,
  validateLegacyProjectConfig,
  type Diagnostic,
  type ImportedConfig,
  type MigrationPlan,
  type ProviderRule,
  type ProviderSummary,
  type RouteKitProjectConfig,
  type RuleProviderSource,
  type SourceBase,
  type VendorRepoConfig,
} from "@clash-route-kit/core";
import YAML from "yaml";
import { validateLegacyWorkspace } from "./workspaceValidation.js";

const execFileAsync = promisify(execFile);

export interface ProgramOptions {
  root: string;
  configFile: string;
}

export interface SourceContributionSummary {
  name: string;
  type: RuleProviderSource["type"];
  inputRules: number;
  outputRules: number;
}

export interface ProviderOutputSummary extends ProviderSummary {
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
  action: "clone" | "pull" | "error";
  path: string;
  error?: string;
}

export interface SyncVendorOptions extends ProgramOptions {
  runGit?: (args: string[], cwd: string) => Promise<void>;
  only?: string;
}

export interface SubconverterUrlOptions extends ProgramOptions {
  subscriptionUrl?: string;
  subconverterBaseUrl?: string;
  target?: string;
}

function publishTemplateUrl(config: RouteKitProjectConfig): string {
  return `${config.publishBaseUrl.replace(/\/+$/, "")}/templates/${config.template.output}`;
}

function normalizeSubconverterEndpoint(baseUrl?: string): URL {
  const raw = baseUrl?.trim() || "http://127.0.0.1:25500/sub";
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  const endpoint = new URL(withProtocol);
  if (endpoint.pathname === "/" || endpoint.pathname === "") {
    endpoint.pathname = "/sub";
  }
  return endpoint;
}

export async function buildSubconverterUrl(options: SubconverterUrlOptions): Promise<string> {
  const subscriptionUrl = options.subscriptionUrl?.trim();
  if (!subscriptionUrl) {
    throw new Error("Set CLASH_ROUTE_KIT_SUBSCRIPTION_URL before running subconvert-url");
  }

  const config = await readConfig(options);
  const endpoint = normalizeSubconverterEndpoint(options.subconverterBaseUrl);
  endpoint.searchParams.set("target", options.target ?? "clash");
  endpoint.searchParams.set("url", subscriptionUrl);
  endpoint.searchParams.set("config", publishTemplateUrl(config));
  return endpoint.toString();
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
  const selected = options.only ? repos.filter((repo) => repo.name === options.only) : repos;
  const results: VendorSyncResult[] = [];
  await mkdir(path.join(options.root, "vendor"), { recursive: true });

  for (const repo of selected) {
    const repoPath = path.join(options.root, repo.path);
    try {
      const gitDir = path.join(repoPath, ".git");
      if (existsSync(gitDir)) {
        if (repo.branch) {
          await runGit(["-C", repoPath, "fetch", "--depth", "1", "origin", repo.branch], options.root);
          await runGit(["-C", repoPath, "checkout", "-B", repo.branch, "FETCH_HEAD"], options.root);
        } else {
          await runGit(["-C", repoPath, "pull", "--ff-only"], options.root);
        }
        results.push({ name: repo.name, action: "pull", path: repoPath });
        continue;
      }

      if (existsSync(repoPath)) {
        throw new Error(`Vendor path exists but is not a git repository: ${repoPath}`);
      }

      const cloneArgs = ["clone", "--depth", "1"];
      if (repo.branch) cloneArgs.push("--branch", repo.branch);
      cloneArgs.push(repo.url, repoPath);
      await runGit(cloneArgs, options.root);
      results.push({ name: repo.name, action: "clone", path: repoPath });
    } catch (error: unknown) {
      results.push({
        name: repo.name,
        action: "error",
        path: repoPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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

export async function readConfig(options: ProgramOptions): Promise<RouteKitProjectConfig> {
  const text = await readFile(path.join(options.root, options.configFile), "utf8");
  const config = parseRouteKitConfig(text);
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

async function projectDiagnostics(
  options: ProgramOptions,
  config: RouteKitProjectConfig,
): Promise<Diagnostic[]> {
  return [
    ...validateLegacyProjectConfig(config),
    ...await validateLegacyWorkspace(options, config),
  ];
}

function assertNoErrors(diagnostics: readonly Diagnostic[]): void {
  if (hasDiagnosticErrors(diagnostics)) {
    throw new ConfigDiagnosticError(diagnostics);
  }
}

function sourceLabel(source: RuleProviderSource): string {
  if (source.type === "domain-list-community") {
    return `domain-list-community:${source.entry}`;
  }
  return source.path;
}

function duplicateRulesBySource(
  provider: string,
  sourceRules: Array<{ source: string; rules: ProviderRule[] }>,
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
  providerRules: Array<{ provider: string; rules: ProviderRule[] }>,
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
  assertNoErrors(await projectDiagnostics(options, config));
  const templatePath = path.join(options.root, "output/templates", config.template.output);
  const reportPath = path.join(options.root, "output/reports/rule-report.json");
  await mkdir(path.dirname(templatePath), { recursive: true });
  await writeFile(
    templatePath,
    renderIni(config, {
      enableRuleGenerator: config.template.enableRuleGenerator,
      overwriteOriginalRules: config.template.overwriteOriginalRules,
      clashRuleBase: config.template.clashRuleBase,
    }),
    "utf8",
  );

  const rulePaths: string[] = [];
  const providers: ProviderOutputSummary[] = [];
  const duplicates: ProviderDuplicateSummary[] = [];
  const finalProviderRules: Array<{ provider: string; rules: ProviderRule[] }> = [];
  const enabledProviders = (config.ruleProviders ?? [])
    .filter((provider) => provider.enabled !== false);
  for (const provider of enabledProviders) {
    const rules: string[] = [];
    const sources: SourceContributionSummary[] = [];
    const sourceRulesForReport: Array<{ source: string; rules: ProviderRule[] }> = [];
    for (const source of provider.sources) {
      const sourceRules = await readRules(options.root, source);
      const sourceSummary = summarizeRuleProvider(provider.behavior, {
        source: sourceLabel(source),
        rules: sourceRules,
      });
      sourceRulesForReport.push({
        source: source.name,
        rules: collectRuleProviderRules(provider.behavior, {
          source: sourceLabel(source),
          rules: sourceRules,
        }),
      });
      sources.push({
        name: source.name,
        type: source.type,
        inputRules: sourceSummary.inputRules,
        outputRules: sourceSummary.outputRules,
      });
      rules.push(...sourceRules);
    }

    const rulePath = path.join(options.root, "output/rules", provider.output);
    await mkdir(path.dirname(rulePath), { recursive: true });
    const exclude = [
      ...(config.globalRemove ?? []),
      ...(provider.exclude ?? []),
      ...(provider.remove ?? []),
    ];
    await writeFile(
      rulePath,
      generateRuleProvider(provider.behavior, {
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
      rules: collectRuleProviderRules(provider.behavior, {
        source: provider.name,
        rules,
        exclude,
      }),
    });
    providers.push({
      name: provider.name,
      output: provider.output,
      path: rulePath,
      ...summarizeRuleProvider(provider.behavior, {
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

export interface ImportResult extends ImportedConfig {
  scaffoldPath: string;
}

export async function importIni(
  options: ProgramOptions & { iniFile: string },
): Promise<ImportResult> {
  const iniText = await readFile(resolveInputPath(options.root, options.iniFile), "utf8");
  const imported = parseIniToConfig(iniText);

  const scaffold: RouteKitProjectConfig = {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    customProxyGroups: imported.customProxyGroups,
    ruleSets: imported.ruleSets,
    ruleProviders: [],
  };

  const scaffoldPath = path.join(options.root, "output/imported-routes.yaml");
  await mkdir(path.dirname(scaffoldPath), { recursive: true });
  await writeFile(scaffoldPath, serializeRouteKitConfig(scaffold), "utf8");

  return { ...imported, scaffoldPath };
}

export async function previewRules(options: ProgramOptions): Promise<string[]> {
  const config = await readConfig(options);
  const lines: string[] = [];
  let lastSection: string | undefined;
  for (const ruleSet of config.ruleSets) {
    if (ruleSet.enabled === false) continue;
    if (ruleSet.section && ruleSet.section !== lastSection) {
      lines.push(`# ${ruleSet.section}`);
      lastSection = ruleSet.section;
    }

    const source = ruleSet.source;
    if (source.type === "rule-provider") {
      lines.push(`${source.behavior.toUpperCase()} ${source.file} -> ${ruleSet.policy}`);
      continue;
    }
    if (source.type === "geosite") {
      lines.push(`GEOSITE ${source.value} -> ${ruleSet.policy}`);
      continue;
    }
    if (source.type === "geoip") {
      lines.push(`GEOIP ${source.value} -> ${ruleSet.policy}`);
      continue;
    }
    if (source.type === "final") {
      lines.push(`FINAL -> ${ruleSet.policy}`);
      continue;
    }

    const unsupported: never = source;
    throw new Error(`Unsupported ruleSet source: ${String(unsupported)}`);
  }
  return lines;
}

export async function checkConfig(options: ProgramOptions): Promise<Diagnostic[]> {
  const config = await readConfig(options);
  return projectDiagnostics(options, config);
}

export interface MigrateOptions extends ProgramOptions {
  /** true 时把迁移 plan.yaml 原子写入 output/imported-routes-v2.yaml；缺省只读分析。 */
  write?: boolean;
}

export interface MigrateResult {
  /** 输入已是 schemaVersion: 2，无需迁移；plan 为 null 且不写盘。 */
  alreadyV2: boolean;
  plan: MigrationPlan | null;
  /** plan.yaml 的目标路径（只读模式用于提示 --write 的写入位置）。 */
  outputPath: string;
  written: boolean;
}

const MIGRATE_OUTPUT_PATH = path.join("output", "imported-routes-v2.yaml");

/**
 * 临时文件 + rename 的原子替换；rename 失败时清理残留临时文件，目标不受影响。
 */
async function writeFileAtomic(targetPath: string, content: string): Promise<void> {
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, content, "utf8");
  try {
    await rename(tempPath, targetPath);
  } catch (error: unknown) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

/**
 * v1 → v2 迁移的 CLI 入口：读 CLASH_ROUTE_KIT_CONFIG 指向的配置并按
 * schemaVersion 分发。v1 输入运行 planLegacyMigration（只读分析，永不改动
 * 原配置文件）；write 为 true 时把 plan.yaml 原子写入 output/imported-routes-v2.yaml。
 * v2 输入直接返回 alreadyV2，跳过分析与写盘。输入解析失败由
 * parseAuthorProjectConfig 抛出 ConfigDiagnosticError，与非零退出语义一致。
 */
export async function migrateConfig(options: MigrateOptions): Promise<MigrateResult> {
  const configPath = path.join(options.root, options.configFile);
  const outputPath = path.join(options.root, MIGRATE_OUTPUT_PATH);
  const text = await readFile(configPath, "utf8");
  const parsed = parseAuthorProjectConfig(text);
  if (parsed.schemaVersion === 2) {
    return { alreadyV2: true, plan: null, outputPath, written: false };
  }

  const v1Config = parsed.v1;
  if (v1Config === undefined) {
    throw new Error(
      "parseAuthorProjectConfig returned schemaVersion 1 without a v1 config",
    );
  }
  const plan = planLegacyMigration(v1Config);
  if (options.write !== true) {
    return { alreadyV2: false, plan, outputPath, written: false };
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFileAtomic(outputPath, plan.yaml);
  return { alreadyV2: false, plan, outputPath, written: true };
}
