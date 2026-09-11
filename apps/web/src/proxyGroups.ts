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

export type PolicyTone = "dir" | "rej" | "cat" | "reg" | "fin";

/**
 * Assign a design-book color tone to a policy/proxy-group name.
 * Common semantics get fixed tones (direct=green, reject=red, final=yellow);
 * everything else hashes deterministically to purple (service) or blue (region/proxy).
 */
export function policyTone(name: string): PolicyTone {
  const lower = name.toLowerCase();
  if (/直连|direct|局域|lan|国内/.test(lower)) return "dir";
  if (/拦截|广告|reject|adblock|ad-?block|\bban\b/.test(lower)) return "rej";
  if (/final|漏网|兜底|fish/.test(lower)) return "fin";
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return hash % 2 === 0 ? "cat" : "reg";
}
