import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { describe, expect, it } from "vitest";
import { clearCatalogIndexCache, createLocalServerContext, createRouteKitApiHandler } from "../src/index.js";

function projectConfig(overrides: Partial<RouteKitProjectConfig> = {}): RouteKitProjectConfig {
  return {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    customProxyGroups: [],
    ruleSets: [],
    ...overrides,
  };
}

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

const yamlWithRepos = (repos: string) =>
  [
    "publishBaseUrl: http://127.0.0.1:8787",
    "template:",
    "  output: Custom_Clash.ini",
    repos,
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

const baseOptions = { root: "E:/repo", configFile: "config/routes.yaml" };

const files: Record<string, string> = {
  "routes.yaml": validConfigYaml,
  openai: "openai.com\nfull:chatgpt.com\n",
  "category-ai-!cn": "include:openai\nxai.com\n",
  google: "domain:google.com\n",
};

interface FakeRequest {
  url: string;
  method: string;
  on(event: string, callback: (chunk?: Buffer) => void): void;
}

function makeRequest(url: string, method: string) {
  const listeners: Record<string, Array<(chunk?: Buffer) => void>> = {};
  const req: FakeRequest = {
    url,
    method,
    on(event, callback) {
      (listeners[event] ??= []).push(callback);
    },
  };
  return {
    req: req as unknown as IncomingMessage,
    emit(event: string, chunk?: Buffer) {
      for (const callback of listeners[event] ?? []) callback(chunk);
    },
  };
}

interface CallResult {
  status: number;
  headers: Record<string, string>;
  body: string;
  nextCalled: boolean;
}

function callHandler(
  handler: ReturnType<typeof createRouteKitApiHandler>,
  url: string,
  method = "GET",
  body?: string,
): Promise<CallResult> {
  return new Promise((resolve) => {
    const state = { statusCode: 0 };
    const headers: Record<string, string> = {};
    const res = {
      get statusCode() {
        return state.statusCode;
      },
      set statusCode(value: number) {
        state.statusCode = value;
      },
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
      },
      end(chunk?: string) {
        resolve({ status: state.statusCode, headers, body: chunk ?? "", nextCalled: false });
      },
    } as unknown as ServerResponse;
    const { req, emit } = makeRequest(url, method);
    handler(req, res, () => resolve({ status: 0, headers: {}, body: "", nextCalled: true }));
    if (body !== undefined) {
      emit("data", Buffer.from(body, "utf8"));
      emit("end");
    }
  });
}

