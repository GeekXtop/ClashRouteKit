// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizedFetch } from "../src/apiClient.js";

function setTokenMeta(token: string | null): void {
  document.head.querySelectorAll('meta[name="clash-route-kit-token"]').forEach((node) => node.remove());
  if (token !== null) {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "clash-route-kit-token");
    meta.setAttribute("content", token);
    document.head.appendChild(meta);
  }
}

function stubFetch(): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function cleanup(): void {
  setTokenMeta(null);
}

describe("authorizedFetch", () => {
  it("/api/ 相对路径附加 token 头（读 meta）", async () => {
    setTokenMeta("tok-1");
    const mock = stubFetch();
    await authorizedFetch("/api/project/config");
    const init = mock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(new Headers(init?.headers).get("x-clash-route-kit-token")).toBe("tok-1");
  });

  it("保留调用方已传 headers", async () => {
    setTokenMeta("tok-2");
    const mock = stubFetch();
    await authorizedFetch("/api/project/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
    });
    const init = mock.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = new Headers(init?.headers);
    expect(headers.get("x-clash-route-kit-token")).toBe("tok-2");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("meta 缺失时不加头（由服务端 403 兜底）", async () => {
    setTokenMeta(null);
    const mock = stubFetch();
    await authorizedFetch("/api/project/config");
    const init = mock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(new Headers(init?.headers).get("x-clash-route-kit-token")).toBeNull();
  });

  it("非 /api 相对路径不加头", async () => {
    setTokenMeta("tok-3");
    const mock = stubFetch();
    await authorizedFetch("/templates/Custom_Clash.ini");
    const init = mock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(new Headers(init?.headers).get("x-clash-route-kit-token")).toBeNull();
  });

  it("绝对 URL 不加头（外部探活透传）", async () => {
    setTokenMeta("tok-4");
    const mock = stubFetch();
    await authorizedFetch("http://10.0.0.3:25500/sub?target=clash");
    const init = mock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(new Headers(init?.headers).get("x-clash-route-kit-token")).toBeNull();
  });
});
