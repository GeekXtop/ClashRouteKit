import { ConfigDiagnosticError } from "./config/diagnostics.js";
import { parseAuthorProjectConfigV2 } from "./config/schemaV2/parser.js";
import type { AuthorProjectConfigV2 } from "./config/schemaV2/types.js";

/**
 * parseAuthorProjectConfig 的解析结果（仅 Schema v2；v1 磁盘格式已不支持）。
 */
export interface ParsedAuthorProjectConfig {
  schemaVersion: 2;
  v2: AuthorProjectConfigV2;
}

/**
 * 解析 Schema v2 作者配置。文档缺少 `schemaVersion: 2`（v1 旧格式）或
 * 版本值不支持时抛 ConfigDiagnosticError；YAML 语法错误由 v2 parser 抛出。
 */
export function parseAuthorProjectConfig(text: string): ParsedAuthorProjectConfig {
  try {
    return { schemaVersion: 2, v2: parseAuthorProjectConfigV2(text) };
  } catch (error: unknown) {
    if (error instanceof ConfigDiagnosticError) {
      const diagnostics = error.diagnostics.map((diagnostic) =>
        diagnostic.code === "schema.version.unsupported"
          ? {
              ...diagnostic,
              message:
                "不支持 v1 格式：作者配置必须声明顶层 schemaVersion: 2（v1 磁盘格式已移除支持）",
            }
          : diagnostic,
      );
      throw new ConfigDiagnosticError(diagnostics);
    }
    throw error;
  }
}
