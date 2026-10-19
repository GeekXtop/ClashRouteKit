import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import {
  assertBindableHost,
  createConnectionGuard,
  isWildcardHost,
  normalizeHostHeader,
} from "../src/index.js";

const TOKEN = "tok-abc123";

interface CallResult {
  status: number;
  body: string;
  nexted: boolean;
}

function call(
  guard: (req: IncomingMessage, res: ServerResponse, next: () => void) => void,
  {
    url = "/api/project/config",
    method = "GET",
    headers = { host: "127.0.0.1:8787" },
  }: {
    url?: string;
    method?: string;
    headers?: Record<string, string | undefined>;
  },
): CallResult {
  const state = { statusCode: 0 };
  let body = "";
  const res = {
    get statusCode() {
      return state.statusCode;
    },
    set statusCode(value: number) {
      state.statusCode = value;
    },
    setHeader() {},
    end(chunk?: string) {
      body = chunk ?? "";
    },
  } as unknown as ServerResponse;
  const result: CallResult = { status: 0, body: "", nexted: false };
  const headerEntries = Object.entries(headers).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  const req = {
    url,
    method,
    headers: Object.fromEntries(headerEntries),
    on() {},
  } as unknown as IncomingMessage;
  guard(req, res, () => {
    result.nexted = true;
  });
  result.status = state.statusCode;
  result.body = body;
  return result;
}

function makeGuard(overrides: { serveHost?: string; publicBaseUrl?: string } = {}) {
  return createConnectionGuard({ token: TOKEN, ...overrides });
}

describe("normalizeHostHeader", () => {
  it("剥端口并保留 IPv6 方括号", () => {
    expect(normalizeHostHeader("127.0.0.1:8787")).toBe("127.0.0.1");
    expect(normalizeHostHeader("[::1]:8787")).toBe("[::1]");
    expect(normalizeHostHeader("[::1]")).toBe("[::1]");
    expect(normalizeHostHeader("localhost")).toBe("localhost");
    expect(normalizeHostHeader("EVIL.com")).toBe("evil.com");
    expect(normalizeHostHeader(undefined)).toBeNull();
    expect(normalizeHostHeader("")).toBeNull();
  });
});

describe("isWildcardHost / assertBindableHost", () => {
  it("识别通配与非通配绑定地址", () => {
    expect(isWildcardHost("0.0.0.0")).toBe(true);
    expect(isWildcardHost("::")).toBe(true);
    expect(isWildcardHost("*")).toBe(true);
    expect(isWildcardHost("")).toBe(true);
    expect(isWildcardHost("127.0.0.1")).toBe(false);
    expect(isWildcardHost("192.168.1.10")).toBe(false);
    expect(isWildcardHost("localhost")).toBe(false);
  });

  it("assertBindableHost 拒绝通配并给出指引", () => {
    for (const host of ["0.0.0.0", "::", "*", ""]) {
      expect(() => assertBindableHost(host)).toThrow(/具体网卡字面量|wildcard|bind/i);
    }
    expect(() => assertBindableHost("192.168.1.10")).not.toThrow();
    expect(() => assertBindableHost("127.0.0.1")).not.toThrow();
  });
});

describe("connectionGuard Host 白名单", () => {
  it("白名单内 Host 且 /api 带 token → 放行", () => {
    for (const host of ["127.0.0.1:8787", "localhost:8787", "[::1]:8787", "[::1]", "192.168.1.10"]) {
      const result = call(makeGuard({ serveHost: "192.168.1.10" }), {
        headers: { host, "x-clash-route-kit-token": TOKEN },
      });
      expect(result.nexted, `host=${host}`).toBe(true);
    }
  });

  it("白名单外 Host → 403 Forbidden", () => {
    const result = call(makeGuard(), { headers: { host: "evil.com" } });
    expect(result.status).toBe(403);
    expect(result.body).toContain("Forbidden");
    expect(result.nexted).toBe(false);
  });

  it("缺 Host 头 → 400", () => {
    const result = call(makeGuard(), { headers: { host: undefined } });
    expect(result.status).toBe(400);
  });

  it("serveHost 为通配时不入白名单", () => {
    const result = call(makeGuard({ serveHost: "0.0.0.0" }), {
      headers: { host: "0.0.0.0:8787", "x-clash-route-kit-token": TOKEN },
    });
    expect(result.status).toBe(403);
  });

  it("非 api 路径不受 token 与 Origin 约束（SubConverter 拉取）", () => {
    for (const url of ["/templates/Custom_Clash.ini", "/rules/AI_Domain.yaml", "/apifoo", "/api"]) {
      const result = call(makeGuard(), { url, headers: { host: "127.0.0.1:8787" } });
      expect(result.nexted, `url=${url}`).toBe(true);
    }
  });
});

describe("connectionGuard Origin / Sec-Fetch-Site", () => {
  it("POST 白名单 Origin → 进 token 关", () => {
    const result = call(makeGuard(), {
      method: "POST",
      headers: { host: "127.0.0.1:8787", origin: "http://127.0.0.1:8787", "x-clash-route-kit-token": TOKEN },
    });
    expect(result.nexted).toBe(true);
  });

  it("POST 黑名单 Origin → 403", () => {
    const result = call(makeGuard(), {
      method: "POST",
      headers: { host: "127.0.0.1:8787", origin: "http://evil.com" },
    });
    expect(result.status).toBe(403);
  });

  it("POST Origin 为字符串 null → 403", () => {
    const result = call(makeGuard(), {
      method: "POST",
      headers: { host: "127.0.0.1:8787", origin: "null" },
    });
    expect(result.status).toBe(403);
  });

  it("POST 无 Origin 但 Sec-Fetch-Site 可疑 → 403；same-origin/none → 放行", () => {
    const bad = call(makeGuard(), {
      method: "PUT",
      headers: { host: "127.0.0.1:8787", "sec-fetch-site": "cross-site", "x-clash-route-kit-token": TOKEN },
    });
    expect(bad.status).toBe(403);
    for (const site of ["same-origin", "none"]) {
      const ok = call(makeGuard(), {
        method: "PUT",
        headers: { host: "127.0.0.1:8787", "sec-fetch-site": site, "x-clash-route-kit-token": TOKEN },
      });
      expect(ok.nexted, `sec-fetch-site=${site}`).toBe(true);
    }
  });

  it("POST 无 Origin 无 Sec-Fetch-Site（非浏览器）→ 直接收 token 关", () => {
    const result = call(makeGuard(), {
      method: "POST",
      headers: { host: "127.0.0.1:8787" },
    });
    expect(result.status).toBe(403);
    expect(result.body).toContain("token");
  });
});

describe("connectionGuard token 门禁", () => {
  it("/api 全方法要求 token：缺失或错值 → 403 stale-token 文案", () => {
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      const missing = call(makeGuard(), { method, headers: { host: "127.0.0.1:8787" } });
      expect(missing.status, `method=${method} missing`).toBe(403);
      expect(missing.body).toContain("stale token");
      const wrong = call(makeGuard(), {
        method,
        headers: { host: "127.0.0.1:8787", "x-clash-route-kit-token": "nope" },
      });
      expect(wrong.status, `method=${method} wrong`).toBe(403);
    }
  });
});
