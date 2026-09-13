import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalServerContext } from "../src/index.js";

const validConfigYaml = [
  "publishBaseUrl: http://127.0.0.1:8787",
  "template:",
  "  output: Custom_Clash.ini",
  "vendorRepos: []",
  "customProxyGroups:",
  "  - name: Proxy",
  "    type: select",
  "    options: [DIRECT]",
  "ruleSets:",
  "  - id: final",
  "    policy: Proxy",
  "    source:",
  "      type: final",
  "",
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
    const req = { url, method, on() {} } as unknown as IncomingMessage;
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
