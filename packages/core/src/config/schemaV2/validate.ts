/**
 * Schema v2 校验层（事实源：docs/superpowers/specs/2026-08-10-web-console-workflow-redesign-design.md 第 5.5 节）。
 *
 * 两层纯函数校验：不抛异常、无 Node IO；结构错误（类型、枚举、判别联合、ID 格式）
 * 属 parser 层，这里只做跨实体语义：
 * - validateAuthorProjectConfigV2：作者配置层——重复 ID（集合内 + 跨集合）、
 *   引用完整性、provider 数据源与 behavior 一致性、node filter、FINAL 数量；
 * - validateNormalizedProject：规范化层——策略组循环引用、展开后空成员组
 *   （builtin 也算成员；0 成员且未配置 nodeFilters 才报——空 members +
 *   非空 nodeFilters 是合法的"按过滤器选择订阅节点"组，与 v1 renderIni 把
 *   options 与 nodeFilters 拼接渲染的语义一致）；preset 循环与缺失引用已在
 *   normalize 层报告，这里不重复。
 */
import type { Diagnostic } from "../diagnostics.js";
import { findDependencyCycles } from "../../routing/dependencyGraph.js";
import type { NormalizedProject } from "./normalize.js";
import type {
  AuthorProjectConfigV2,
  ProviderSourceV2,
  ProxyGroupV2,
  RouteV2,
  RuleProviderV2,
  TypedMember,
} from "./types.js";

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function isValidRegExp(value: string): boolean {
  try {
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
}

interface IdEntry {
  readonly id: string;
  readonly path: string;
  readonly collection: string;
}

/**
 * 收集四个实体集合（proxyGroups / memberSets / routes / ruleProviders）的 ID 条目。
 * parser 已挡集合内重复，这里仍保留集合内查重以便直接对象输入时自洽，
 * 并补充 parser 无法表达的跨集合 ID 冲突。
 */
function collectIdEntries(config: AuthorProjectConfigV2): IdEntry[] {
  const memberSets = config.memberSets ?? {};
  return [
    ...config.proxyGroups.map((group, index) => ({
      id: group.id,
      path: `proxyGroups[${index}].id`,
      collection: "proxyGroups",
    })),
    ...Object.keys(memberSets).map((setId) => ({
      id: setId,
      path: `memberSets.${setId}`,
      collection: "memberSets",
    })),
    ...config.routes.map((route, index) => ({
      id: route.id,
      path: `routes[${index}].id`,
      collection: "routes",
    })),
    ...config.ruleProviders.map((provider, index) => ({
      id: provider.id,
      path: `ruleProviders[${index}].id`,
      collection: "ruleProviders",
    })),
  ];
}

function addDuplicateIdDiagnostics(
  config: AuthorProjectConfigV2,
  diagnostics: Diagnostic[],
): void {
  const seenPerCollection = new Map<string, Set<string>>();
  const firstAcrossCollections = new Map<string, IdEntry>();
  for (const entry of collectIdEntries(config)) {
    let seen = seenPerCollection.get(entry.collection);
    if (seen === undefined) {
      seen = new Set();
      seenPerCollection.set(entry.collection, seen);
    }
    if (seen.has(entry.id)) {
      diagnostics.push({
        code: "validate.id.duplicate",
        severity: "error",
        path: entry.path,
        message: `重复的 ${entry.collection} ID：${entry.id}`,
        related: [entry.id],
      });
    } else {
      seen.add(entry.id);
    }
    const first = firstAcrossCollections.get(entry.id);
    if (first === undefined) {
      firstAcrossCollections.set(entry.id, entry);
    } else if (first.collection !== entry.collection) {
      diagnostics.push({
        code: "validate.id.duplicate",
        severity: "error",
        path: entry.path,
        message: `ID "${entry.id}" 同时被 ${first.collection} 与 ${entry.collection} 使用`,
        related: [entry.id],
      });
    }
  }
}

function addRouteReferenceDiagnostics(
  routes: readonly RouteV2[],
  groupIds: ReadonlySet<string>,
  providerIds: ReadonlySet<string>,
  diagnostics: Diagnostic[],
): void {
  for (const [index, route] of routes.entries()) {
    if ("group" in route.policy && !groupIds.has(route.policy.group)) {
      diagnostics.push({
        code: "validate.reference.missing",
        severity: "error",
        path: `routes[${index}].policy.group`,
        message: `路由 ${route.id} 引用的策略组 "${route.policy.group}" 不存在`,
        related: [route.policy.group],
      });
    }
    const source = route.source;
    if (source.type === "rule-provider" && !providerIds.has(source.provider)) {
      diagnostics.push({
        code: "validate.reference.missing",
        severity: "error",
        path: `routes[${index}].source.provider`,
        message: `路由 ${route.id} 引用的规则提供者 "${source.provider}" 不存在`,
        related: [source.provider],
      });
    }
  }
}

function addMemberReferenceDiagnostics(
  members: readonly TypedMember[],
  basePath: string,
  groupIds: ReadonlySet<string>,
  memberSetIds: ReadonlySet<string>,
  diagnostics: Diagnostic[],
): void {
  for (const [index, member] of members.entries()) {
    if ("group" in member && !groupIds.has(member.group)) {
      diagnostics.push({
        code: "validate.reference.missing",
        severity: "error",
        path: `${basePath}[${index}]`,
        message: `引用的策略组 "${member.group}" 不存在`,
        related: [member.group],
      });
    }
    if ("preset" in member && !memberSetIds.has(member.preset)) {
      diagnostics.push({
        code: "validate.reference.missing",
        severity: "error",
        path: `${basePath}[${index}]`,
        message: `引用的 memberSet "${member.preset}" 不存在`,
        related: [member.preset],
      });
    }
  }
}

/**
 * behavior 与数据源类型一致性（对齐 v1 渲染 / generate 的真实收集语义）：
 * - domain 接受全部三类来源：v1 生成链（generateOutputs.readRules 对任意
 *   behavior 读取三类 source，rules.ts 的 normalizeDomainRule 只保留
 *   DOMAIN-SUFFIX / DOMAIN 规则、其余行静默过滤）语义无损；
 * - ipcidr 不能使用 domain-list-community：domain-list-community 条目会被
 *   convertDomainListCommunity 归一为 DOMAIN 系规则，而 normalizeIpcidrRule
 *   只保留 IP-CIDR / IP-CIDR6，组合必然产出空 provider；
 * - classical 的规则归一可吸收任意来源类型。
 */
function behaviorMatchesSource(
  behavior: RuleProviderV2["behavior"],
  source: ProviderSourceV2,
): boolean {
  if (behavior === "ipcidr") return source.type !== "domain-list-community";
  return true;
}

function validateProviderV2(
  provider: RuleProviderV2,
  index: number,
  diagnostics: Diagnostic[],
): void {
  const base = `ruleProviders[${index}]`;
  const enabled = provider.enabled !== false;
  // 禁用的不完整 provider 允许作为草稿保留（spec 5.5），只挡启用态。
  if (enabled && provider.sources.length === 0) {
    diagnostics.push({
      code: "validate.provider.empty-sources",
      severity: "error",
      path: `${base}.sources`,
      message: `启用的规则源 ${provider.name} 至少需要一个数据源`,
    });
  }
  if (!/\.yaml$/i.test(provider.output)) {
    diagnostics.push({
      code: "validate.provider.output-extension",
      severity: "error",
      path: `${base}.output`,
      message: `当前只支持 .yaml provider 输出：${provider.output}`,
    });
  }
  for (const [sourceIndex, source] of provider.sources.entries()) {
    if (behaviorMatchesSource(provider.behavior, source)) continue;
    diagnostics.push({
      code: "validate.provider.behavior-mismatch",
      severity: "error",
      path: `${base}.sources[${sourceIndex}]`,
      message: `规则源 ${provider.name} 的 behavior "${provider.behavior}" 与数据源类型 "${source.type}" 不一致`,
      related: [source.id],
    });
  }
}

/** node filter 规则与 validateLegacy 现有 group.node-filter.* 命名保持一致。 */
function validateNodeFilters(
  group: ProxyGroupV2,
  index: number,
  diagnostics: Diagnostic[],
): void {
  const filters = group.nodeFilters ?? [];
  for (const [filterIndex, filter] of filters.entries()) {
    const path = `proxyGroups[${index}].nodeFilters[${filterIndex}].match`;
    const value = filter.match;
    if (!value.trim()) {
      diagnostics.push({
        code: "group.node-filter.empty",
        severity: "error",
        path,
        message: `策略组 ${group.name} 的 node filter 不能为空`,
      });
      continue;
    }
    if (isHttpUrl(value)) {
      diagnostics.push({
        code: "group.node-filter.url",
        severity: "error",
        path,
        message: `策略组 ${group.name} 的 node filter 不能是 HTTP/HTTPS URL`,
        related: [value],
      });
      continue;
    }
    if (!isValidRegExp(value)) {
      diagnostics.push({
        code: "group.node-filter.regex",
        severity: "error",
        path,
        message: `策略组 ${group.name} 的 node filter 不是有效正则表达式`,
        related: [value],
      });
    }
  }
}

function addFinalRouteCountDiagnostics(
  routes: readonly RouteV2[],
  diagnostics: Diagnostic[],
): void {
  const finalRouteIds = routes
    .filter((route) => route.source.type === "final")
    .map((route) => route.id);
  if (finalRouteIds.length <= 1) return;
  diagnostics.push({
    code: "validate.route.final-count",
    severity: "error",
    path: "routes",
    message: "FINAL 兜底路由只能出现一条",
    related: finalRouteIds,
  });
}

/**
 * 校验 v2 作者配置的跨实体语义，返回全部诊断（可为空数组）。
 * 不抛异常：结构错误应先经 parseAuthorProjectConfigV2。
 */
export function validateAuthorProjectConfigV2(
  config: AuthorProjectConfigV2,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const memberSets = config.memberSets ?? {};
  const groupIds = new Set(config.proxyGroups.map((group) => group.id));
  const providerIds = new Set(
    config.ruleProviders.map((provider) => provider.id),
  );
  const memberSetIds = new Set(Object.keys(memberSets));

  addDuplicateIdDiagnostics(config, diagnostics);

  addRouteReferenceDiagnostics(config.routes, groupIds, providerIds, diagnostics);
  for (const [groupIndex, group] of config.proxyGroups.entries()) {
    addMemberReferenceDiagnostics(
      group.members,
      `proxyGroups[${groupIndex}].members`,
      groupIds,
      memberSetIds,
      diagnostics,
    );
  }
  for (const [setId, set] of Object.entries(memberSets)) {
    addMemberReferenceDiagnostics(
      set.members,
      `memberSets.${setId}.members`,
      groupIds,
      memberSetIds,
      diagnostics,
    );
  }

  for (const [providerIndex, provider] of config.ruleProviders.entries()) {
    validateProviderV2(provider, providerIndex, diagnostics);
  }

  for (const [groupIndex, group] of config.proxyGroups.entries()) {
    validateNodeFilters(group, groupIndex, diagnostics);
  }

  addFinalRouteCountDiagnostics(config.routes, diagnostics);

  return diagnostics;
}

/**
 * 校验规范化后的项目：策略组循环引用（组内 group 成员引用图）与展开后空成员组
 * （0 成员且未配置 nodeFilters 才报——空 members + 非空 nodeFilters 是合法的
 * "按过滤器选择订阅节点"组，对应 v1 renderCustomProxyGroup 对空 options +
 * nodeFilters 的拼接渲染）。preset 循环 / 缺失引用由 normalizeAuthorProjectConfig
 * 报告，这里不重复。
 */
export function validateNormalizedProject(
  project: NormalizedProject,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const graph: Record<string, string[]> = {};
  for (const group of project.groups) {
    graph[group.id] = group.members.flatMap((member) =>
      "group" in member ? [member.group] : [],
    );
  }
  for (const cycle of findDependencyCycles(graph)) {
    diagnostics.push({
      code: "validate.group.cycle",
      severity: "error",
      path: `proxyGroups.${cycle[0]}`,
      message: `策略组存在循环引用：${cycle.join(" -> ")}`,
      related: [...cycle],
    });
  }

  for (const group of project.groups) {
    // 空 members + 非空 nodeFilters 合法：v1 按 nodeFilters 从订阅节点中筛选。
    if (group.members.length > 0 || group.nodeFilters.length > 0) continue;
    diagnostics.push({
      code: "validate.group.empty-members",
      severity: "error",
      path: `proxyGroups.${group.id}`,
      message: `策略组 ${group.name} 展开后没有任何成员，且未配置节点过滤器`,
    });
  }

  return diagnostics;
}
