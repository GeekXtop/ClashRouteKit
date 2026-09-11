import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { createRouteKitApiHandler } from "../cli/src/serveApi.js";
import { createHostingHandler } from "../cli/src/serveHosting.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const projectRoot = path.resolve(process.env.CLASH_ROUTE_KIT_ROOT ?? root);
const configFile = process.env.CLASH_ROUTE_KIT_CONFIG ?? "config/routes.yaml";

export function resolveProjectConfigPath(
  configuredRoot: string,
  configuredFile: string,
): string {
  return path.resolve(configuredRoot, configuredFile);
}

export function resolveRoutesConfigSourcePath(
  configuredRoot: string,
  configuredFile: string,
): string {
  const configPath = resolveProjectConfigPath(configuredRoot, configuredFile);
  if (existsSync(configPath)) return configPath;
  return path.join(path.dirname(configPath), "routes.yaml.example");
}

export function createConfigWatchIgnore(
  configuredRoot: string,
  configuredFile: string,
) {
  const configPath = resolveProjectConfigPath(configuredRoot, configuredFile);
  return (watchedPath: string): boolean => path.resolve(watchedPath) === configPath;
}

const routesConfigVirtualId = "virtual:routes-config-yaml";

function routesConfigInlinePlugin(): Plugin {
  return {
    name: "route-kit-routes-config-inline",
    resolveId(id) {
      if (id === routesConfigVirtualId) return `\0${routesConfigVirtualId}`;
      return null;
    },
    load(id) {
      if (id !== `\0${routesConfigVirtualId}`) return null;
      const sourcePath = resolveRoutesConfigSourcePath(projectRoot, configFile);
      return `export default ${JSON.stringify(readFileSync(sourcePath, "utf8"))};`;
    },
  };
}

function routeKitApiPlugin(): Plugin {
  return {
    name: "route-kit-local-api",
    configureServer(server) {
      const base = { root: projectRoot, configFile };
      server.middlewares.use(
        createHostingHandler({
          ...base,
          publicBase: process.env.CLASH_ROUTE_KIT_PUBLISH_BASE_URL ?? "http://127.0.0.1:8787",
        }),
      );
      server.middlewares.use(createRouteKitApiHandler(base));
    },
  };
}

export default defineConfig({
  plugins: [routeKitApiPlugin(), routesConfigInlinePlugin(), react()],
  resolve: {
    alias: {
      "@clash-route-kit/core": path.resolve(root, "packages/core/src/index.ts"),
    },
  },
  server: {
    fs: {
      allow: [root],
    },
    watch: {
      ignored: createConfigWatchIgnore(projectRoot, configFile),
    },
  },
});
