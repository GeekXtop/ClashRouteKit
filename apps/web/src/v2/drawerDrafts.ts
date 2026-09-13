/**
 * v2 抽屉草稿规范化（与 v1 `drawerDrafts.ts` 平行的 v2 版本）：
 * - GroupDrawer v2 分支：ProxyGroupV2 + 成员来源（preset / 内联）+ 节点过滤文本；
 * - RuleDrawer v2 分支：RouteV2（policy 为组 ID / 内置，来源为 RouteSourceV2）。
 * 校验规则镜像 v1 finalize（名称唯一、URL、正整数、空成员/过滤器拦截），
 * 术语改用 v2（策略组 / 路由）。
 */
import type {
  PolicyTarget,
  ProxyGroupV2,
  RouteSourceV2,
  RouteV2,
  TypedMember,
} from "@clash-route-kit/core";
import { nodeFiltersFromText, nodeFiltersToText, type DraftResult } from "../drawerDrafts.js";

function isHttpUrl(value: string): boolean {
  if (!value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

// ---------------------------------------------------------------------------
// 策略组（ProxyGroupV2）
// ---------------------------------------------------------------------------

/** 编辑中的覆盖字段：v1 同款 tri-state（undefined 继承 / null 显式清空 / 数值）。 */
export type EditableProxyGroupV2 = Omit<ProxyGroupV2, "interval" | "timeout" | "tolerance"> & {
  interval?: number | null;
  timeout?: number | null;
  tolerance?: number | null;
};

export interface V2GroupDraft {
  group: EditableProxyGroupV2;
  /** 成员来源：null = 内联成员；字符串 = 引用的 memberSet id（members 恒为 [{ preset }]）。 */
  presetId: string | null;
  nodeFiltersText: string;
}

function cloneMembers(members: readonly TypedMember[]): TypedMember[] {
  return members.map((member) => ({ ...member }));
}

export function createV2GroupDraft(group: ProxyGroupV2): V2GroupDraft {
  const singlePreset =
    group.members.length === 1 && "preset" in group.members[0]
      ? group.members[0].preset
      : null;
  return {
    group: {
      ...group,
      members: cloneMembers(group.members),
      nodeFilters: group.nodeFilters ? group.nodeFilters.map((filter) => ({ ...filter })) : undefined,
    },
    presetId: singlePreset,
    nodeFiltersText: nodeFiltersToText(group.nodeFilters?.map((filter) => filter.match)),
  };
}

/** 内联行 Select 的取值前缀（与成员行 Select options 一一对应）。 */
export function memberOptionValue(member: TypedMember): string {
  if ("group" in member) return `group:${member.group}`;
  if ("builtin" in member) return `builtin:${member.builtin}`;
  return `preset:${member.preset}`;
}

export function memberFromOptionValue(value: string): TypedMember | undefined {
  const separator = value.indexOf(":");
  if (separator === -1) return undefined;
  const kind = value.slice(0, separator);
  const raw = value.slice(separator + 1);
  if (!raw) return undefined;
  if (kind === "group") return { group: raw };
  if (kind === "builtin" && (raw === "DIRECT" || raw === "REJECT")) return { builtin: raw };
  if (kind === "preset") return { preset: raw };
  return undefined;
}

export function finalizeV2GroupDraft(
  draft: V2GroupDraft,
  otherGroups: ReadonlyArray<Pick<ProxyGroupV2, "id" | "name">>,
  originalId: string,
): DraftResult<ProxyGroupV2> {
  const name = draft.group.name.trim();
  if (!name) {
    return { ok: false, error: "策略组名称不能为空" };
  }
  if (otherGroups.some((group) => group.name === name)) {
    return { ok: false, error: `策略组 "${name}" 已存在` };
  }

  const members = draft.presetId
    ? [{ preset: draft.presetId } satisfies TypedMember]
    : cloneMembers(draft.group.members);
  const nodeFilters = nodeFiltersFromText(draft.nodeFiltersText).map((match) => ({ match }));
  if (members.length === 0 && nodeFilters.length === 0) {
    return { ok: false, error: `策略组 ${name} 至少需要一个成员或节点过滤器` };
  }

  if (draft.group.url !== undefined && !isHttpUrl(draft.group.url)) {
    return { ok: false, error: "测速 URL 必须是 HTTP/HTTPS URL" };
  }
  if (draft.group.interval === null) {
    return { ok: false, error: "测速间隔（秒）不能为空" };
  }
  if (draft.group.interval !== undefined && !isPositiveInteger(draft.group.interval)) {
    return { ok: false, error: "测速间隔（秒）必须为正整数" };
  }
  if (
    draft.group.timeout !== undefined &&
    draft.group.timeout !== null &&
    !isPositiveInteger(draft.group.timeout)
  ) {
    return { ok: false, error: "测速超时（秒）必须为正整数" };
  }
  if (
    draft.group.tolerance !== undefined &&
    draft.group.tolerance !== null &&
    !isNonNegativeInteger(draft.group.tolerance)
  ) {
    return { ok: false, error: "URLTest 容差（毫秒）必须为非负整数" };
  }

  const { interval, ...group } = draft.group;
  return {
    ok: true,
    value: {
      ...group,
      id: originalId,
      name,
      type: draft.group.type,
      members,
      nodeFilters: nodeFilters.length > 0 ? nodeFilters : undefined,
      ...(interval !== undefined ? { interval } : {}),
      ...(draft.group.timeout !== undefined ? { timeout: draft.group.timeout } : {}),
      ...(draft.group.tolerance !== undefined ? { tolerance: draft.group.tolerance } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// 路由（RouteV2）
// ---------------------------------------------------------------------------

export interface V2RouteDraft {
  id: string;
  policy: PolicyTarget;
  source: RouteSourceV2;
  section?: string;
}

export function createV2RouteDraft(route: RouteV2): V2RouteDraft {
  return {
    id: route.id,
    policy: { ...route.policy },
    source: { ...route.source },
    ...(route.section === undefined ? {} : { section: route.section }),
  };
}

export function makeV2RouteSource(
  type: RouteSourceV2["type"],
  providerIds: readonly string[],
): RouteSourceV2 {
  if (type === "geosite") return { type: "geosite", value: "" };
  if (type === "geoip") return { type: "geoip", value: "" };
  if (type === "rule-provider") {
    return { type: "rule-provider", provider: providerIds[0] ?? "" };
  }
  return { type: "final" };
}

export function finalizeV2RouteDraft(
  draft: V2RouteDraft,
  routeIds: readonly string[],
  originalId: string,
): DraftResult<RouteV2> {
  const id = draft.id.trim();
  if (!id) return { ok: false, error: "路由 ID 不能为空" };
  if (id !== originalId && routeIds.includes(id)) {
    return { ok: false, error: `路由 "${id}" 已存在` };
  }

  let source: RouteSourceV2;
  if (draft.source.type === "geosite") {
    const value = draft.source.value.trim();
    if (!value) return { ok: false, error: `路由 ${id} 的 GEOSITE 不能为空` };
    source = { type: "geosite", value };
  } else if (draft.source.type === "geoip") {
    const value = draft.source.value.trim();
    if (!value) return { ok: false, error: `路由 ${id} 的 GEOIP 不能为空` };
    source = {
      type: "geoip",
      value,
      ...(draft.source.noResolve !== undefined ? { noResolve: draft.source.noResolve } : {}),
    };
  } else if (draft.source.type === "rule-provider") {
    if (!draft.source.provider.trim()) {
      return { ok: false, error: `路由 ${id} 的规则提供者不能为空` };
    }
    source = { type: "rule-provider", provider: draft.source.provider };
  } else {
    source = { type: "final" };
  }

  const section = draft.section?.trim();
  return {
    ok: true,
    value: {
      id: originalId,
      policy: { ...draft.policy },
      source,
      ...(section ? { section } : {}),
    },
  };
}
