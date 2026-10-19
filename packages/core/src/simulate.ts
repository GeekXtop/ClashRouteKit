/**
 * 命中模拟器核心评估（spec: docs/superpowers/specs/2026-10-19-hit-simulator-design.md）。
 * 纯函数：评估材料（provider 载荷、geosite 转换串）由调用方预加载，
 * 这里不做任何文件 IO。匹配语义对齐 Clash Meta 域名规则：
 * 后缀 = 相等或以 ".x" 结尾；精确 = 全等；关键词 = 子串包含；大小写不敏感。
 */
import type { ProviderBehavior } from "./types.js";
import type {
  MemberSet,
  PolicyTarget,
  ProxyGroupV2,
  RouteV2,
  TypedMember,
} from "./config/schemaV2/types.js";

export type TraceOutcome =
  | { kind: "hit" }
  | { kind: "miss" }
  | { kind: "skipped"; reason: string }
  | { kind: "not-evaluated" };

export interface RouteTraceRow {
  index: number;
  routeId: string;
  /** 渲染口径的源标签：GEOSITE,x / provider:id / GEOIP,x / FINAL */
  label: string;
  outcome: TraceOutcome;
}

export interface SimulateChainNode {
  id: string;
  name: string;
  type: ProxyGroupV2["type"];
}

export interface SimulateRouteResult {
  status: "matched" | "unmatched";
  domain: string;
  matched?: {
    index: number;
    routeId: string;
    label: string;
    /** 组显示名或 DIRECT/REJECT */
    policyLabel: string;
    chain: SimulateChainNode[];
    /** "direct" | "reject" | "runtime-select:<组名>"，去重保序 */
    possibleTerminals: string[];
  };
  trace: RouteTraceRow[];
}

export interface DomainRouteInput {
  /** 调用方负责 trim + 小写 */
  domain: string;
  routes: RouteV2[];
  proxyGroups: ProxyGroupV2[];
  memberSets: Record<string, MemberSet>;
  /** provider id → 载荷条目；entries 为 null 表示输出文件缺失 */
  providerEntries: Record<string, { behavior: ProviderBehavior; entries: string[] | null }>;
  /** geosite tag → 转换后的规则串；null 表示 tag 不在本地 vendor */
  geositeEntries: Record<string, string[] | null>;
}

export type DomainPredicate = { kind: "exact" | "suffix" | "keyword"; value: string };

/** domain behavior 载荷行：`+.x` → 后缀，裸值 → 精确；带逗号或空值非本格式。 */
export function parseDomainEntry(entry: string): DomainPredicate | null {
  const trimmed = entry.trim();
  if (!trimmed || trimmed.includes(",")) return null;
  if (trimmed.startsWith("+.")) {
    const value = trimmed.slice(2).toLowerCase();
    return value ? { kind: "suffix", value } : null;
  }
  return { kind: "exact", value: trimmed.toLowerCase() };
}

/** 规则串（classical 载荷 / geosite 转换产物）：DOMAIN、DOMAIN-SUFFIX、DOMAIN-KEYWORD 参与域名匹配。 */
export function parseRuleEntry(rule: string): DomainPredicate | null {
  const parts = rule.trim().split(",");
  const kind = (parts[0] ?? "").trim().toUpperCase();
  const value = (parts[1] ?? "").trim().toLowerCase();
  if (!value) return null;
  if (kind === "DOMAIN") return { kind: "exact", value };
  if (kind === "DOMAIN-SUFFIX") return { kind: "suffix", value };
  if (kind === "DOMAIN-KEYWORD") return { kind: "keyword", value };
  return null;
}

/** 宽松合法性：非空、无空白/路径/端口字符、标签字符受限（含单标签关键词如 "openai"）。 */
export function isPlausibleDomain(input: string): boolean {
  const value = input.trim().toLowerCase();
  if (!value || value.length > 253) return false;
  return /^[a-z0-9]([a-z0-9_-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9_-]*[a-z0-9])?)*$/.test(value);
}

function predicateMatches(predicate: DomainPredicate, domain: string): boolean {
  if (predicate.kind === "exact") return domain === predicate.value;
  if (predicate.kind === "suffix") {
    return domain === predicate.value || domain.endsWith(`.${predicate.value}`);
  }
  return domain.includes(predicate.value);
}

function sourceLabel(source: RouteV2["source"]): string {
  if (source.type === "geosite") return `GEOSITE,${source.value}`;
  if (source.type === "geoip") return `GEOIP,${source.value}`;
  if (source.type === "rule-provider") return `provider:${source.provider}`;
  return "FINAL";
}

