import YAML from "yaml";
import { ConfigDiagnosticError } from "./config/diagnostics.js";
import { parseLegacyProjectConfig } from "./config/legacyParser.js";
import { parseAuthorProjectConfigV2 } from "./config/schemaV2/parser.js";
import type { AuthorProjectConfigV2 } from "./config/schemaV2/types.js";
import type { RouteKitProjectConfig } from "./types.js";

export function parseRouteKitConfig(text: string): RouteKitProjectConfig {
  return parseLegacyProjectConfig(YAML.parse(text) as unknown);
}

/**
 * parseAuthorProjectConfig 的分发结果：按顶层 schemaVersion 命中 v1 或 v2 分支。
 */
export interface ParsedAuthorProjectConfig {
  schemaVersion: 1 | 2;
  v1?: RouteKitProjectConfig;
  v2?: AuthorProjectConfigV2;
}

function describeSchemaVersion(value: unknown): string {
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}

/**
 * 只为探测顶层 schemaVersion 做一次宽松的 YAML 解析。
 * 解析失败时返回 parsed: false，让 v1 分支沿用 parseRouteKitConfig 的既有报错语义。
 */
function readDocumentSchemaVersion(
  text: string,
): { parsed: true; version: unknown } | { parsed: false } {
  try {
    const value: unknown = YAML.parse(text);
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return { parsed: true, version: (value as Record<string, unknown>).schemaVersion };
    }
    return { parsed: true, version: undefined };
  } catch {
    return { parsed: false };
  }
}

/**
 * 按文档顶层 `schemaVersion` 分发解析作者配置：
 * - 无 schemaVersion 键 → 现有 v1 严格解析（与 parseRouteKitConfig 同一路径）；
 * - schemaVersion: 2 → v2 严格解析（parseAuthorProjectConfigV2）；
 * - 其他值 → 抛 ConfigDiagnosticError（code: schema.version.unsupported）。
 *
 * 现有 parseRouteKitConfig 行为不变；YAML 语法错误沿用 v1 路径的原生报错。
 */
export function parseAuthorProjectConfig(text: string): ParsedAuthorProjectConfig {
  const document = readDocumentSchemaVersion(text);
  if (!document.parsed || document.version === undefined) {
    return { schemaVersion: 1, v1: parseRouteKitConfig(text) };
  }
  if (document.version === 2) {
    return { schemaVersion: 2, v2: parseAuthorProjectConfigV2(text) };
  }
  throw new ConfigDiagnosticError([
    {
      code: "schema.version.unsupported",
      severity: "error",
      path: "config.schemaVersion",
      message: `不支持的 schemaVersion：${describeSchemaVersion(document.version)}，` +
        "仅支持无 schemaVersion 的 v1 文档或 schemaVersion: 2",
    },
  ]);
}

export function serializeRouteKitConfig(config: RouteKitProjectConfig): string {
  return YAML.stringify(config, { lineWidth: 0 }).replace(/\n?$/, "\n");
}
