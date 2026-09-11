import { parseRouteKitConfig } from "@clash-route-kit/core";
import routesYaml from "virtual:routes-config-yaml";

export const bundledProjectConfig = parseRouteKitConfig(routesYaml);
export const bundledProjectConfigYaml = routesYaml;
