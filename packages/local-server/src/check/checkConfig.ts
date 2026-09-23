import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  appendDefaultValueDiagnostics,
  ConfigDiagnosticError,
  hasDiagnosticErrors,
  normalizeAuthorProjectConfig,
  parseAuthorProjectConfig,
  validateNormalizedProject,
  type Diagnostic,
  type RouteKitProjectConfig,
  type RuleProviderSource,
} from "@clash-route-kit/core";
import {
  renderedConfigFromAuthorProjectV2,
  type ProjectOptions,
} from "../config/configRepository.js";

function workspaceSourcePath(root: string, source: RuleProviderSource): string {
  if (source.type === "domain-list-community") {
    return path.resolve(root, source.basePath ?? "vendor/domain-list-community/data", source.entry);
  }
  return path.resolve(root, source.basePath ?? ".", source.path);
}

/** GEOSITE 目录与 provider 源文件的工作区校验；自 apps/cli workspaceValidation.ts 原样下沉。 */
export async function validateLegacyWorkspace(
  options: ProjectOptions,
  config: RouteKitProjectConfig,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const dataPath = path.join(options.root, "vendor/domain-list-community/data");
  let tags: Set<string> | undefined;
  try {
    tags = new Set((await readdir(dataPath, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name));
  } catch {
    tags = undefined;
  }

  for (const [index, ruleSet] of config.ruleSets.entries()) {
    if (ruleSet.enabled === false || ruleSet.source.type !== "geosite" || !tags) continue;
    const baseTag = ruleSet.source.value.split("@")[0] ?? ruleSet.source.value;
    if (!tags.has(baseTag)) {
      diagnostics.push({
        code: "workspace.geosite.missing",
        severity: "warning",
        path: `ruleSets[${index}].source.value`,
        message: `本地 GEOSITE Catalog 中未找到：${ruleSet.source.value}`,
        related: [ruleSet.source.value],
      });
    }
  }

  for (const [providerIndex, provider] of (config.ruleProviders ?? []).entries()) {
    if (provider.enabled === false) continue;
    for (const [sourceIndex, source] of provider.sources.entries()) {
      const filePath = workspaceSourcePath(options.root, source);
      try {
        await access(filePath);
      } catch {
        diagnostics.push({
          code: "workspace.provider-source.missing",
          severity: "error",
          path: `ruleProviders[${providerIndex}].sources[${sourceIndex}]`,
          message: `规则源文件不存在：${path.relative(options.root, filePath)}`,
        });
      }
    }
  }

  return diagnostics;
}

/**
 * Schema v2 静态校验 + 工作区诊断；checkConfig 与 generateOutputs 写盘前共用
 * 同一诊断集合。error 级静态诊断存在时跳过工作区校验（渲染桥无法执行），
 * 由调用方决定 error 是否阻断。
 */
export async function projectDiagnostics(options: ProjectOptions): Promise<Diagnostic[]> {
  const text = await readFile(path.join(options.root, options.configFile), "utf8");
  const parsed = parseAuthorProjectConfig(text);
  const normalized = normalizeAuthorProjectConfig(parsed.v2);
  const staticDiagnostics = [
    ...normalized.diagnostics,
    ...validateNormalizedProject(normalized.project),
  ];
  if (hasDiagnosticErrors(staticDiagnostics)) {
    return staticDiagnostics;
  }
  const config = renderedConfigFromAuthorProjectV2(parsed.v2, "");
  const valueDiagnostics: Diagnostic[] = [];
  appendDefaultValueDiagnostics(config, valueDiagnostics);
  return [
    ...staticDiagnostics,
    ...valueDiagnostics,
    ...await validateLegacyWorkspace(options, config),
  ];
}

export function assertNoErrors(diagnostics: readonly Diagnostic[]): void {
  if (hasDiagnosticErrors(diagnostics)) {
    throw new ConfigDiagnosticError(diagnostics);
  }
}

/** check 用例：读取项目配置并返回全部诊断；error 是否阻断由调用方判定。 */
export async function checkConfig(options: ProjectOptions): Promise<Diagnostic[]> {
  return projectDiagnostics(options);
}
