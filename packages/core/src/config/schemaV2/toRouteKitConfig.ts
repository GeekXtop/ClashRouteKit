/**
 * Schema v2 → 现有渲染管线桥接（事实源：docs/superpowers/specs/2026-08-10-web-console-workflow-redesign-design.md
 * 第 5.1 节四层模型的 "runtime context" 一层）。
 *
 * NormalizedProject → RouteKitConfig（renderIni 的渲染 DTO），映射语义与 v1 一致：
 * - 组成员映射为目标组的显示名（v1 以组 name 充当关系键），builtin DIRECT/REJECT 原样；
 * - nodeFilters 的 `{ match }` 展开为 v1 的字符串数组；
 * - 健康检查覆盖字段（url/interval/timeout/tolerance）原样透传；defaults 的解析
 *   继续由 renderIni 调用 defaults.ts 的既有 resolve 函数完成，桥接不复制解析逻辑；
 * - 路由 policy 映射为目标组显示名或 DIRECT/REJECT；rule-provider 路由经
 *   providerById 解析为 v1 的 `{ behavior, file: output }`（以输出文件名作关系键）；
 * - geosite / geoip / final source 与 section 原样透传；组与路由保持作者配置原序。
 *
 * v2 作者配置不携带发布 URL（spec 5.3：v1 `publishBaseUrl` 在迁移复核时移入本地设置），
 * 由 RenderRuntimeContext 注入等价的 publishBaseUrl。
 *
 * 约定：输入应已通过 validate 层（无缺失引用）。policy 引用不存在的组、或
 * rule-provider 路由引用不存在的 provider 时抛出明确错误，不静默渲染悬空策略。
 * provider YAML 生成不在桥接范围（providerById 已保留还原所需的完整实体）。
 * 纯函数、无 Node IO。
 */
import type {
  CustomProxyGroup,
  RuleSet,
  RuleSetSource,
  RouteKitConfig,
} from "../../types.js";
import type {
  NormalizedMember,
  NormalizedProject,
  NormalizedProxyGroup,
  NormalizedRoute,
} from "./normalize.js";

/**
 * 渲染时的运行时上下文：只承载本地设备 / CI 差异，不进入可提交的项目事实。
 */
export interface RenderRuntimeContext {
  /** v1 `publishBaseUrl` 的运行时等价物：本地 LAN 或 GitHub Raw 的 base URL。 */
  publishBaseUrl?: string;
}

function toProxyGroupOption(
  member: NormalizedMember,
  groupById: NormalizedProject["groupById"],
): string {
  if ("builtin" in member) return member.builtin;
  // normalize 层已剔除未知组引用，兜底回退到 id 仅为保持函数全定义。
  return groupById.get(member.group)?.name ?? member.group;
}

function toCustomProxyGroup(
  group: NormalizedProxyGroup,
  groupById: NormalizedProject["groupById"],
): CustomProxyGroup {
  return {
    name: group.name,
    type: group.type,
    options: group.members.map((member) => toProxyGroupOption(member, groupById)),
    nodeFilters: group.nodeFilters.map((filter) => filter.match),
    ...(group.url === undefined ? {} : { url: group.url }),
    ...(group.interval === undefined ? {} : { interval: group.interval }),
    ...(group.timeout === undefined ? {} : { timeout: group.timeout }),
    ...(group.tolerance === undefined ? {} : { tolerance: group.tolerance }),
  };
}

function toPolicyName(route: NormalizedRoute, project: NormalizedProject): string {
  const policy = route.policy;
  if ("builtin" in policy) return policy.builtin;
  const target = policy.groupExists
    ? project.groupById.get(policy.group)
    : undefined;
  if (target === undefined) {
    throw new Error(
      `路由 ${route.id} 引用的策略组 "${policy.group}" 不存在，无法渲染 INI；` +
        `请先根据 validate.reference.missing 修复引用`,
    );
  }
  return target.name;
}

function toRuleSetSource(
  route: NormalizedRoute,
  project: NormalizedProject,
): RuleSetSource {
  const source = route.source;
  if (source.type === "rule-provider") {
    const provider = project.providerById.get(source.provider);
    if (provider === undefined) {
      throw new Error(
        `路由 ${route.id} 引用的规则提供者 "${source.provider}" 不存在，无法渲染 INI；` +
          `请先根据 validate.reference.missing 修复引用`,
      );
    }
    return {
      type: "rule-provider",
      behavior: provider.behavior,
      file: provider.output,
    };
  }
  // geosite / geoip / final 与 v1 source 形状完全一致，原样透传。
  return source;
}

function toRuleSet(route: NormalizedRoute, project: NormalizedProject): RuleSet {
  return {
    id: route.id,
    policy: toPolicyName(route, project),
    source: toRuleSetSource(route, project),
    ...(route.section === undefined ? {} : { section: route.section }),
  };
}

/**
 * 把规范化后的 v2 项目映射为现有渲染 DTO。
 * defaults 原样透传（v2 与 v1 共用 `RouteKitDefaults`），健康检查 / rule-provider
 * interval / geoip noResolve 的解析仍由 renderIni 内的 defaults.ts 函数完成。
 */
export function toRouteKitConfig(
  project: NormalizedProject,
  context: RenderRuntimeContext = {},
): RouteKitConfig {
  return {
    publishBaseUrl: context.publishBaseUrl ?? "",
    ...(project.project?.defaults === undefined
      ? {}
      : { defaults: project.project.defaults }),
    customProxyGroups: project.groups.map((group) =>
      toCustomProxyGroup(group, project.groupById),
    ),
    ruleSets: project.routes.map((route) => toRuleSet(route, project)),
  };
}
