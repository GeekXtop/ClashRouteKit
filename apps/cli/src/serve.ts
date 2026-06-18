import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { createHostingHandler, type HostingOptions } from "./serveHosting.js";
import { createRouteKitApiHandler } from "./serveApi.js";

export interface ServeOptions extends HostingOptions {
  port: number;
  host: string;
}

export function createServeServer(options: ServeOptions): Server {
  const hosting = createHostingHandler(options);
  const api = createRouteKitApiHandler(options);
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
