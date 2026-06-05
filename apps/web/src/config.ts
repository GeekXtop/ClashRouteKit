import { parseRouteKitConfig } from "@clash-route-kit/core";
import modulesYaml from "../../../config/modules.yaml?raw";

export const bundledProjectConfig = parseRouteKitConfig(modulesYaml);
export const bundledProjectConfigYaml = modulesYaml;
