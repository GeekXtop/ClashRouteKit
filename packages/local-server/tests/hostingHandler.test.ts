import { describe, expect, it } from "vitest";
import { createHostingHandler } from "../src/index.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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

const sampleConfig = `publishBaseUrl: http://127.0.0.1:8787
template:
  output: Custom_Clash.ini
vendorRepos: []
customProxyGroups:
  - name: Proxy
    type: select
    options: [DIRECT]
ruleSets:
  - id: p
    policy: Proxy
    source:
      type: rule-provider
      behavior: domain
      file: AI_Domain.yaml
  - id: final
    policy: Proxy
    source:
      type: final
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

  it("serves generated rule YAML from output/rules", async () => {
    const res = await run(handler, "/rules/AI_Domain.yaml");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/yaml/);
    expect(res.body).toBe(sampleConfig);
  });

  it("returns 404 for a missing generated rule file", async () => {
    const missing = createHostingHandler({
      root: "/proj",
      configFile: "config/routes.yaml",
      publicBase: "http://10.0.0.3:8787",
      readText: async (filePath: string) => {
        if (filePath.endsWith("AI_Domain.yaml")) throw new Error("missing");
        return sampleConfig;
      },
    });
    const res = await run(missing, "/rules/AI_Domain.yaml");
    expect(res.statusCode).toBe(404);
    expect(res.body).toContain("Not found");
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

  it("serves static files from webRoot with SPA fallback", async () => {
    const webRoot = mkdtempSync(path.join(tmpdir(), "routekit-web-"));
    writeFileSync(path.join(webRoot, "index.html"), "<html>spa</html>", "utf8");
    writeFileSync(path.join(webRoot, "app.js"), "console.log(1)", "utf8");
    const withWeb = createHostingHandler({
      root: "/proj",
      configFile: "config/routes.yaml",
      publicBase: "http://10.0.0.3:8787",
      webRoot,
      readText: async () => sampleConfig,
    });

    const asset = await run(withWeb, "/app.js");
    expect(asset.statusCode).toBe(200);
    expect(asset.headers["content-type"]).toMatch(/text\/javascript/);
    expect(asset.body).toBe("console.log(1)");

    const spa = await run(withWeb, "/console/output");
    expect(spa.statusCode).toBe(200);
    expect(spa.headers["content-type"]).toMatch(/text\/html/);
    expect(spa.body).toContain("spa");
  });
});
