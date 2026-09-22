import { describe, expect, it } from "vitest";
import { createHostingHandler } from "@clash-route-kit/local-server";

function fakeRes() {
  const res: any = { statusCode: 200, headers: {} as Record<string, string>, body: "" };
  res.setHeader = (k: string, v: string) => {
    res.headers[k.toLowerCase()] = v;
  };
  res.end = (chunk?: string) => {
    if (chunk) res.body += chunk;
    res.done?.();
  };
  return res;
}
function run(handler: any, url: string, method = "GET") {
  return new Promise<any>((resolve) => {
    const res = fakeRes();
    res.done = () => resolve(res);
    handler({ url, method }, res, () => {
      res.statusCode = 404;
      res.end("next");
    });
  });
}

const sampleConfig = `schemaVersion: 2
project:
  template:
    output: Custom_Clash.ini
proxyGroups:
  - id: proxy
    name: Proxy
    type: select
    members:
      - builtin: DIRECT
routes:
  - id: p
    policy:
      group: proxy
    source:
      type: rule-provider
      provider: ai-domain
  - id: final
    policy:
      group: proxy
    source:
      type: final
ruleProviders:
  - id: ai-domain
    name: AI_Domain
    output: AI_Domain.yaml
    behavior: domain
    sources:
      - id: ai-domain
        name: AI_Domain
        type: clash-list
        path: rules/AI_Domain.list
`;

describe("createHostingHandler", () => {
  const handler = createHostingHandler({
    root: "/proj",
    configFile: "config/routes.yaml",
    publicBase: "http://10.0.0.3:8787",
    readText: async () => sampleConfig,
  });

  it("renders /templates/*.ini live with publicBase substituted", async () => {
    const res = await run(handler, "/templates/Custom_Clash.ini");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.body).toContain("[custom]");
    expect(res.body).toContain("http://10.0.0.3:8787/rules/AI_Domain.yaml");
    expect(res.body).not.toContain("127.0.0.1");
  });

  it("rejects /rules path traversal", async () => {
    const res = await run(handler, "/rules/..%2f..%2fsecret.yaml");
    expect(res.statusCode).toBe(400);
  });

  it("calls next for non-hosted paths when no webRoot", async () => {
    const res = await run(handler, "/api/project/config");
    expect(res.body).toBe("next");
  });

  it("passes /api/* through to next even when webRoot is set (no SPA fallback)", async () => {
    const withWeb = createHostingHandler({
      root: "/proj",
      configFile: "config/routes.yaml",
      publicBase: "http://10.0.0.3:8787",
      webRoot: "/web/dist",
      readText: async () => sampleConfig,
    });
    const res = await run(withWeb, "/api/project/config");
    expect(res.body).toBe("next");
  });
});
