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
  const final = value.final;
  if (
    typeof value.publishBaseUrl !== "string" ||
    !isRecord(template) ||
    typeof template.output !== "string" ||
    !Array.isArray(value.vendorRepos) ||
    !Array.isArray(value.proxyGroups) ||
    !Array.isArray(value.modules) ||
    !isRecord(final) ||
    typeof final.policy !== "string"
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
