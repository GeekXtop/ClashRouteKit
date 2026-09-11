/**
 * Schema v2 规范化层（事实源：docs/superpowers/specs/2026-08-10-web-console-workflow-redesign-design.md 第 5.1 / 5.2 节）。
 *
 * 将作者配置展开为无歧义的 NormalizedProject：
 * - `memberSets` 递归展开为具体成员，preset 循环复用 findDependencyCycles 检测；
 * - 策略组成员中的 preset 引用被递归替换为 group / builtin 成员；
 * - 未知 preset、未知组引用剔除对应成员并生成 error 诊断，不中断整体结构；
 * - 路由 policy 的 group 引用解析为组 ID 并标注存在性（引用完整性校验属 validate 层）；
 * - 构建 id→组、id→provider 映射与 memberSets 展开缓存供下游复用。
 *
 * 纯函数、无 Node IO：不抛异常，问题一律收集为 Diagnostic；出错的相关成员留空，
 * 但整体结构始终返回。输入应已通过 parser 的结构与枚举校验。
 */
import type { Diagnostic } from "../diagnostics.js";
import { findDependencyCycles } from "../../routing/dependencyGraph.js";
import type {
  AuthorProjectConfigV2,
  BuiltinPolicy,
  MemberSet,
  NodeFilterV2,
  ProjectV2,
  ProxyGroupTypeV2,
  ProxyGroupV2,
  RouteSourceV2,
  RuleProviderV2,
  VendorRepoV2,
} from "./types.js";

/** 展开完成后的策略组成员：preset 已被递归替换为具体引用。 */
export type NormalizedMember =
  | { group: string }
  | { builtin: BuiltinPolicy };

export interface NormalizedProxyGroup {
  id: string;
  name: string;
  type: ProxyGroupTypeV2;
  /** preset 已递归展开；无效引用（未知 preset / 未知组）不产出成员。 */
  members: NormalizedMember[];
  nodeFilters: NodeFilterV2[];
  /** 以下为健康检查 / url-test 覆盖字段，形状沿用作者配置（v2 `ProxyGroupV2`）。 */
  url?: string;
  interval?: number;
  timeout?: number | null;
  tolerance?: number | null;
}

export type NormalizedPolicyTarget =
  | { group: string; groupExists: boolean }
  | { builtin: BuiltinPolicy };

export interface NormalizedRoute {
  id: string;
  policy: NormalizedPolicyTarget;
  source: RouteSourceV2;
  section?: string;
}

export interface NormalizedProject {
  schemaVersion: 2;
  /** 作者配置的模板与默认值，原样保留供渲染桥使用。 */
  project?: ProjectV2;
  /** 按作者配置原序排列的已解析策略组。 */
  groups: NormalizedProxyGroup[];
  groupById: ReadonlyMap<string, NormalizedProxyGroup>;
  /** memberSets 递归展开缓存；循环 / 缺失相关集合展开为空数组。 */
  memberSetCache: Readonly<Record<string, readonly NormalizedMember[]>>;
  routes: NormalizedRoute[];
  providerById: ReadonlyMap<string, RuleProviderV2>;
  vendorRepos?: readonly VendorRepoV2[];
}

export interface NormalizeResult {
  project: NormalizedProject;
  diagnostics: Diagnostic[];
}

function cloneNormalizedMember(member: NormalizedMember): NormalizedMember {
  return "group" in member
    ? { group: member.group }
    : { builtin: member.builtin };
}

/**
 * 用 memberSet 的 preset 引用构建依赖图并检测循环。
 * 图节点仅为已声明的 memberSet id；引用不存在的 preset 不构成环，
 * 由展开阶段的 normalize.preset.missing 报告。
 */
function collectPresetCycles(
  memberSets: Record<string, MemberSet>,
  diagnostics: Diagnostic[],
): void {
  const graph: Record<string, string[]> = {};
  for (const [setId, set] of Object.entries(memberSets)) {
    const presetTargets: string[] = [];
    for (const member of set.members) {
      if ("preset" in member) presetTargets.push(member.preset);
    }
    graph[setId] = presetTargets;
  }
  for (const cycle of findDependencyCycles(graph)) {
    diagnostics.push({
      code: "normalize.preset.cycle",
      severity: "error",
      path: `memberSets.${cycle[0]}`,
      message: `memberSets 存在 preset 循环：${cycle.join(" -> ")}`,
      related: [...cycle],
    });
  }
}

/**
 * 递归展开全部 memberSets 并缓存。
 * visiting 栈防止循环引用导致无限递归：环内递归段展开为空数组，
 * 循环本身由 collectPresetCycles 的 normalize.preset.cycle 诊断统一报告。
 */
