import type {
  CustomProxyGroup,
  GeoipRuleSetSource,
  RouteKitConfig,
  RouteKitDefaults,
  RuleProviderRuleSetSource,
} from "./types.js";
import type { Diagnostic } from "./config/diagnostics.js";

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

function pushInvalid(
  diagnostics: Diagnostic[],
  code: string,
  path: string,
  message: string,
  invalid: boolean,
): void {
  if (invalid) diagnostics.push({ code, severity: "error", path, message });
}

export function appendDefaultValueDiagnostics(
  config: RouteKitConfig,
  diagnostics: Diagnostic[],
): void {
  const health = config.defaults?.proxyGroups?.healthCheck;
  pushInvalid(
    diagnostics,
    "defaults.health-check.url",
    "defaults.proxyGroups.healthCheck.url",
    "健康检查 URL 必须是 HTTP/HTTPS URL",
    health?.url !== undefined && !isHttpUrl(health.url),
  );
  pushInvalid(
    diagnostics,
    "defaults.health-check.interval",
    "defaults.proxyGroups.healthCheck.interval",
    "健康检查 interval 必须为正整数",
    health?.interval !== undefined && !isPositiveInteger(health.interval),
  );
  pushInvalid(
    diagnostics,
    "defaults.health-check.timeout",
    "defaults.proxyGroups.healthCheck.timeout",
    "健康检查 timeout 必须为正整数",
    health?.timeout !== undefined && !isPositiveInteger(health.timeout),
  );
  const defaultTolerance = config.defaults?.proxyGroups?.urlTest?.tolerance;
  pushInvalid(
    diagnostics,
    "defaults.url-test.tolerance",
    "defaults.proxyGroups.urlTest.tolerance",
    "url-test tolerance 必须为非负整数",
    defaultTolerance !== undefined && !isNonNegativeInteger(defaultTolerance),
  );
  const defaultInterval = config.defaults?.ruleSets?.ruleProviderInterval;
  pushInvalid(
    diagnostics,
    "defaults.route.interval",
    "defaults.ruleSets.ruleProviderInterval",
    "RuleSet interval 必须为正整数",
    defaultInterval !== undefined && !isPositiveInteger(defaultInterval),
  );

  for (const [index, group] of config.customProxyGroups.entries()) {
    const base = `customProxyGroups[${index}]`;
    pushInvalid(
      diagnostics,
      "group.health-check.url",
      `${base}.url`,
      `策略组 ${group.name} 的 URL 必须是 HTTP/HTTPS URL`,
      group.url !== undefined && !isHttpUrl(group.url),
    );
    pushInvalid(
      diagnostics,
      "group.health-check.interval",
      `${base}.interval`,
      `策略组 ${group.name} 的 interval 必须为正整数`,
      group.interval !== undefined && !isPositiveInteger(group.interval),
    );
    pushInvalid(
      diagnostics,
      "group.health-check.timeout",
      `${base}.timeout`,
      `策略组 ${group.name} 的 timeout 必须为正整数`,
      group.timeout !== undefined
        && group.timeout !== null
        && !isPositiveInteger(group.timeout),
    );
    pushInvalid(
      diagnostics,
      "group.health-check.tolerance",
      `${base}.tolerance`,
      `策略组 ${group.name} 的 tolerance 必须为非负整数`,
      group.tolerance !== undefined
        && group.tolerance !== null
        && !isNonNegativeInteger(group.tolerance),
    );
  }

  for (const [index, ruleSet] of config.ruleSets.entries()) {
    if (ruleSet.source.type !== "rule-provider") continue;
    pushInvalid(
      diagnostics,
      "route.interval",
      `ruleSets[${index}].source.interval`,
      `RuleSet ${ruleSet.id} 的 interval 必须为正整数`,
      ruleSet.source.interval !== undefined
        && !isPositiveInteger(ruleSet.source.interval),
    );
  }
}

function formatLegacyDefaultDiagnostic(
  config: RouteKitConfig,
  diagnostic: Diagnostic,
): string {
  switch (diagnostic.code) {
    case "defaults.health-check.url":
      return diagnostic.path
        ? `${diagnostic.path} 必须是 HTTP/HTTPS URL`
        : diagnostic.message;
    case "defaults.health-check.interval":
    case "defaults.health-check.timeout":
    case "defaults.route.interval":
      return diagnostic.path
        ? `${diagnostic.path} 必须为正整数`
        : diagnostic.message;
    case "defaults.url-test.tolerance":
      return diagnostic.path
        ? `${diagnostic.path} 必须为非负整数`
        : diagnostic.message;
    case "group.health-check.url":
    case "group.health-check.interval":
    case "group.health-check.timeout":
    case "group.health-check.tolerance": {
      const match = diagnostic.path?.match(/^customProxyGroups\[(\d+)]\./);
      const group = match ? config.customProxyGroups[Number(match[1])] : undefined;
      if (!group) return diagnostic.message;
      const field = diagnostic.code.slice("group.health-check.".length);
      const requirement = field === "url"
        ? "必须是 HTTP/HTTPS URL"
        : field === "tolerance"
          ? "必须为非负整数"
          : "必须为正整数";
      return `custom_proxy_group ${group.name} 的 ${field} ${requirement}`;
    }
    default:
      return diagnostic.message;
  }
}

/** @deprecated Use validateLegacyProjectConfig. */
export function validateDefaultAwareConfig(config: RouteKitConfig): string[] {
  const diagnostics: Diagnostic[] = [];
  appendDefaultValueDiagnostics(config, diagnostics);
  return diagnostics.map((diagnostic) => (
    formatLegacyDefaultDiagnostic(config, diagnostic)
  ));
}
