import YAML from "yaml";
import { parseIniToConfig } from "@clash-route-kit/core";
import type { AuthorProjectConfigV2 } from "@clash-route-kit/core";

export type ImportTemplateAsV2Result =
  | { ok: true; yaml: string; warningCount: number }
  | { ok: false; error: string };

/**
 * 把导入的 SubConverter INI 模板直接转换为 Schema v2 作者配置文本：
 * 在当前 v2 配置的工程字段（project / vendorRepos）之上替换策略组、
 * 路由与 memberSets；路由引用的新 provider 生成禁用占位草稿，既有
 * ruleProviders 原样保留。不可表达事实由导入器记入 warnings，阻断
 * 交给保存侧 v2 校验链。存在组装层错误时返回失败，不产出半成品配置。
 */
export function importTemplateAsV2(
  iniText: string,
  base: AuthorProjectConfigV2,
): ImportTemplateAsV2Result {
  let imported;
  try {
    imported = parseIniToConfig(
      iniText,
      new Map(base.ruleProviders.map((provider) => [provider.output, { id: provider.id, behavior: provider.behavior }])),
    );
  } catch (error: unknown) {
    return {
      ok: false,
      error: `INI 解析失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const merged: AuthorProjectConfigV2 = {
    schemaVersion: 2,
    ...(base.project === undefined ? {} : { project: base.project }),
    ...(Object.keys(imported.memberSets).length === 0
      ? {}
      : { memberSets: imported.memberSets }),
    proxyGroups: imported.proxyGroups,
    routes: imported.routes,
    ruleProviders: [...imported.placeholderProviders, ...base.ruleProviders],
    ...(base.vendorRepos === undefined ? {} : { vendorRepos: base.vendorRepos }),
  };

  return {
    ok: true,
    yaml: YAML.stringify(merged, { lineWidth: 0 }).replace(/\n?$/, "\n"),
    warningCount: imported.warnings.length,
  };
}
