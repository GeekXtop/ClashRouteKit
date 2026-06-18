import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createServeServer } from "../src/serve.js";

let server: import("node:http").Server | undefined;
afterEach(() => {
  server?.close();
  server = undefined;
});

const sample = `publishBaseUrl: http://127.0.0.1:8787
template: { output: Custom_Clash.ini }
vendorRepos: []
customProxyGroups: [{ name: Proxy, type: select, options: [DIRECT] }]
ruleSets: [{ id: final, policy: Proxy, source: { type: final } }]
`;

describe("createServeServer", () => {
  it("serves live INI and routes /api to api handler", async () => {
    server = createServeServer({
      root: "/proj",
      configFile: "config/routes.yaml",
      publicBase: "http://10.0.0.3:8787",
      host: "127.0.0.1",
      port: 0,
      readText: async () => sample,
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;

    const ini = await fetch(`http://127.0.0.1:${port}/templates/Custom_Clash.ini`);
    expect(ini.status).toBe(200);
    expect(await ini.text()).toContain("[custom]");
  });
});
