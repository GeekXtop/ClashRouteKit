import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { createRouteKitApiHandler } from "./dev/routeKitApi.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const configFile = process.env.CLASH_ROUTE_KIT_CONFIG ?? "config/modules.yaml";

function routeKitApiPlugin(): Plugin {
  return {
    name: "route-kit-local-api",
    configureServer(server) {
      server.middlewares.use(
        createRouteKitApiHandler({
          root: process.env.CLASH_ROUTE_KIT_ROOT ?? root,
          configFile,
        }),
      );
    },
  };
}

export default defineConfig({
  plugins: [routeKitApiPlugin(), react()],
  resolve: {
    alias: {
      "@clash-route-kit/core": path.resolve(root, "packages/core/src/index.ts"),
    },
  },
  server: {
    fs: {
      allow: [root],
    },
  },
});
