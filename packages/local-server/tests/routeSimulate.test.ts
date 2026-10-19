import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRouteKitApiHandler } from "../src/index.js";

const baseConfig = [
  "schemaVersion: 2",
  "project:",
  "  template:",
  "    output: Custom_Clash.ini",
  "proxyGroups:",
  "  - id: proxy",
  "    name: Proxy",
  "    type: select",
  "    members:",
  "      - builtin: DIRECT",
  "routes:",
  "  - id: ai",
  "    policy:",
  "      group: proxy",
  "    source:",
  "      type: geosite",
  "      value: ai",
  "  - id: final",
  "    policy:",
  "      builtin: DIRECT",
  "    source:",
  "      type: final",
  "ruleProviders:",
  "  - id: ai-domain",
  "    name: AI Domain",
  "    output: AI_Domain.yaml",
  "    behavior: domain",
  "    sources:",
  "      - id: src-ai",
  "        name: Some AI",
  "        type: domain-list-community",
  "        entry: someai",
  "",
].join("\n");

const providerFirstConfig = baseConfig.replace(
  "routes:\n",
  [
    "routes:",
    "  - id: p1",
    "    policy:",
    "      group: proxy",
    "    source:",
    "      type: rule-provider",
    "      provider: ai-domain",
  ].join("\n") + "\n",
);

async function prepareRoot(configYaml: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "route-simulate-"));
  await mkdir(path.join(root, "config"), { recursive: true });
  await writeFile(path.join(root, "config", "routes.yaml"), configYaml, "utf8");
  return root;
}

async function writeVendor(root: string, tag: string, content: string): Promise<void> {
  const dataDir = path.join(root, "vendor", "domain-list-community", "data");
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(dataDir, tag), content, "utf8");
}

async function writeProviderOutput(root: string, payload: string[]): Promise<void> {
  const rulesDir = path.join(root, "output", "rules");
  await mkdir(rulesDir, { recursive: true });
  const lines = payload.map((entry) => `  - '${entry}'`);
  await writeFile(path.join(rulesDir, "AI_Domain.yaml"), `payload:\n${lines.join("\n")}\n`, "utf8");
}

function callHandler(
  handler: ReturnType<typeof createRouteKitApiHandler>,
  body: unknown,
  url = "/api/route-simulate",
  method = "POST",
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
    const chunks = JSON.stringify(body);
    let sent = false;
    const req = {
      url,
      method,
      headers: {},
      on(event: string, cb: (chunk?: Buffer) => void) {
        if (event === "data" && !sent && method !== "GET") {
          sent = true;
          cb(Buffer.from(chunks, "utf8"));
        }
        if (event === "end") cb();
      },
    } as unknown as IncomingMessage;
    handler(req, res, () => resolve({ status: 0, body: "next" }));
  });
}

interface MatchedPayload {
  ok: boolean;
  result: {
    status: string;
    matched?: { routeId: string; label: string; policyLabel: string };
    trace: Array<{ routeId: string; outcome: { kind: string; reason?: string } }>;
  };
}

