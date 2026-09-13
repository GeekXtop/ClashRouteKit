import { parseIniToConfig, planLegacyMigration, type RouteKitProjectConfig } from "@clash-route-kit/core";
import { replaceImportedConfig } from "../../configMutations.js";

export type ImportTemplateAsV2Result =
  | { ok: true; yaml: string; warningCount: number }
  | { ok: false; error: string };

/**
 * 把导入的 SubConverter INI 模板转换为 Schema v2 作者配置文本。
 * 语义与 v1 导入一致：在当前配置的工程字段（template / vendorRepos /
 * defaults）之上替换策略组与路由，并为悬空的 provider 引用生成禁用
 * 占位草稿（replaceImportedConfig）；再经 planLegacyMigration 产出 v2
 * YAML。存在 error 级迁移问题时返回失败，不产出半成品配置。
 */
export function importTemplateAsV2(
  iniText: string,
  base: RouteKitProjectConfig,
): ImportTemplateAsV2Result {
  let imported;
  try {
    imported = parseIniToConfig(iniText);
  } catch (error: unknown) {
    return {
      ok: false,
      error: `INI 解析失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const assembled = replaceImportedConfig(base, imported);
  const plan = planLegacyMigration(assembled);
  const errors = plan.issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    return {
      ok: false,
      error: errors
        .map((issue) => `[${issue.code}] ${issue.message}`)
        .join("；"),
    };
  }
  return {
    ok: true,
    yaml: plan.yaml,
    warningCount:
      plan.issues.filter((issue) => issue.severity === "warning").length +
      imported.warnings.length,
  };
}
