/**
 * Schema v2 作者配置类型（事实源：docs/superpowers/specs/2026-08-10-web-console-workflow-redesign-design.md 第 5.2 节）。
 *
 * 类型取舍说明：
 * - `ProjectV2.defaults` 直接复用 v1 的 `RouteKitDefaults`（含 `ProxyGroupDefaults` / `RuleSetDefaults`），形状完全兼容，不复制定义。
 * - `RuleProviderV2` 未加入 `interval` 字段：v1 `RuleProviderConfig` 没有该字段（provider 更新间隔由 `defaults.ruleSets.ruleProviderInterval` 统一提供），提前接受会让渲染桥被迫静默丢弃该值。
 * - `RouteV2` 按 Task 1 定义只含 `id` / `policy` / `source` / `section`，不含 v1 的 `enabled`；如迁移分析需要再扩展。
 * - `ProviderSourceV2` / `VendorRepoV2` 通过 extends 复用 v1 形状并附加稳定 `id` 字段（v1 以 `name` 充当关系键，v2 关系键一律为 `id`）。
 */
import type {
  ClashListSource,
  ClashProviderSource,
  DomainListCommunitySource,
  ProviderBehavior,
  RouteKitDefaults,
  VendorRepoConfig,
} from "../../types.js";

export type SchemaVersionV2 = 2;

export type BuiltinPolicy = "DIRECT" | "REJECT";

export interface ProjectTemplateV2 {
  output?: string;
}

export interface ProjectV2 {
  template?: ProjectTemplateV2;
  defaults?: RouteKitDefaults;
}

/**
 * 策略组成员的判别联合：必须恰好包含 `group`、`builtin`、`preset` 中的一个键。
 */
export type TypedMember =
  | { group: string }
  | { builtin: BuiltinPolicy }
  | { preset: string };

export interface MemberSet {
  members: TypedMember[];
}

export type ProxyGroupTypeV2 = "select" | "url-test" | "fallback" | "load-balance";

export interface NodeFilterV2 {
  match: string;
}

export interface ProxyGroupV2 {
  id: string;
  name: string;
  type: ProxyGroupTypeV2;
  members: TypedMember[];
  nodeFilters?: NodeFilterV2[];
  /** 健康检查 / url-test 覆盖字段，形状沿用 v1 `CustomProxyGroup`。 */
  url?: string;
  interval?: number;
  timeout?: number | null;
  tolerance?: number | null;
}

/**
 * 路由策略目标的判别联合：必须恰好包含 `group`、`builtin` 中的一个键。
 */
export type PolicyTarget =
  | { group: string }
  | { builtin: BuiltinPolicy };

export type RouteSourceV2 =
  | { type: "geosite"; value: string }
  | { type: "geoip"; value: string; noResolve?: boolean }
  | { type: "rule-provider"; provider: string }
  | { type: "final" };

export interface RouteV2 {
  id: string;
  policy: PolicyTarget;
  source: RouteSourceV2;
  section?: string;
}

export interface ClashListSourceV2 extends ClashListSource {
  id: string;
}

export interface ClashProviderSourceV2 extends ClashProviderSource {
  id: string;
}

export interface DomainListCommunitySourceV2 extends DomainListCommunitySource {
  id: string;
}

export type ProviderSourceV2 =
  | ClashListSourceV2
  | ClashProviderSourceV2
  | DomainListCommunitySourceV2;

export interface RuleProviderV2 {
  id: string;
  name: string;
  output: string;
  behavior: ProviderBehavior;
  enabled?: boolean;
  exclude?: string[];
  remove?: string[];
  sources: ProviderSourceV2[];
}

export interface VendorRepoV2 extends VendorRepoConfig {
  id: string;
}

export interface AuthorProjectConfigV2 {
  schemaVersion: SchemaVersionV2;
  project?: ProjectV2;
  memberSets?: Record<string, MemberSet>;
  proxyGroups: ProxyGroupV2[];
  routes: RouteV2[];
  ruleProviders: RuleProviderV2[];
  vendorRepos?: VendorRepoV2[];
}
