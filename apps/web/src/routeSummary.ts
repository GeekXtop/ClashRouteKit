import type { RouteKitProjectConfig } from "@clash-route-kit/core";

export type RouteSource = "Provider" | "GEOSITE" | "GEOIP" | "FINAL";

export interface RouteSummaryRow {
  moduleId: string;
  source: RouteSource;
  value: string;
  policy: string;
}

export interface PolicyStat {
  name: string;
  modules: number;
  options: number;
}

function enabledModules(config: RouteKitProjectConfig) {
  return config.modules.filter((module) => module.enabled !== false);
}

export function createRouteSummary(config: RouteKitProjectConfig): RouteSummaryRow[] {
  const rows: RouteSummaryRow[] = [];

  for (const module of enabledModules(config)) {
    for (const provider of module.providers ?? []) {
      rows.push({
        moduleId: module.id,
        source: "Provider",
        value: provider.file,
        policy: module.policy,
      });
    }

    for (const tag of module.geosite ?? []) {
      rows.push({ moduleId: module.id, source: "GEOSITE", value: tag, policy: module.policy });
    }

    for (const tag of module.geoip ?? []) {
      rows.push({ moduleId: module.id, source: "GEOIP", value: tag, policy: module.policy });
    }
  }

  rows.push({ moduleId: "FINAL", source: "FINAL", value: "fallback", policy: config.final.policy });
  return rows;
}

export function createPolicyStats(config: RouteKitProjectConfig): PolicyStat[] {
  const enabled = enabledModules(config);

  return config.proxyGroups.map((group) => ({
    name: group.name,
    modules: enabled.filter((module) => module.policy === group.name).length,
    options: group.options.length + (group.nodeFilters?.length ?? 0),
  }));
}
