/**
 * 前端统一 fetch 入口：对本地 /api 路径附加启动 token 头
 * （token 由服务端注入 index.html 的 <meta>，见 local-server hostingHandler）。
 * 非本地 api 路径（/templates、外部探活等）原样透传，不携带凭据。
 * 签名对齐各调用点既有的 Fetcher 类型（RequestInfo | URL）。
 */

const TOKEN_META_SELECTOR = 'meta[name="clash-route-kit-token"]';
const TOKEN_HEADER = "x-clash-route-kit-token";

function requestPathname(input: RequestInfo | URL): string | null {
  if (typeof input === "string") {
    try {
      return new URL(input, "http://route-kit.invalid").pathname;
    } catch {
      return null;
    }
  }
  if (input instanceof URL) return input.pathname;
  // Request 对象：不注入（前端代码不以此形式调 /api）
  return null;
}

export async function authorizedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const pathname = requestPathname(input);
  const isLocalApi = pathname !== null && pathname.startsWith("/api/");
  if (!isLocalApi) return fetch(input, init);

  const token = document.head.querySelector(TOKEN_META_SELECTOR)?.getAttribute("content");
  if (!token) return fetch(input, init);

  const headers = new Headers(init?.headers);
  headers.set(TOKEN_HEADER, token);
  return fetch(input, { ...init, headers });
}
