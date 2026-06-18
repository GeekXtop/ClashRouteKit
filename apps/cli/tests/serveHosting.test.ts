import { describe, expect, it } from "vitest";
import { createHostingHandler } from "../src/serveHosting.js";

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

  it("calls next for non-hosted paths when no webRoot", async () => {
    const res = await run(handler, "/api/project/config");
    expect(res.body).toBe("next");
  });
});
