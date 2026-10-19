import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseAuthorProjectConfig, renderIni } from "@clash-route-kit/core";
import { renderedConfigFromAuthorProjectV2, type ProjectOptions } from "../config/configRepository.js";

export interface HostingOptions extends ProjectOptions {
  publicBase: string;
  webRoot?: string;
  readText?: (filePath: string) => Promise<string>;
  /** 提供时注入到所有 html 响应（静态命中与 SPA fallback）的 token meta。 */
  htmlToken?: string;
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

// token 由 randomBytes hex 生成，无转义需求；缺 </head> 时前置到文档开头。
function injectTokenMeta(html: string, token?: string): string {
  if (!token) return html;
  const tag = `<meta name="clash-route-kit-token" content="${token}">`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (match) => `${match}${tag}`);
  return `${tag}${html}`;
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
          // 模板托管仅认 Schema v2（经 v2→渲染 DTO 桥），与 readConfig 同源。
          const parsed = parseAuthorProjectConfig(text);
          if (!(parsed.schemaVersion === 2 && parsed.v2)) {
            throw new Error("不支持 v1 格式：模板托管仅支持 schemaVersion: 2 配置");
          }
          const config = renderedConfigFromAuthorProjectV2(parsed.v2, options.publicBase);
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
    const ext = path.extname(candidate).toLowerCase();
    if (ext === ".html") {
      // html 以文本读出以便注入 token meta（守卫前端消费）
      void readFile(candidate, "utf8")
        .then((html) => send(response, 200, CONTENT_TYPES[".html"]!, injectTokenMeta(html, options.htmlToken)))
        .catch(() => {
          // SPA fallback
          void readFile(path.resolve(webRoot, "index.html"), "utf8")
            .then((html) => send(response, 200, CONTENT_TYPES[".html"]!, injectTokenMeta(html, options.htmlToken)))
            .catch(() => send(response, 404, "text/plain; charset=utf-8", "Not found"));
        });
      return;
    }
    void readFile(candidate)
      .then((buf) => send(response, 200, CONTENT_TYPES[ext] ?? "application/octet-stream", buf))
      .catch(() => {
        // SPA fallback
        void readFile(path.resolve(webRoot, "index.html"), "utf8")
          .then((html) => send(response, 200, CONTENT_TYPES[".html"]!, injectTokenMeta(html, options.htmlToken)))
          .catch(() => send(response, 404, "text/plain; charset=utf-8", "Not found"));
      });
  };
}
