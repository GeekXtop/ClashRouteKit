import YAML from "yaml";
import { parseLegacyProjectConfig } from "./config/legacyParser.js";
import type { RouteKitProjectConfig } from "./types.js";

export function parseRouteKitConfig(text: string): RouteKitProjectConfig {
  return parseLegacyProjectConfig(YAML.parse(text) as unknown);
}

export function serializeRouteKitConfig(config: RouteKitProjectConfig): string {
  return YAML.stringify(config, { lineWidth: 0 }).replace(/\n?$/, "\n");
}
