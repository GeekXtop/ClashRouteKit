import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  collectRuleProviderRules,
  convertDomainListCommunity,
  generateRuleProvider,
  renderIni,
  summarizeRuleProvider,
  type ProviderRule,
  type ProviderSummary,
  type RuleProviderSource,
  type SourceBase,
} from "@clash-route-kit/core";
import YAML from "yaml";
import { readConfig, type ProjectOptions } from "../config/configRepository.js";
import { assertNoErrors, projectDiagnostics } from "../check/checkConfig.js";

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

function resolveBasePath(root: string, source: SourceBase, fallbackBasePath?: string): string {
  if (source.basePath) return resolveInputPath(root, source.basePath);
  if (fallbackBasePath) return resolveInputPath(root, fallbackBasePath);
  return root;
}

export function resolveInputPath(root: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(root, inputPath);
}

function resolveSourceFile(root: string, source: SourceBase, sourcePath: string): string {
  if (path.isAbsolute(sourcePath)) return sourcePath;
  return path.join(resolveBasePath(root, source), sourcePath);
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

/** generate 用例：诊断门禁通过后写模板 INI、provider YAML 与规则报告。 */
export async function generateOutputs(options: ProjectOptions): Promise<GenerateResult> {
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
