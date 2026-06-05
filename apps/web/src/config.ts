import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import YAML from "yaml";
import modulesYaml from "../../../config/modules.yaml?raw";

export const projectConfig = YAML.parse(modulesYaml) as RouteKitProjectConfig;
