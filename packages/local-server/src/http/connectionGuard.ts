import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * 连接校验中间件：本地编辑服务不能被浏览器跨站或局域网匿名访问。
 * 三层防线（spec: docs/superpowers/specs/2026-10-19-connection-guard-design.md）：
 * 1. Host 白名单——所有路径生效，非白名单主机直接 403（防 DNS rebinding / 直连探测）；
 * 2. /api 上的非安全方法要求同源（Origin 或 Sec-Fetch-Site 校验，防 CSRF）；
 * 3. /api 全方法要求每次启动生成的 token（防旧页面/旧 bundle 继续写）。
 * /templates、/rules 免 token（SubConverter 需匿名拉取），但仍受 Host 白名单约束。
 */

export interface ConnectionGuardOptions {
  /** 每次服务启动随机生成的访问 token。 */
  token: string;
  /** CLI --host / 绑定地址；通配值（0.0.0.0 等）不进白名单。 */
  serveHost?: string;
  /** 公开基址（publicBase），其 host 一并放行。 */
  publicBaseUrl?: string;
}

export type ConnectionGuard = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => void;

const TOKEN_HEADER = "x-clash-route-kit-token";

/** 环回地址永远放行（编辑器与本机工具的常规入口）。 */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

const WILDCARD_HOSTS = new Set(["0.0.0.0", "::", "*", "[::]", ""]);

export function normalizeHostHeader(host: string | undefined): string | null {
  if (!host) return null;
  const value = host.trim().toLowerCase();
  if (!value) return null;
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end === -1 ? value : value.slice(0, end + 1);
  }
  const firstColon = value.indexOf(":");
  const lastColon = value.lastIndexOf(":");
  // 单冒号按 host:port 剥端口；多个冒号是无方括号的裸 IPv6，原样保留。
  if (firstColon !== -1 && firstColon === lastColon) return value.slice(0, firstColon);
  return value;
}

export function isWildcardHost(host: string): boolean {
  return WILDCARD_HOSTS.has(host.trim().toLowerCase());
}

/**
 * 启动期绑定校验：拒绝通配绑定（0.0.0.0 / :: / *）。
 * 通配 bind 时 Host 白名单无法识别来源机器，守卫退化为只靠 token，
 * 按设计直接要求用户绑定具体网卡字面量。
 */
export function assertBindableHost(host: string): void {
  if (!isWildcardHost(host)) return;
  throw new Error(
    `拒绝通配绑定地址 "${host}"：请用具体网卡字面量（如 127.0.0.1 或局域网 IP）启动 serve；` +
      "wildcard bind 会让局域网任意来源访问本地编辑服务，与连接守卫的 Host 白名单不兼容。",
  );
}

function reject(response: ServerResponse, status: number, message: string): void {
  response.statusCode = status;
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.end(message);
}

// 与 hostingHandler 的 /api/ 放行边界保持一致：裸 /api 不进 api 关。
function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export function createConnectionGuard(options: ConnectionGuardOptions): ConnectionGuard {
  const allowed = new Set(LOOPBACK_HOSTS);
  const serveHost = normalizeHostHeader(options.serveHost);
  if (serveHost && !isWildcardHost(serveHost)) allowed.add(serveHost);
  if (options.publicBaseUrl) {
    try {
      const host = normalizeHostHeader(new URL(options.publicBaseUrl).host);
      if (host && !isWildcardHost(host)) allowed.add(host);
    } catch {
      // 非法 publicBase 不放行任何额外主机
    }
  }

  const originAllowed = (origin: string): boolean => {
    try {
      const host = normalizeHostHeader(new URL(origin).host);
      return host !== null && allowed.has(host);
    } catch {
      // "null" 字符串与畸形 Origin 一律不可信
      return false;
    }
  };

  return (request, response, next) => {
    const host = normalizeHostHeader(request.headers.host);
    if (!host) {
      reject(response, 400, "Bad request: missing Host header");
      return;
    }
    if (!allowed.has(host)) {
      reject(
        response,
        403,
        `Forbidden: Host "${host}" is not allowed. Access the editor via 127.0.0.1 or the configured serve host.`,
      );
      return;
    }

    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (!isApiPath(url.pathname)) {
      next();
      return;
    }

    const method = (request.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      const origin = request.headers.origin;
      if (typeof origin === "string" && origin.length > 0) {
        if (!originAllowed(origin)) {
          reject(response, 403, "Forbidden: cross-site request (Origin not allowed)");
          return;
        }
      } else {
        const site = request.headers["sec-fetch-site"];
        const siteValue = Array.isArray(site) ? site[0] : site;
        if (typeof siteValue === "string" && siteValue !== "same-origin" && siteValue !== "none") {
          reject(response, 403, "Forbidden: cross-site request (Sec-Fetch-Site not allowed)");
          return;
        }
        // 无 Origin 无 Sec-Fetch-Site：非浏览器客户端，交给 token 关
      }
    }

    const provided = request.headers[TOKEN_HEADER];
    const tokenValue = Array.isArray(provided) ? provided[0] : provided;
    if (tokenValue !== options.token) {
      reject(
        response,
        403,
        "Forbidden: missing or stale token — refresh the page to continue.",
      );
      return;
    }
    next();
  };
}
