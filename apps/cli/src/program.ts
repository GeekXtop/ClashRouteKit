import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import {
  parseIniToConfig,
  type AuthorProjectConfigV2,
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
// 以及 subconvert-url / import / preview 的命令级逻辑（本阶段不动）。
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

export interface ImportResult {
  proxyGroups: number;
  routes: number;
  providers: number;
  warnings: string[];
  outputPath: string;
}

/**
 * INI 模板导入：parseIniToConfig 直出 Schema v2 草稿并原子写盘。
 * 输出仅含导入内容（策略组 / 路由 / memberSets / 禁用占位 provider），
 * 不绑定任何工程字段，供人工复核后并入正式配置。
 */
export async function importIni(
  options: ProgramOptions & { iniFile: string },
): Promise<ImportResult> {
  const iniText = await readFile(resolveInputPath(options.root, options.iniFile), "utf8");
  const imported = parseIniToConfig(iniText);

  const draft: AuthorProjectConfigV2 = {
    schemaVersion: 2,
    project: { template: { output: "Custom_Clash.ini" } },
    ...(Object.keys(imported.memberSets).length === 0 ? {} : { memberSets: imported.memberSets }),
    proxyGroups: imported.proxyGroups,
    routes: imported.routes,
    ruleProviders: imported.placeholderProviders,
  };

  const outputPath = path.join(options.root, "output/imported-routes-v2.yaml");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, YAML.stringify(draft, { lineWidth: 0 }), "utf8");

  return {
    proxyGroups: imported.proxyGroups.length,
    routes: imported.routes.length,
    providers: imported.placeholderProviders.length,
    warnings: imported.warnings,
    outputPath,
  };
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
