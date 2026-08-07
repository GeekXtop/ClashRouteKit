import type {
  CustomProxyGroup,
  GeoipRuleSetSource,
  RouteKitConfig,
  RouteKitDefaults,
  RuleProviderRuleSetSource,
} from "./types.js";

export const LEGACY_HEALTH_CHECK_URL = "https://cp.cloudflare.com/generate_204";
export const LEGACY_HEALTH_CHECK_INTERVAL = 300;
export const LEGACY_URL_TEST_TOLERANCE = 50;
export const LEGACY_RULE_PROVIDER_INTERVAL = 28800;
export const LEGACY_GEOIP_NO_RESOLVE = true;

export type ResolvedConfigValueSource = "item" | "project" | "fallback" | "empty";

export interface ResolvedConfigValue<T> {
  value: T | undefined;
  source: ResolvedConfigValueSource;
}

export interface ResolvedProxyGroupHealthCheck {
  url: ResolvedConfigValue<string>;
  interval: ResolvedConfigValue<number>;
  timeout: ResolvedConfigValue<number>;
  tolerance: ResolvedConfigValue<number>;
}

function resolveValue<T>(
  itemValue: T | undefined,
  projectValue: T | undefined,
  fallbackValue: T | undefined,
): ResolvedConfigValue<T> {
  if (itemValue !== undefined) return { value: itemValue, source: "item" };
  if (projectValue !== undefined) return { value: projectValue, source: "project" };
  return { value: fallbackValue, source: "fallback" };
}

function resolveNullableValue<T>(
  itemValue: T | null | undefined,
  projectValue: T | undefined,
  fallbackValue: T | undefined,
): ResolvedConfigValue<T> {
  if (itemValue === null) return { value: undefined, source: "empty" };
  return resolveValue(itemValue, projectValue, fallbackValue);
}

export function resolveProxyGroupHealthCheck(
  group: CustomProxyGroup,
  defaults?: RouteKitDefaults,
): ResolvedProxyGroupHealthCheck {
  const healthCheck = defaults?.proxyGroups?.healthCheck;
  const projectTolerance =
    group.type === "url-test" ? defaults?.proxyGroups?.urlTest?.tolerance : undefined;

  return {
    url: resolveValue(group.url, healthCheck?.url, LEGACY_HEALTH_CHECK_URL),
    interval: resolveValue(group.interval, healthCheck?.interval, LEGACY_HEALTH_CHECK_INTERVAL),
    timeout: resolveNullableValue(group.timeout, healthCheck?.timeout, undefined),
    tolerance: resolveNullableValue(
      group.tolerance,
      projectTolerance,
      LEGACY_URL_TEST_TOLERANCE,
    ),
  };
}

export function resolveRuleProviderInterval(
  source: RuleProviderRuleSetSource,
  defaults?: RouteKitDefaults,
): ResolvedConfigValue<number> {
  return resolveValue(
    source.interval,
    defaults?.ruleSets?.ruleProviderInterval,
    LEGACY_RULE_PROVIDER_INTERVAL,
  );
}

export function resolveGeoipNoResolve(
  source: GeoipRuleSetSource,
  defaults?: RouteKitDefaults,
): ResolvedConfigValue<boolean> {
  return resolveValue(
    source.noResolve,
    defaults?.ruleSets?.geoipNoResolve,
    LEGACY_GEOIP_NO_RESOLVE,
  );
}

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function validateOptionalUrl(value: unknown, label: string, diagnostics: string[]): void {
  if (value !== undefined && !isHttpUrl(value)) {
    diagnostics.push(`${label} 必须是 HTTP/HTTPS URL`);
  }
}

function validateOptionalPositiveInteger(
  value: unknown,
  label: string,
  diagnostics: string[],
): void {
  if (value !== undefined && !isPositiveInteger(value)) {
    diagnostics.push(`${label} 必须为正整数`);
  }
}

function validateOptionalNonNegativeInteger(
  value: unknown,
  label: string,
  diagnostics: string[],
): void {
  if (value !== undefined && !isNonNegativeInteger(value)) {
    diagnostics.push(`${label} 必须为非负整数`);
  }
}

export function validateDefaultAwareConfig(config: RouteKitConfig): string[] {
  const diagnostics: string[] = [];
  const healthCheck = config.defaults?.proxyGroups?.healthCheck;

  validateOptionalUrl(
    healthCheck?.url,
    "defaults.proxyGroups.healthCheck.url",
    diagnostics,
  );
  validateOptionalPositiveInteger(
    healthCheck?.interval,
    "defaults.proxyGroups.healthCheck.interval",
    diagnostics,
  );
  validateOptionalPositiveInteger(
    healthCheck?.timeout,
    "defaults.proxyGroups.healthCheck.timeout",
    diagnostics,
  );
  validateOptionalNonNegativeInteger(
    config.defaults?.proxyGroups?.urlTest?.tolerance,
    "defaults.proxyGroups.urlTest.tolerance",
    diagnostics,
  );
  validateOptionalPositiveInteger(
    config.defaults?.ruleSets?.ruleProviderInterval,
    "defaults.ruleSets.ruleProviderInterval",
    diagnostics,
  );

  for (const group of config.customProxyGroups) {
    const label = `custom_proxy_group ${group.name}`;
    validateOptionalUrl(group.url, `${label} 的 url`, diagnostics);
    validateOptionalPositiveInteger(group.interval, `${label} 的 interval`, diagnostics);
    if (group.timeout !== null) {
      validateOptionalPositiveInteger(group.timeout, `${label} 的 timeout`, diagnostics);
    }
    if (group.tolerance !== null) {
      validateOptionalNonNegativeInteger(group.tolerance, `${label} 的 tolerance`, diagnostics);
    }
  }

  for (const ruleSet of config.ruleSets) {
    if (ruleSet.source.type === "rule-provider") {
      validateOptionalPositiveInteger(
        ruleSet.source.interval,
        `RuleSet ${ruleSet.id} 的 interval`,
        diagnostics,
      );
    }
  }

  return diagnostics;
}
