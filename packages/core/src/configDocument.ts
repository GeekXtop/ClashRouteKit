import YAML from "yaml";
import type { RouteKitProjectConfig } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRouteKitProjectConfig(value: unknown): asserts value is RouteKitProjectConfig {
  if (!isRecord(value)) {
    throw new Error("Invalid RouteKit project config: expected object");
  }

  const template = value.template;
  if ("proxyGroups" in value || "modules" in value) {
    throw new Error("Invalid RouteKit project config");
  }

  if (
    typeof value.publishBaseUrl !== "string" ||
    !isRecord(template) ||
    typeof template.output !== "string" ||
    !Array.isArray(value.vendorRepos) ||
    !Array.isArray(value.customProxyGroups) ||
    !Array.isArray(value.ruleSets)
  ) {
    throw new Error("Invalid RouteKit project config");
  }
}

export function parseRouteKitConfig(text: string): RouteKitProjectConfig {
  const parsed = YAML.parse(text) as unknown;
  assertRouteKitProjectConfig(parsed);
  return parsed;
}

export function serializeRouteKitConfig(config: RouteKitProjectConfig): string {
  return YAML.stringify(config, { lineWidth: 0 }).replace(/\n?$/, "\n");
}
