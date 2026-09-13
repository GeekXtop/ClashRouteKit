import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  createDefaultDependencies,
  createHostingHandler,
  createRouteKitApiHandler,
  type HostingOptions,
} from "@clash-route-kit/local-server";

export interface ServeOptions extends HostingOptions {
  port: number;
  host: string;
}

export function createServeServer(options: ServeOptions): Server {
  // HTTP 装配由 local-server 提供；check/generate/syncVendor 用 createDefaultDependencies
  // 补齐默认实现（原先由 program.ts 注入，现已下沉 local-server）。
  const defaults = createDefaultDependencies(options.root, options.configFile);
  const hosting = createHostingHandler(options);
  const api = createRouteKitApiHandler({
    ...options,
    checkConfig: defaults.checkConfig,
    generateOutputs: defaults.generateOutputs,
    syncVendor: defaults.syncVendor,
  });
  return createServer((request, response) => {
    hosting(request, response, () => {
      api(request, response, () => {
        response.statusCode = 404;
        response.setHeader("content-type", "text/plain; charset=utf-8");
        response.end("Not found");
      });
    });
  });
}

export async function startServe(options: ServeOptions): Promise<Server> {
  if (options.webRoot && !existsSync(path.resolve(options.webRoot, "index.html"))) {
    throw new Error(
      `web build not found at ${options.webRoot}. Run "pnpm build" first, or pass --web-root.`,
    );
  }
  const server = createServeServer(options);
  await new Promise<void>((resolve) => server.listen(options.port, options.host, resolve));
  console.log(`[serve] editor:      http://${options.host}:${options.port}`);
  console.log(`[serve] public-base: ${options.publicBase}  (subconverter pulls INI from here)`);
  console.log(`[serve] templates:   ${options.publicBase}/templates/*.ini (live)`);
  return server;
}
