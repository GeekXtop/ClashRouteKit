import type { RouteKitProjectConfig, RuleSet } from "@clash-route-kit/core";

function isRuleSetEnabled(ruleSet: RuleSet): boolean {
  return ruleSet.enabled !== false;
}

export function setRuleSetEnabled(
  config: RouteKitProjectConfig,
  ruleSetId: string,
  enabled: boolean,
): RouteKitProjectConfig {
  return {
    ...config,
    ruleSets: config.ruleSets.map((ruleSet) =>
      ruleSet.id === ruleSetId ? { ...ruleSet, enabled } : ruleSet,
    ),
  };
}

export function toggleRuleSetEnabled(
  config: RouteKitProjectConfig,
  ruleSetId: string,
): RouteKitProjectConfig {
  const ruleSet = config.ruleSets.find((item) => item.id === ruleSetId);
  if (!ruleSet) return config;
  return setRuleSetEnabled(config, ruleSetId, !isRuleSetEnabled(ruleSet));
}
