import { parseRouteKitConfig } from "@clash-route-kit/core";
import routesYaml from "../../../config/routes.yaml?raw";

export const bundledProjectConfig = parseRouteKitConfig(routesYaml);
export const bundledProjectConfigYaml = routesYaml;
