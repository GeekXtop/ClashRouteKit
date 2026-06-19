import type { ProviderBehavior, RouteKitProjectConfig, RuleSet } from "@clash-route-kit/core";

export interface RouteSummaryRow {
  id: string;
  enabled: boolean;
  policy: string;
  source: string;
  output: string;
}

export interface CustomProxyGroupStat {
  name: string;
  ruleSets: number;
  options: number;
}

function providerKind(behavior: ProviderBehavior): string {
  if (behavior === "domain") return "clash-domain";
  if (behavior === "classical") return "clash-classic";
  return "clash-ipcidr";
}

function publishRulesUrl(baseUrl: string, file: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/rules/${file}`;
}

export function ruleSetSourceText(ruleSet: RuleSet): string {
  const source = ruleSet.source;
  if (source.type === "rule-provider") {
    return `${providerKind(source.behavior)}:${source.file}`;
  }
  if (source.type === "geosite") {
    return `[]GEOSITE,${source.value}`;
  }
  if (source.type === "geoip") {
    return `[]GEOIP,${source.value}${source.noResolve !== false ? ",no-resolve" : ""}`;
  }
  return "[]FINAL";
}

function ruleSetOutput(ruleSet: RuleSet, publishBaseUrl: string): string {
  const source = ruleSet.source;
  if (source.type === "rule-provider") {
    return `ruleset=${ruleSet.policy},${providerKind(source.behavior)}:${publishRulesUrl(
      publishBaseUrl,
      source.file,
    )},${source.interval ?? 28800}`;
  }
  if (source.type === "geosite") {
    return `ruleset=${ruleSet.policy},[]GEOSITE,${source.value}`;
  }
  if (source.type === "geoip") {
    return `ruleset=${ruleSet.policy},[]GEOIP,${source.value}${source.noResolve !== false ? ",no-resolve" : ""}`;
  }
  return `ruleset=${ruleSet.policy},[]FINAL`;
}

export function createRouteSummary(config: RouteKitProjectConfig): RouteSummaryRow[] {
  return config.ruleSets.map((ruleSet) => ({
    id: ruleSet.id,
    enabled: ruleSet.enabled !== false,
    policy: ruleSet.policy,
    source: ruleSetSourceText(ruleSet),
    output: ruleSetOutput(ruleSet, config.publishBaseUrl),
  }));
}

export function createCustomProxyGroupStats(config: RouteKitProjectConfig): CustomProxyGroupStat[] {
  const enabled = config.ruleSets.filter((ruleSet) => ruleSet.enabled !== false);

  return config.customProxyGroups.map((group) => ({
    name: group.name,
    ruleSets: enabled.filter((ruleSet) => ruleSet.policy === group.name).length,
    options: group.options.length + (group.nodeFilters?.length ?? 0),
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
      source: ruleSetSourceText(ruleSet),
    }));
}
