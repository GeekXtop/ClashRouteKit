import type { RouteKitProjectConfig } from "@clash-route-kit/core";

export type ProjectSchemaVersion = 1 | 2;

/**
 * 按文档顶层 `schemaVersion` 探测作者配置版本。
 * 与 core parseAuthorProjectConfig 的分发规则保持一致（无键 → v1），
 * 这里只做轻量正则探测，不触发严格解析（v2 严格解析在 Task 4 接入）。
 */
export function detectSchemaVersion(yaml: string): ProjectSchemaVersion {
  return /^\s*schemaVersion:\s*2\s*(?:#.*)?$/m.test(yaml) ? 2 : 1;
}

/**
 * 空项目判定：没有任何路由、策略组和规则源时视为空项目，
 * 项目页展示"导入现有模板 / 创建空白项目"入口。
 */
export function isEmptyProjectConfig(config: RouteKitProjectConfig): boolean {
  return (
    config.ruleSets.length === 0 &&
    config.customProxyGroups.length === 0 &&
    (config.ruleProviders ?? []).length === 0
  );
}

/**
 * 空白项目最小配置：仅含一条指向 DIRECT 的 FINAL 兜底规则，
 * 保证能通过保存侧 validateLegacyProjectConfig 的 FINAL 校验。
 */
export function createBlankProjectConfig(): RouteKitProjectConfig {
  return {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    customProxyGroups: [],
    ruleSets: [{ id: "final", policy: "DIRECT", source: { type: "final" } }],
    ruleProviders: [],
  };
}