function routePredicates(
  source: RouteV2["source"],
  input: DomainRouteInput,
): { predicates: DomainPredicate[] } | { skip: string } {
  if (source.type === "geoip") return { skip: "仅 IP 规则（geoip）" };
  if (source.type === "final") return { predicates: [] }; // 兜底由调用方特判
  if (source.type === "geosite") {
    // "ai@cn" 属性语法：匹配走基础 tag，材料加载也以基础 tag 为键
    const baseTag = source.value.split("@")[0] ?? source.value;
    const entries = input.geositeEntries[baseTag];
    if (!entries) return { skip: `geosite tag 不在本地 vendor：${source.value}` };
    return { predicates: entries.map(parseRuleEntry).filter((p): p is DomainPredicate => p !== null) };
  }
  const provider = input.providerEntries[source.provider];
  if (!provider || provider.entries === null) {
    return { skip: `provider 输出缺失（先执行 generate）：${source.provider}` };
  }
  if (provider.behavior === "ipcidr") return { skip: "仅 IP 规则（ipcidr）" };
  const parse = provider.behavior === "domain" ? parseDomainEntry : parseRuleEntry;
  return {
    predicates: provider.entries.map(parse).filter((p): p is DomainPredicate => p !== null),
  };
}

const builtinTerminal = (builtin: "DIRECT" | "REJECT"): string => (builtin === "DIRECT" ? "direct" : "reject");

/**
 * 策略链解析（spec §3）：终点在 builtin 处收敛；任何策略组都代表运行时决定，
 * 记 `runtime-select:<显示名>` 并继续递归成员（成员可能钉死 DIRECT/REJECT）。
 * 组 id 与成员集 id 共用 visited 防环。
 */
function resolvePolicy(
  policy: PolicyTarget,
  input: DomainRouteInput,
): { policyLabel: string; chain: SimulateChainNode[]; possibleTerminals: string[] } {
  if ("builtin" in policy) {
    return { policyLabel: policy.builtin, chain: [], possibleTerminals: [builtinTerminal(policy.builtin)] };
  }
  const groupById = new Map(input.proxyGroups.map((g) => [g.id, g]));
  const root = groupById.get(policy.group);
  if (!root) {
    // 悬空引用属于校验层问题；模拟不崩溃，按未知运行时选择兜底
    return { policyLabel: policy.group, chain: [], possibleTerminals: [`runtime-select:${policy.group}`] };
  }
  const chain: SimulateChainNode[] = [];
  const terminals = new Set<string>();
  const visited = new Set<string>();
  const visitGroup = (group: ProxyGroupV2): void => {
    if (visited.has(`group:${group.id}`)) return;
    visited.add(`group:${group.id}`);
    chain.push({ id: group.id, name: group.name, type: group.type });
    terminals.add(`runtime-select:${group.name}`);
    visitMembers(group.members);
  };
  const visitMembers = (members: TypedMember[]): void => {
    for (const member of members) {
      if ("builtin" in member) {
        terminals.add(builtinTerminal(member.builtin));
      } else if ("group" in member) {
        const nested = groupById.get(member.group);
        if (nested) visitGroup(nested);
        else terminals.add(`runtime-select:${member.group}`);
      } else {
        const set = input.memberSets[member.preset];
        if (!set || !visited.add(`set:${member.preset}`)) continue;
        visitMembers(set.members);
      }
    }
  };
  visitGroup(root);
  return { policyLabel: root.name, chain, possibleTerminals: [...terminals] };
}

export function simulateDomainRoute(input: DomainRouteInput): SimulateRouteResult {
  const domain = input.domain.trim().toLowerCase();
  const trace: RouteTraceRow[] = [];
  let matchedIndex = -1;

  for (const [index, route] of input.routes.entries()) {
    const row: RouteTraceRow = { index, routeId: route.id, label: sourceLabel(route.source), outcome: { kind: "miss" } };
    if (matchedIndex >= 0) {
      row.outcome = { kind: "not-evaluated" };
      trace.push(row);
      continue;
    }
    if (route.source.type === "final") {
      row.outcome = { kind: "hit" };
      matchedIndex = index;
      trace.push(row);
      continue;
    }
    const evaluation = routePredicates(route.source, input);
    if ("skip" in evaluation) {
      row.outcome = { kind: "skipped", reason: evaluation.skip };
    } else if (evaluation.predicates.some((predicate) => predicateMatches(predicate, domain))) {
      row.outcome = { kind: "hit" };
      matchedIndex = index;
    }
    trace.push(row);
  }

  const matchedRoute = matchedIndex >= 0 ? input.routes[matchedIndex] : undefined;
  return {
    status: matchedRoute ? "matched" : "unmatched",
    domain,
    ...(matchedRoute
      ? {
          matched: {
            index: matchedIndex,
            routeId: matchedRoute.id,
            label: sourceLabel(matchedRoute.source),
            ...resolvePolicy(matchedRoute.policy, input),
          },
        }
      : {}),
    trace,
  };
}