describe("createRouteKitApiHandler", () => {
  it("returns parsed project config for GET /api/project/config", async () => {
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      readText: async (filePath) => {
        expect(filePath).toBe(path.resolve(baseOptions.root, baseOptions.configFile));
        return validConfigYaml;
      },
    });
    const res = await callHandler(handler, "/api/project/config");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json; charset=utf-8");
    const payload = JSON.parse(res.body) as { yaml: string; config: RouteKitProjectConfig; mtime: number };
    expect(payload.yaml).toBe(validConfigYaml);
    expect(payload.config.ruleSets[0]?.id).toBe("final");
    expect(typeof payload.mtime).toBe("number");
  });

  it("responds 500 with an error payload when the config file cannot be read", async () => {
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      readText: async () => {
        throw new Error("EACCES: denied");
      },
    });
    const res = await callHandler(handler, "/api/project/config");
    expect(res.status).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ ok: false, output: "EACCES: denied" });
  });

  it("saves a valid project config via PUT /api/project/config", async () => {
    const writes: Array<{ filePath: string; text: string }> = [];
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      writeText: async (filePath, text) => {
        writes.push({ filePath, text });
      },
    });
    const res = await callHandler(
      handler,
      "/api/project/config",
      "PUT",
      JSON.stringify({
        config: projectConfig({
          customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
          ruleSets: [{ id: "final", policy: "Proxy", source: { type: "final" } }],
          ruleProviders: [],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body) as { config: RouteKitProjectConfig };
    expect(payload.config.ruleSets[0]?.id).toBe("final");
    expect(writes[0]?.filePath).toBe(path.resolve("E:/repo", "config/routes.yaml"));
    expect(writes[0]?.text).toContain("ruleSets:");
  });

  it("rejects PUT /api/project/config without a config payload", async () => {
    const handler = createRouteKitApiHandler({ ...baseOptions, writeText: async () => {} });
    const res = await callHandler(handler, "/api/project/config", "PUT", JSON.stringify({}));
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ ok: false, output: "Missing config" });
  });

  it("rejects PUT /api/project/config that fails the core gate before writing", async () => {
    const writes: string[] = [];
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      writeText: async (filePath) => {
        writes.push(filePath);
      },
    });
    const res = await callHandler(
      handler,
      "/api/project/config",
      "PUT",
      JSON.stringify({
        config: projectConfig({
          customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
          ruleSets: [{ id: "bad", policy: "Missing", source: { type: "final" } }],
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect((JSON.parse(res.body) as { ok: boolean }).ok).toBe(false);
    expect(writes).toEqual([]);
  });

  it("rejects PUT /api/project/config with malformed JSON", async () => {
    const handler = createRouteKitApiHandler({ ...baseOptions, writeText: async () => {} });
    const res = await callHandler(handler, "/api/project/config", "PUT", "{not-json");
    expect(res.status).toBe(400);
    expect((JSON.parse(res.body) as { ok: boolean }).ok).toBe(false);
  });

  it("responds 405 for unsupported methods on /api/project/config", async () => {
    const handler = createRouteKitApiHandler(baseOptions);
    const res = await callHandler(handler, "/api/project/config", "DELETE");
    expect(res.status).toBe(405);
    expect(JSON.parse(res.body)).toEqual({ ok: false, output: "Method not allowed" });
  });

  it("lists project rule files for GET /api/project/rules", async () => {
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      readDirectory: async () => ["AI.list", "README.md", "Custom.list"],
    });
    const res = await callHandler(handler, "/api/project/rules");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ files: ["AI.list", "Custom.list"] });
  });

  it("responds 405 for POST /api/project/rules", async () => {
    const handler = createRouteKitApiHandler(baseOptions);
    const res = await callHandler(handler, "/api/project/rules", "POST");
    expect(res.status).toBe(405);
  });

  it("reads a single rule file for GET /api/project/rules/:file", async () => {
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      readText: async () => "DOMAIN,openai.com\n",
    });
    const res = await callHandler(handler, "/api/project/rules/AI.list");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ file: "AI.list", text: "DOMAIN,openai.com\n" });
  });

  it("rejects rule file path traversal", async () => {
    const handler = createRouteKitApiHandler({ ...baseOptions, readText: async () => "" });
    const res = await callHandler(handler, "/api/project/rules/%2e%2e%2froutes.yaml");
    expect(res.status).toBe(400);
    expect((JSON.parse(res.body) as { output: string }).output).toContain("Invalid rule file");
  });

  it("writes and deletes rule files", async () => {
    const writes: Array<{ filePath: string; text: string }> = [];
    const removed: string[] = [];
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      writeText: async (filePath, text) => {
        writes.push({ filePath, text });
      },
      removePath: async (filePath) => {
        removed.push(filePath);
      },
    });

    const put = await callHandler(
      handler,
      "/api/project/rules/AI.list",
      "PUT",
      JSON.stringify({ text: "DOMAIN,openai.com\n" }),
    );
    expect(put.status).toBe(200);
    expect(JSON.parse(put.body)).toEqual({ file: "AI.list", text: "DOMAIN,openai.com\n" });
    expect(writes[0]?.filePath).toBe(path.resolve("E:/repo", "config/rules/AI.list"));

    const missingText = await callHandler(handler, "/api/project/rules/AI.list", "PUT", JSON.stringify({}));
    expect(missingText.status).toBe(400);
    expect(JSON.parse(missingText.body)).toEqual({ ok: false, output: "Missing rule file text" });

    const del = await callHandler(handler, "/api/project/rules/AI.list", "DELETE");
    expect(del.status).toBe(200);
    expect(JSON.parse(del.body)).toEqual({ file: "AI.list" });
    expect(removed).toEqual([path.resolve("E:/repo", "config/rules/AI.list")]);
  });

  it("lists catalog sources with counts, kinds and sync time", async () => {
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      readText: async () => validConfigYaml,
      readDirectory: async (dir: string) => {
        if (dir.includes("domain-list-community")) return ["openai", "steam", "README.md"];
        if (dir.includes("rules")) return ["AI.list"];
        return [];
      },
      statMtime: async () => 1_700_000_000_000,
    });
    const res = await callHandler(handler, "/api/catalog/sources");
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body) as { sources: Array<{ id: string; count: number; kind: string; syncedAt?: number }> };
    const byId = Object.fromEntries(payload.sources.map((source) => [source.id, source]));
    expect(byId["domain-list-community"]?.count).toBe(2);
    expect(byId["domain-list-community"]?.kind).toBe("upstream");
    expect(byId["domain-list-community"]?.syncedAt).toBe(1_700_000_000_000);
    expect(byId["local"]?.kind).toBe("local");
  });

  it("lists catalog entries for GET /api/catalog/entries", async () => {
    clearCatalogIndexCache();
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      readText: async (filePath: string) => files[path.basename(filePath)] ?? "",
      readDirectory: async () => ["openai", "README.md"],
    });
    const res = await callHandler(handler, "/api/catalog/entries?origin=domain-list-community");
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body) as { entries: Array<{ name: string }> };
    expect(payload.entries.map((entry) => entry.name)).toEqual(["openai"]);
  });

  it("expands a catalog entry into domains for GET /api/catalog/domains", async () => {
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      readText: async (filePath: string) => files[path.basename(filePath)] ?? "",
      readDirectory: async () => Object.keys(files),
    });
    const res = await callHandler(handler, "/api/catalog/domains?origin=domain-list-community&name=category-ai-!cn");
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body) as { domains: string[] };
    expect(payload.domains).toContain("DOMAIN-SUFFIX,xai.com");
    expect(payload.domains).toContain("DOMAIN,chatgpt.com");
  });

  it("searches the catalog for GET /api/catalog/search", async () => {
    clearCatalogIndexCache();
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      readText: async (filePath: string) => files[path.basename(filePath)] ?? "",
      readDirectory: async () => Object.keys(files),
    });
    const res = await callHandler(handler, "/api/catalog/search?origin=domain-list-community&q=openai.com");
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body) as { hits: Array<{ name: string }> };
    expect(payload.hits[0]?.name).toBe("openai");
  });

  it("responds 400 with an error payload when a catalog use case fails", async () => {
    clearCatalogIndexCache();
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      readText: async () => {
        throw new Error("catalog unavailable");
      },
      readDirectory: async () => {
        throw new Error("catalog unavailable");
      },
    });
    const res = await callHandler(handler, "/api/catalog/search?origin=domain-list-community&q=openai");
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ ok: false, output: "catalog unavailable" });
  });

  it("adds a vendor repo via POST /api/vendor/add and clears the catalog cache", async () => {
    clearCatalogIndexCache();
    let written = "";
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      readText: async () => yamlWithRepos("vendorRepos: []"),
      writeText: async (_filePath, text) => {
        written = text;
      },
    });
    const res = await callHandler(
      handler,
      "/api/vendor/add",
      "POST",
      JSON.stringify({ input: { name: "GeekX", url: "https://x.git", catalog: { reldir: "rule", kind: "list-dir" } } }),
    );
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body) as { config: RouteKitProjectConfig };
    expect(payload.config.vendorRepos.at(-1)?.name).toBe("GeekX");
    expect(written).toContain("GeekX");
  });

  it("rejects POST /api/vendor/add without input and wrong methods", async () => {
    const handler = createRouteKitApiHandler({ ...baseOptions, writeText: async () => {} });
    const missing = await callHandler(handler, "/api/vendor/add", "POST", JSON.stringify({}));
    expect(missing.status).toBe(400);
    expect(JSON.parse(missing.body)).toEqual({ ok: false, output: "Missing input" });

    const wrongMethod = await callHandler(handler, "/api/vendor/add", "GET");
    expect(wrongMethod.status).toBe(405);
  });

  it("rejects POST /api/vendor/remove without a name", async () => {
    const handler = createRouteKitApiHandler({ ...baseOptions, writeText: async () => {} });
    const res = await callHandler(handler, "/api/vendor/remove", "POST", JSON.stringify({}));
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ ok: false, output: "Missing name" });
  });

  it("returns the origin git remote for GET /api/git/remote", async () => {
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      runCommand: async (command, args) => {
        expect(command).toBe("git");
        expect(args).toEqual(["remote", "get-url", "origin"]);
        return "git@github.com:acme/routes.git\n";
      },
    });
    const res = await callHandler(handler, "/api/git/remote");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ url: "git@github.com:acme/routes.git" });
  });

  it("runs the check action with the injected implementation", async () => {
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      checkConfig: async () => [],
    });
    const res = await callHandler(handler, "/api/actions/check", "POST");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      action: "check",
      ok: true,
      output: "[check] ok",
      diagnostics: [],
    });
  });

  it("responds 422 when the check action reports errors", async () => {
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      checkConfig: async () => [
        {
          code: "route.final.missing",
          severity: "error" as const,
          path: "ruleSets",
          message: "ruleSets 需要包含一条 FINAL 兜底规则",
        },
      ],
    });
    const res = await callHandler(handler, "/api/actions/check", "POST");
    expect(res.status).toBe(422);
    const payload = JSON.parse(res.body) as { action: string; ok: boolean };
    expect(payload).toMatchObject({ action: "check", ok: false });
  });

  it("runs sync-vendor with the injected implementation and only filter", async () => {
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      syncVendor: async (options) => {
        expect(options.only).toBe("GeekX");
        return [{ name: "GeekX", action: "pull" as const, path: "vendor/GeekX" }];
      },
    });
    const res = await callHandler(handler, "/api/actions/sync-vendor?name=GeekX", "POST");
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body) as { ok: boolean; output: string };
    expect(payload.ok).toBe(true);
    expect(payload.output).toContain("[sync-vendor] pull: GeekX -> vendor/GeekX");
  });

  it("responds 500 when an action dependency was not injected", async () => {
    const handler = createRouteKitApiHandler(baseOptions);
    const res = await callHandler(handler, "/api/actions/check", "POST");
    expect(res.status).toBe(500);
    const payload = JSON.parse(res.body) as { action: string; ok: boolean; output: string };
    expect(payload).toMatchObject({ action: "check", ok: false });
    expect(payload.output).toContain("requires an injected check dependency");
  });

  it("responds 404 for unknown actions and 405 for non-POST actions", async () => {
    const handler = createRouteKitApiHandler(baseOptions);
    const unknown = await callHandler(handler, "/api/actions/nope", "POST");
    expect(unknown.status).toBe(404);
    expect(JSON.parse(unknown.body)).toEqual({ ok: false, output: "Unknown action" });

    const wrongMethod = await callHandler(handler, "/api/actions/check", "GET");
    expect(wrongMethod.status).toBe(405);
  });

  it("calls next for non-API paths", async () => {
    const handler = createRouteKitApiHandler(baseOptions);
    const res = await callHandler(handler, "/console/output");
    expect(res.nextCalled).toBe(true);
  });
});

describe("createLocalServerContext", () => {
  it("composes hosting and api handlers for middleware mounting", () => {
    const context = createLocalServerContext({
      ...baseOptions,
      publicBase: "http://127.0.0.1:8787",
      checkConfig: async () => [],
    });
    expect(typeof context.hostingHandler).toBe("function");
    expect(typeof context.apiHandler).toBe("function");
  });
});
