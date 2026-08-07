import {
  resolveGeoipNoResolve,
  resolveProxyGroupHealthCheck,
  resolveRuleProviderInterval,
  type CustomProxyGroup,
  type ProviderBehavior,
  type ResolvedProxyGroupHealthCheck,
  type RouteKitDefaults,
  type RouteKitProjectConfig,
  type RuleSet,
} from "@clash-route-kit/core";

export interface RouteSummaryRow {
  id: string;
  enabled: boolean;
  policy: string;
  source: string;
  output: string;
}

export interface CustomProxyGroupStat {
  name: string;
  type: CustomProxyGroup["type"];
  directRuleSetCount: number;
  referencedByGroupCount: number;
  memberCount: number;
}

function providerKind(behavior: ProviderBehavior): string {
  if (behavior === "domain") return "clash-domain";
  if (behavior === "classical") return "clash-classic";
  return "clash-ipcidr";
}

function publishRulesUrl(baseUrl: string, file: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/rules/${file}`;
}

export function ruleSetSourceText(ruleSet: RuleSet, defaults?: RouteKitDefaults): string {
  const source = ruleSet.source;
  if (source.type === "rule-provider") {
    return `${providerKind(source.behavior)}:${source.file}`;
  }
  if (source.type === "geosite") {
    return `[]GEOSITE,${source.value}`;
  }
  if (source.type === "geoip") {
    return `[]GEOIP,${source.value}${resolveGeoipNoResolve(source, defaults).value ? ",no-resolve" : ""}`;
  }
  return "[]FINAL";
}

function ruleSetOutput(
  ruleSet: RuleSet,
  publishBaseUrl: string,
  defaults?: RouteKitDefaults,
): string {
  const source = ruleSet.source;
  if (source.type === "rule-provider") {
    return `ruleset=${ruleSet.policy},${providerKind(source.behavior)}:${publishRulesUrl(
      publishBaseUrl,
      source.file,
    )},${resolveRuleProviderInterval(source, defaults).value}`;
  }
  if (source.type === "geosite") {
    return `ruleset=${ruleSet.policy},[]GEOSITE,${source.value}`;
  }
  if (source.type === "geoip") {
    return `ruleset=${ruleSet.policy},[]GEOIP,${source.value}${resolveGeoipNoResolve(source, defaults).value ? ",no-resolve" : ""}`;
  }
  return `ruleset=${ruleSet.policy},[]FINAL`;
}

export function createRouteSummary(config: RouteKitProjectConfig): RouteSummaryRow[] {
  return config.ruleSets.map((ruleSet) => ({
    id: ruleSet.id,
    enabled: ruleSet.enabled !== false,
    policy: ruleSet.policy,
    source: ruleSetSourceText(ruleSet, config.defaults),
    output: ruleSetOutput(ruleSet, config.publishBaseUrl, config.defaults),
  }));
}

export function createCustomProxyGroupStats(config: RouteKitProjectConfig): CustomProxyGroupStat[] {
  const directRuleSetCounts = new Map<string, number>();
  const referencedByGroupCounts = new Map<string, number>();

  for (const ruleSet of config.ruleSets) {
    directRuleSetCounts.set(
      ruleSet.policy,
      (directRuleSetCounts.get(ruleSet.policy) ?? 0) + 1,
    );
  }
  for (const parent of config.customProxyGroups) {
    for (const option of new Set(parent.options)) {
      referencedByGroupCounts.set(option, (referencedByGroupCounts.get(option) ?? 0) + 1);
    }
  }

  return config.customProxyGroups.map((group) => ({
    name: group.name,
    type: group.type,
    directRuleSetCount: directRuleSetCounts.get(group.name) ?? 0,
    referencedByGroupCount: referencedByGroupCounts.get(group.name) ?? 0,
    memberCount: group.options.length + (group.nodeFilters?.length ?? 0),
  }));
}

export interface InboundRuleSetRow {
  id: string;
  enabled: boolean;
  source: string;
}

export function selectInboundRuleSets(
  config: RouteKitProjectConfig,
  groupName: string,
): InboundRuleSetRow[] {
  return config.ruleSets
    .filter((ruleSet) => ruleSet.policy === groupName)
    .map((ruleSet) => ({
      id: ruleSet.id,
      enabled: ruleSet.enabled !== false,
      source: ruleSetSourceText(ruleSet, config.defaults),
    }));
}

export interface ReferencingProxyGroupRow {
  name: string;
  type: CustomProxyGroup["type"];
}

export interface CustomProxyGroupDetails {
  directRuleSets: InboundRuleSetRow[];
  referencedByGroups: ReferencingProxyGroupRow[];
  memberCount: number;
  healthCheck?: ResolvedProxyGroupHealthCheck;
}

export function createCustomProxyGroupDetails(
  config: RouteKitProjectConfig,
  groupName: string,
): CustomProxyGroupDetails | undefined {
  const group = config.customProxyGroups.find((item) => item.name === groupName);
  if (!group) return undefined;

  return {
    directRuleSets: selectInboundRuleSets(config, groupName),
    referencedByGroups: config.customProxyGroups
      .filter((parent) => parent.name !== groupName && parent.options.includes(groupName))
      .map((parent) => ({ name: parent.name, type: parent.type })),
    memberCount: group.options.length + (group.nodeFilters?.length ?? 0),
    ...(group.type === "select"
      ? {}
      : { healthCheck: resolveProxyGroupHealthCheck(group, config.defaults) }),
  };
}
