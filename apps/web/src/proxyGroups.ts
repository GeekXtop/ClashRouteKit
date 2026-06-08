import type { CustomProxyGroup } from "@clash-route-kit/core";

export interface RegionPreset {
  label: string;
  regex: string;
}

export const REGION_PRESETS: RegionPreset[] = [
  { label: "🇭🇰 香港", regex: "(港|HK)" },
  { label: "🇹🇼 台湾", regex: "(台|TW)" },
  { label: "🇸🇬 新加坡", regex: "(新加坡|狮城|SG)" },
  { label: "🇯🇵 日本", regex: "(日本|JP)" },
  { label: "🇺🇸 美国", regex: "(美|US)" },
  { label: "🇰🇷 韩国", regex: "(韩|KR)" },
  { label: "全部节点", regex: ".*" },
];

export type NodeFilterScopeType = "all" | "groupId" | "group";

export interface NodeFilterParts {
  scopeType: NodeFilterScopeType;
  scopeValue: string;
  regex: string;
}

export function composeNodeFilter(parts: NodeFilterParts): string {
  const regex = parts.regex.trim() || ".*";
  const scopeValue = parts.scopeValue.trim();
  if (parts.scopeType === "groupId" && scopeValue !== "") {
    return `!!GROUPID=${scopeValue}!!${regex}`;
  }
  if (parts.scopeType === "group" && scopeValue !== "") {
    return `!!GROUP=${scopeValue}!!${regex}`;
  }
  return regex;
}

export function parseNodeFilter(value: string): NodeFilterParts {
  const groupId = /^!!GROUPID=([^!]*)!!([\s\S]*)$/.exec(value);
  if (groupId) {
    return { scopeType: "groupId", scopeValue: groupId[1] ?? "", regex: groupId[2] ?? "" };
  }
  const group = /^!!GROUP=([^!]*)!!([\s\S]*)$/.exec(value);
  if (group) {
    return { scopeType: "group", scopeValue: group[1] ?? "", regex: group[2] ?? "" };
  }
  return { scopeType: "all", scopeValue: "", regex: value };
}

export interface ProxyGroupTreeNode {
  name: string;
  children: ProxyGroupTreeNode[];
  cyclic?: boolean;
  external?: boolean;
}

export function buildProxyGroupTree(
  groups: CustomProxyGroup[],
  rootName: string,
): ProxyGroupTreeNode {
  const byName = new Map(groups.map((group) => [group.name, group]));

  function build(name: string, ancestors: Set<string>): ProxyGroupTreeNode {
    const group = byName.get(name);
    if (!group) return { name, children: [], external: true };
    if (ancestors.has(name)) return { name, children: [], cyclic: true };
    const nextAncestors = new Set(ancestors).add(name);
    return {
      name,
      children: group.options.map((option) => build(option, nextAncestors)),
    };
  }

  return build(rootName, new Set());
}

export function detectProxyGroupCycles(groups: CustomProxyGroup[]): string[][] {
  const byName = new Map(groups.map((group) => [group.name, group]));
  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const seen = new Set<string>();

  function dfs(name: string): void {
    const group = byName.get(name);
    if (!group) return;
    color.set(name, 1);
    stack.push(name);
    for (const option of group.options) {
      if (!byName.has(option)) continue;
      const optionColor = color.get(option) ?? 0;
      if (optionColor === 1) {
        const start = stack.indexOf(option);
        const cycle = stack.slice(start);
        const key = [...cycle].sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(cycle);
        }
      } else if (optionColor === 0) {
        dfs(option);
      }
    }
    stack.pop();
    color.set(name, 2);
  }

  for (const group of groups) {
    if ((color.get(group.name) ?? 0) === 0) dfs(group.name);
  }
  return cycles;
}

export function groupsInCycles(groups: CustomProxyGroup[]): Set<string> {
  const names = new Set<string>();
  for (const cycle of detectProxyGroupCycles(groups)) {
    for (const name of cycle) names.add(name);
  }
  return names;
}
