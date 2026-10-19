import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalServerContext } from "../src/index.js";

const validConfigYaml = [
  "schemaVersion: 2",
  "project:",
  "  template:",
  "    output: Custom_Clash.ini",
  "vendorRepos: []",
  "proxyGroups:",
  "  - id: proxy",
  "    name: Proxy",
  "    type: select",
  "    members:",
  "      - builtin: DIRECT",
  "routes:",
  "  - id: final",
  "    policy:",
  "      group: proxy",
  "    source:",
  "      type: final",
  "ruleProviders: []",
].join("\n");

async function prepareProjectRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "route-kit-context-"));
  await writeFile(path.join(root, "routes.yaml"), validConfigYaml, "utf8");
  return root;
}

function callHandler(
  handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void,
  url: string,
  method = "GET",
  headers: Record<string, string> = { host: "127.0.0.1:8787" },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    const state = { statusCode: 0 };
    const res = {
      get statusCode() {
        return state.statusCode;
      },
      set statusCode(value: number) {
        state.statusCode = value;
      },
      setHeader() {},
      end(chunk?: string) {
        resolve({ status: state.statusCode, body: chunk ?? "" });
      },
    } as unknown as ServerResponse;
    const req = { url, method, headers, on() {} } as unknown as IncomingMessage;
    handler(req, res, () => resolve({ status: 0, body: "next" }));
  });
}

describe("createLocalServerContext default dependencies", () => {
  it("runs check actions without injected implementations", async () => {
    const root = await prepareProjectRoot();
    const { apiHandler } = createLocalServerContext({
      root,
      configFile: "routes.yaml",
      publicBase: "http://127.0.0.1:8787",
    });

    const result = await callHandler(apiHandler, "/api/actions/check", "POST");

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ action: "check", ok: true, output: "[check] ok" });
  });

  it("runs generate actions without injected implementations", async () => {
    const root = await prepareProjectRoot();
    const { apiHandler } = createLocalServerContext({
      root,
      configFile: "routes.yaml",
      publicBase: "http://127.0.0.1:8787",
    });

    const result = await callHandler(apiHandler, "/api/actions/generate", "POST");

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ action: "generate", ok: true });
    await expect(readFile(path.join(root, "output/templates/Custom_Clash.ini"), "utf8")).resolves
      .toContain("[custom]");
  });

  it("runs sync-vendor actions without injected implementations", async () => {
    const root = await prepareProjectRoot();
    const { apiHandler } = createLocalServerContext({
      root,
      configFile: "routes.yaml",
      publicBase: "http://127.0.0.1:8787",
    });

    const result = await callHandler(apiHandler, "/api/actions/sync-vendor", "POST");

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ action: "sync-vendor", ok: true });
    await expect(mkdir(path.join(root, "vendor"), { recursive: true })).resolves.toBeUndefined();
  });

  it("lets explicitly injected dependencies override the defaults", async () => {
    const root = await prepareProjectRoot();
    const { apiHandler } = createLocalServerContext({
      root,
      configFile: "routes.yaml",
      publicBase: "http://127.0.0.1:8787",
      checkConfig: async () => [
        {
          code: "workspace.geosite.missing",
          severity: "warning",
          path: "ruleSets[0].source.value",
          message: "injected",
          related: ["gfw"],
        },
      ],
    });

    const result = await callHandler(apiHandler, "/api/actions/check", "POST");

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({
      action: "check",
      ok: true,
      diagnostics: [expect.objectContaining({ message: "injected" })],
    });
  });
});

describe("createLocalServerContext connection guard wiring", () => {
  it("返回守卫与启动 token，hosting 拿同一 token 注入 html", async () => {
    const root = await prepareProjectRoot();
    const webRoot = await mkdtemp(path.join(tmpdir(), "route-kit-web-"));
    await writeFile(path.join(webRoot, "index.html"), "<html><head></head></html>", "utf8");
    const context = createLocalServerContext({
      root,
      configFile: "routes.yaml",
      publicBase: "http://192.168.1.10:8787",
      serveHost: "192.168.1.10",
      webRoot,
    });

    expect(typeof context.connectionGuard).toBe("function");
    expect(context.token).toMatch(/^[0-9a-f]{64}$/);

    const html = await callHandler(context.hostingHandler, "/");
    expect(html.body).toContain(`content="${context.token}"`);

    // 守卫先于 hosting/api：白名单外 Host 直接 403，不触达后续中间件
    const evil = await callHandler(context.connectionGuard, "/templates/Custom_Clash.ini", "GET", {
      host: "evil.com",
    });
    expect(evil.status).toBe(403);
    expect(evil.body).toContain("Forbidden");
  });
});