describe("POST /api/route-simulate", () => {
  it("geosite 路由按 vendor 数据命中", async () => {
    const root = await prepareRoot(baseConfig);
    await writeVendor(root, "ai", "openai.com\n");
    const handler = createRouteKitApiHandler({ root, configFile: "config/routes.yaml" });
    const res = await callHandler(handler, { domain: "www.openai.com" });
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body) as MatchedPayload;
    expect(payload.ok).toBe(true);
    expect(payload.result.status).toBe("matched");
    expect(payload.result.matched?.routeId).toBe("ai");
    expect(payload.result.matched?.label).toBe("GEOSITE,ai");
    expect(payload.result.matched?.policyLabel).toBe("Proxy");
    await rm(root, { recursive: true, force: true });
  });

  it("provider 路由读 output 载荷命中；输出缺失时 skipped 落到后续路由", async () => {
    const root = await prepareRoot(providerFirstConfig);
    await writeProviderOutput(root, ["+.a.com"]);
    const handler = createRouteKitApiHandler({ root, configFile: "config/routes.yaml" });
    const hit = JSON.parse((await callHandler(handler, { domain: "x.a.com" })).body) as MatchedPayload;
    expect(hit.result.matched?.routeId).toBe("p1");
    expect(hit.result.matched?.label).toBe("provider:ai-domain");

    await rm(path.join(root, "output", "rules", "AI_Domain.yaml"));
    const miss = JSON.parse((await callHandler(handler, { domain: "x.a.com" })).body) as MatchedPayload;
    expect(miss.result.matched?.routeId).toBe("final");
    expect(miss.result.trace[0]?.outcome.kind).toBe("skipped");
    expect(miss.result.trace[0]?.outcome.reason).toContain("generate");
    await rm(root, { recursive: true, force: true });
  });

  it("yaml 覆盖优先于磁盘且不落盘", async () => {
    const root = await prepareRoot(baseConfig);
    let wrote = false;
    const handler = createRouteKitApiHandler({
      root,
      configFile: "config/routes.yaml",
      writeText: async () => {
        wrote = true;
      },
    });
    const overrideConfig = baseConfig.replace("value: ai", "value: aitag").replace("id: ai\n", "id: ai-override\n");
    await writeVendor(root, "aitag", "override.com\n");
    const noOverride = JSON.parse((await callHandler(handler, { domain: "www.override.com" })).body) as MatchedPayload;
    expect(noOverride.result.matched?.routeId).toBe("final");

    const withOverride = JSON.parse(
      (await callHandler(handler, { domain: "www.override.com", yaml: overrideConfig })).body,
    ) as MatchedPayload;
    expect(withOverride.result.matched?.routeId).toBe("ai-override");
    expect(wrote).toBe(false);
    await rm(root, { recursive: true, force: true });
  });

  it("非法域名 400", async () => {
    const root = await prepareRoot(baseConfig);
    const handler = createRouteKitApiHandler({ root, configFile: "config/routes.yaml" });
    for (const domain of ["", "a/b", "a b.com", "a:b"]) {
      const res = await callHandler(handler, { domain });
      expect(res.status, domain).toBe(400);
      expect(JSON.parse(res.body)).toMatchObject({ ok: false });
    }
    await rm(root, { recursive: true, force: true });
  });

  it("非 POST 方法 405", async () => {
    const root = await prepareRoot(baseConfig);
    const handler = createRouteKitApiHandler({ root, configFile: "config/routes.yaml" });
    const res = await callHandler(handler, {}, "/api/route-simulate", "GET");
    expect(res.status).toBe(405);
    expect(JSON.parse(res.body)).toEqual({ ok: false, output: "Method not allowed" });
    await rm(root, { recursive: true, force: true });
  });

  it("禁用 provider 与缺失 geosite tag 在端到端轨迹中区分", async () => {
    const disabledProviderConfig = providerFirstConfig.replace(
      "  - id: ai-domain",
      "  - id: ai-domain\n    enabled: false",
    );
    const root = await prepareRoot(disabledProviderConfig);
    const handler = createRouteKitApiHandler({ root, configFile: "config/routes.yaml" });
    const payload = JSON.parse((await callHandler(handler, { domain: "x.a.com" })).body) as MatchedPayload;
    expect(payload.result.matched?.routeId).toBe("final");
    expect(payload.result.trace[0]?.outcome.kind).toBe("skipped");
    expect(payload.result.trace[0]?.outcome.reason).toContain("禁用");
    await rm(root, { recursive: true, force: true });

    // geosite tag 不在本地 vendor → skipped(vendor) 端到端
    const root2 = await prepareRoot(baseConfig);
    const handler2 = createRouteKitApiHandler({ root: root2, configFile: "config/routes.yaml" });
    const payload2 = JSON.parse((await callHandler(handler2, { domain: "www.openai.com" })).body) as MatchedPayload;
    expect(payload2.result.matched?.routeId).toBe("final");
    expect(payload2.result.trace[0]?.outcome.kind).toBe("skipped");
    expect(payload2.result.trace[0]?.outcome.reason).toContain("vendor");
    await rm(root2, { recursive: true, force: true });
  });

  it("覆盖 yaml 未过 v2 校验 → 422 + diagnostics；磁盘配置缺失 → 422", async () => {
    const root = await prepareRoot(baseConfig);
    const handler = createRouteKitApiHandler({ root, configFile: "config/routes.yaml" });
    const badYaml = baseConfig.replace("group: proxy", "group: ghost");
    const bad = await callHandler(handler, { domain: "a.com", yaml: badYaml });
    expect(bad.status).toBe(422);
    expect(JSON.parse(bad.body).diagnostics.length).toBeGreaterThan(0);

    const missingRoot = await mkdtemp(path.join(tmpdir(), "route-simulate-empty-"));
    const missingHandler = createRouteKitApiHandler({ root: missingRoot, configFile: "config/routes.yaml" });
    const missing = await callHandler(missingHandler, { domain: "a.com" });
    expect(missing.status).toBe(422);
    await rm(missingRoot, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  });
});
