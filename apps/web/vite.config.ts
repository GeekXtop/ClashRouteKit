import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
// 说明：vite 8 加载配置文件（configLoader: "bundle"）会把裸包名导入 externalize
// 后交给 Node 原生解析，conditions 只有 [node, import]，会落到 dist（且 Node 无法
// 直接加载本包 src 内部以 .js 后缀引用的 .ts 源码）。这里沿用配置文件相对内联的
// 方式指向 local-server 公开源码入口，保证 dev 始终命中 src 而非 dist；
// 同名包别名仍注册在 resolve.alias 中，供客户端侧解析使用。
import { createLocalServerContext } from "../../packages/local-server/src/index.js";

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
      const { hostingHandler, apiHandler } = createLocalServerContext({
        root: projectRoot,
        configFile,
        publicBase: process.env.CLASH_ROUTE_KIT_PUBLISH_BASE_URL ?? "http://127.0.0.1:8787",
      });
      server.middlewares.use(hostingHandler);
      server.middlewares.use(apiHandler);
    },
  };
}

export default defineConfig({
  plugins: [routeKitApiPlugin(), routesConfigInlinePlugin(), react()],
  resolve: {
    alias: {
      "@clash-route-kit/core": path.resolve(root, "packages/core/src/index.ts"),
      "@clash-route-kit/local-server": path.resolve(root, "packages/local-server/src/index.ts"),
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