function expandAllMemberSets(
  memberSets: Record<string, MemberSet>,
  diagnostics: Diagnostic[],
): Record<string, readonly NormalizedMember[]> {
  const cache: Record<string, readonly NormalizedMember[]> = {};
  const visiting = new Set<string>();

  const expand = (setId: string): readonly NormalizedMember[] => {
    const cached = cache[setId];
    if (cached !== undefined) return cached;
    visiting.add(setId);
    const members: NormalizedMember[] = [];
    const set = memberSets[setId];
    set.members.forEach((member, index) => {
      if ("preset" in member) {
        if (!Object.hasOwn(memberSets, member.preset)) {
          diagnostics.push({
            code: "normalize.preset.missing",
            severity: "error",
            path: `memberSets.${setId}.members[${index}]`,
            message: `引用的 preset "${member.preset}" 不存在`,
            related: [member.preset],
          });
          return;
        }
        if (!visiting.has(member.preset)) {
          for (const expanded of expand(member.preset)) {
            members.push(cloneNormalizedMember(expanded));
          }
        }
        return;
      }
      members.push(
        "group" in member
          ? { group: member.group }
          : { builtin: member.builtin },
      );
    });
    visiting.delete(setId);
    cache[setId] = members;
    return members;
  };

  for (const setId of Object.keys(memberSets)) {
    expand(setId);
  }
  return cache;
}

/**
 * 展开单个策略组成员列表：
 * - preset 引用替换为缓存中的展开产物，未知 preset 剔除并报 normalize.preset.missing；
 * - 每个产物成员归因到作者配置中 preset / 成员所在的原始下标；
 * - 未知 group 引用剔除并报 normalize.group.missing（builtin 无需检查）。
 */
function resolveGroupMembers(
  group: ProxyGroupV2,
  groupIndex: number,
  memberSets: Record<string, MemberSet>,
  memberSetCache: Readonly<Record<string, readonly NormalizedMember[]>>,
  groupIds: ReadonlySet<string>,
  diagnostics: Diagnostic[],
): NormalizedMember[] {
  const sourced: { member: NormalizedMember; sourceIndex: number }[] = [];
  group.members.forEach((member, memberIndex) => {
    if ("preset" in member) {
      const expanded = memberSetCache[member.preset];
      if (expanded === undefined) {
        diagnostics.push({
          code: "normalize.preset.missing",
          severity: "error",
          path: `proxyGroups[${groupIndex}].members[${memberIndex}]`,
          message: `引用的 preset "${member.preset}" 不存在`,
          related: [member.preset],
        });
        return;
      }
      for (const expandedMember of expanded) {
        sourced.push({
          member: cloneNormalizedMember(expandedMember),
          sourceIndex: memberIndex,
        });
      }
      return;
    }
    sourced.push({
      member:
        "group" in member
          ? { group: member.group }
          : { builtin: member.builtin },
      sourceIndex: memberIndex,
    });
  });

  const members: NormalizedMember[] = [];
  for (const { member, sourceIndex } of sourced) {
    if ("group" in member && !groupIds.has(member.group)) {
      diagnostics.push({
        code: "normalize.group.missing",
        severity: "error",
        path: `proxyGroups[${groupIndex}].members[${sourceIndex}]`,
        message: `引用的策略组 "${member.group}" 不存在`,
        related: [member.group],
      });
      continue;
    }
    members.push(member);
  }
  return members;
}

/**
 * 把已通过 parser 校验的 v2 作者配置规范化为 NormalizedProject。
 * 不抛异常：所有引用问题收集为 severity "error" 的 Diagnostic，
 * 出错的相关成员留空，整体结构始终返回。
 */
export function normalizeAuthorProjectConfig(
  config: AuthorProjectConfigV2,
): NormalizeResult {
  const diagnostics: Diagnostic[] = [];
  const memberSets = config.memberSets ?? {};
  const groupIds = new Set(config.proxyGroups.map((group) => group.id));

  collectPresetCycles(memberSets, diagnostics);
  const memberSetCache = expandAllMemberSets(memberSets, diagnostics);

  const groups: NormalizedProxyGroup[] = config.proxyGroups.map(
    (group, groupIndex) => ({
      id: group.id,
      name: group.name,
      type: group.type,
      members: resolveGroupMembers(
        group,
        groupIndex,
        memberSets,
        memberSetCache,
        groupIds,
        diagnostics,
      ),
      nodeFilters: (group.nodeFilters ?? []).map((filter) => ({
        match: filter.match,
      })),
      ...(group.url === undefined ? {} : { url: group.url }),
      ...(group.interval === undefined ? {} : { interval: group.interval }),
      ...(group.timeout === undefined ? {} : { timeout: group.timeout }),
      ...(group.tolerance === undefined ? {} : { tolerance: group.tolerance }),
    }),
  );

  const routes: NormalizedRoute[] = config.routes.map((route) => ({
    id: route.id,
    policy:
      "group" in route.policy
        ? {
            group: route.policy.group,
            groupExists: groupIds.has(route.policy.group),
          }
        : { builtin: route.policy.builtin },
    source: route.source,
    ...(route.section === undefined ? {} : { section: route.section }),
  }));

  const project: NormalizedProject = {
    schemaVersion: 2,
    ...(config.project === undefined ? {} : { project: config.project }),
    groups,
    groupById: new Map(groups.map((group) => [group.id, group])),
    memberSetCache,
    routes,
    providerById: new Map(
      config.ruleProviders.map((provider) => [provider.id, provider]),
    ),
    ...(config.vendorRepos === undefined
      ? {}
      : { vendorRepos: config.vendorRepos }),
  };

  return { project, diagnostics };
}
