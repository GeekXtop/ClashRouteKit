import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseAuthorProjectConfig,
  parseIniToConfig,
  planLegacyMigration,
  serializeRouteKitConfig,
  type ImportedConfig,
  type MigrationPlan,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";
import {
  readConfig,
  resolveInputPath,
  writeFileAtomic,
  type ProjectOptions as ProgramOptions,
} from "@clash-route-kit/local-server";

// check / generate / sync-vendor 的用例实现已按规格第 8/8.2 节下沉到
// @clash-route-kit/local-server（local-server 承担全部 Node IO 与工作区校验）。
// 本文件保留：既有导出名 re-export（cli.test.ts 等调用方无需改动导入路径），
// 以及 subconvert-url / import / preview / migrate 的命令级逻辑（本阶段不动）。
export { checkConfig, generateOutputs, readConfig, syncVendor } from "@clash-route-kit/local-server";
export type { ProjectOptions as ProgramOptions } from "@clash-route-kit/local-server";
export type {
  DuplicateRuleSummary,
  GenerateResult,
  ProviderDuplicateSummary,
  ProviderOutputSummary,
  ProviderOverlapSummary,
  SourceContributionSummary,
} from "@clash-route-kit/local-server";
export type { SyncVendorOptions, VendorSyncResult } from "@clash-route-kit/local-server";

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
