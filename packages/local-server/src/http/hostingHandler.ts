import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseRouteKitConfig, renderIni } from "@clash-route-kit/core";
import type { ProjectOptions } from "../config/configRepository.js";

export interface HostingOptions extends ProjectOptions {
  publicBase: string;
  webRoot?: string;
  readText?: (filePath: string) => Promise<string>;
}

const RULE_FILE = /^[A-Za-z0-9_.-]+\.yaml$/;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function send(res: ServerResponse, status: number, contentType: string, body: string | Buffer): void {
  res.statusCode = status;
  res.setHeader("content-type", contentType);
  res.end(body);
}

export function createHostingHandler(options: HostingOptions) {
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));

  return (request: IncomingMessage, response: ServerResponse, next: () => void): void => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname;

    if (pathname.startsWith("/templates/") && pathname.endsWith(".ini")) {
      const configPath = path.resolve(options.root, options.configFile);
      void readText(configPath)
        .then((text) => {
          const config = parseRouteKitConfig(text);
          const ini = renderIni({ ...config, publishBaseUrl: options.publicBase });
          send(response, 200, "text/plain; charset=utf-8", ini);
        })
        .catch((error: unknown) => {
          send(response, 500, "text/plain; charset=utf-8", error instanceof Error ? error.message : String(error));
        });
      return;
    }

    if (pathname.startsWith("/rules/")) {
      const file = decodeURIComponent(pathname.slice("/rules/".length));
      if (!RULE_FILE.test(file)) {
        send(response, 400, "text/plain; charset=utf-8", `Invalid rule file: ${file}`);
        return;
      }
      const filePath = path.resolve(options.root, "output/rules", file);
      void readText(filePath)
        .then((text) => send(response, 200, "text/yaml; charset=utf-8", text))
        .catch(() => send(response, 404, "text/plain; charset=utf-8", `Not found: ${file}`));
      return;
    }

    if (pathname.startsWith("/api/")) {
      next();
      return;
    }

    if (!options.webRoot) {
      next();
      return;
    }

    const webRoot = options.webRoot;
    const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const candidate = path.resolve(webRoot, rel);
    if (!candidate.startsWith(path.resolve(webRoot))) {
      send(response, 400, "text/plain; charset=utf-8", "Bad path");
      return;
    }
    void readFile(candidate)
      .then((buf) => send(response, 200, CONTENT_TYPES[path.extname(candidate)] ?? "application/octet-stream", buf))
      .catch(() => {
        // SPA fallback
        void readFile(path.resolve(webRoot, "index.html"))
          .then((buf) => send(response, 200, "text/html; charset=utf-8", buf))
          .catch(() => send(response, 404, "text/plain; charset=utf-8", "Not found"));
      });
  };
}
