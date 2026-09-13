import YAML from "yaml";
import {
  ConfigDiagnosticError,
  normalizeAuthorProjectConfig,
  parseAuthorProjectConfigV2,
  validateAuthorProjectConfigV2,
  validateNormalizedProject,
  type AuthorProjectConfigV2,
  type Diagnostic,
} from "@clash-route-kit/core";

/**
 * Schema v2 作者配置的共用校验链与序列化（plan Task 4 服务端补全）。
 * 迁移 apply（migration.ts）与 v2 保存（configRepository.saveAuthorProject）
 * 走同一条链，保证两个写入口的安全语义一致：
 *
 * parser（结构与枚举，错误抛 ConfigDiagnosticError）→ author validate →
 * normalize（附带诊断）→ normalized validate；存在 error 级诊断由调用方拒绝写入。
 */

/** 把任意解析错误统一为 ConfigDiagnosticError（带结构化 diagnostics）。 */
export function toConfigDiagnosticError(error: unknown): ConfigDiagnosticError {
  if (error instanceof ConfigDiagnosticError) return error;
  return new ConfigDiagnosticError([
    {
      code: "config.yaml.invalid",
      severity: "error",
      path: "config",
      message: `配置解析失败：${error instanceof Error ? error.message : String(error)}`,
    },
  ]);
}

export interface V2DraftValidation {
  parsed: AuthorProjectConfigV2;
  diagnostics: Diagnostic[];
}

/**
 * 对 v2 YAML 文本走完整校验链；纯函数，不触碰文件系统。
 * 解析失败（YAML 语法、v2 结构错误、schemaVersion 非 2）抛 ConfigDiagnosticError。
 */
export function validateAuthorProjectV2Yaml(yamlText: string): V2DraftValidation {
  let draft: AuthorProjectConfigV2;
  try {
    draft = parseAuthorProjectConfigV2(yamlText);
  } catch (error: unknown) {
    throw toConfigDiagnosticError(error);
  }
  const normalized = normalizeAuthorProjectConfig(draft);
  return {
    parsed: draft,
    diagnostics: [
      ...validateAuthorProjectConfigV2(draft),
      ...normalized.diagnostics,
      ...validateNormalizedProject(normalized.project),
    ],
  };
}

/**
 * 服务端重新序列化 v2 作者配置：schemaVersion: 2 固定在文件顶部，
 * 客户端提交的 YAML 文本不会被原样写入。
 */
export function serializeAuthorProjectV2(config: AuthorProjectConfigV2): string {
  const { schemaVersion: _clientVersion, ...rest } = config;
  return YAML.stringify({ schemaVersion: 2, ...rest }, { lineWidth: 0 }).replace(/\n?$/, "\n");
}
