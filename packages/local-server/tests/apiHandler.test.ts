import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { parseRouteKitConfig, planLegacyMigration } from "@clash-route-kit/core";
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

const validV2Yaml = [
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
  "  - id: final",
  "    policy:",
  "      group: proxy",
  "    source:",
  "      type: final",
  "ruleProviders: []",
  "",
].join("\n");

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
    const payload = JSON.parse(res.body) as {
      yaml: string;
      config: RouteKitProjectConfig;
      mtime: number;
      schemaVersion: number;
    };
    expect(payload.schemaVersion).toBe(1);
    expect(payload.yaml).toBe(validConfigYaml);
    expect(payload.config.ruleSets[0]?.id).toBe("final");
    expect(typeof payload.mtime).toBe("number");
  });

  it("returns schemaVersion 2 with yaml and without v1 fields for a migrated config", async () => {
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      readText: async () => validV2Yaml,
    });
    const res = await callHandler(handler, "/api/project/config");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json; charset=utf-8");
    const payload = JSON.parse(res.body) as Record<string, unknown> & {
      schemaVersion: number;
      yaml: string;
    };
    expect(payload.schemaVersion).toBe(2);
    expect(payload.yaml).toBe(validV2Yaml);
    expect("config" in payload).toBe(false);
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
    const payload = JSON.parse(res.body) as {
      ok: boolean;
      output: string;
      diagnostics: Array<{ code: string; severity: string; message: string }>;
    };
    expect(payload.ok).toBe(false);
    // ConfigDiagnosticError 时错误响应携带结构化 diagnostics
    expect(payload.diagnostics.length).toBeGreaterThan(0);
    expect(payload.diagnostics[0]?.severity).toBe("error");
    expect(writes).toEqual([]);
  });

  it("returns runtime urls resolved from local settings on GET /api/project/config", async () => {
    const envOverrides = {
      CLASH_ROUTE_KIT_PUBLISH_BASE_URL: "http://192.168.1.10:8787",
      CLASH_ROUTE_KIT_SUBCONVERTER_BASE_URL: "http://10.0.0.3:25500/sub",
    };
    const v2Handler = createRouteKitApiHandler({
      ...baseOptions,
      env: envOverrides,
      readText: async () => validV2Yaml,
    });
    const v2Res = await callHandler(v2Handler, "/api/project/config");
    const v2Payload = JSON.parse(v2Res.body) as { publishBaseUrl?: string; subconverterUrl?: string };
    expect(v2Payload.publishBaseUrl).toBe("http://192.168.1.10:8787");
    expect(v2Payload.subconverterUrl).toBe("http://10.0.0.3:25500/sub");

    // 未提供 env 时回退本地设置默认值
    const defaultHandler = createRouteKitApiHandler({
      ...baseOptions,
      readText: async () => validConfigYaml,
    });
    const defaultRes = await callHandler(defaultHandler, "/api/project/config");
    const defaultPayload = JSON.parse(defaultRes.body) as { publishBaseUrl?: string; subconverterUrl?: string };
    expect(defaultPayload.publishBaseUrl).toBe("http://127.0.0.1:8787");
    expect(defaultPayload.subconverterUrl).toBe("http://127.0.0.1:25500/sub");
  });

  it("rejects PUT /api/project/config with malformed JSON", async () => {
    const handler = createRouteKitApiHandler({ ...baseOptions, writeText: async () => {} });
    const res = await callHandler(handler, "/api/project/config", "PUT", "{not-json");
    expect(res.status).toBe(400);
    expect((JSON.parse(res.body) as { ok: boolean }).ok).toBe(false);
  });

  it("saves a v2 config via PUT with schemaVersion 2 and pins it at the top", async () => {
    const writes: Array<{ filePath: string; text: string }> = [];
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      writeText: async (filePath, text) => {
        writes.push({ filePath, text });
      },
    });
    // 客户端 yaml 里 schemaVersion 不在首位，服务端保存后应固定置顶
    const reordered = validV2Yaml.replace("schemaVersion: 2\n", "").replace(
      "proxyGroups:",
      "schemaVersion: 2\nproxyGroups:",
    );
    const res = await callHandler(
      handler,
      "/api/project/config",
      "PUT",
      JSON.stringify({ schemaVersion: 2, yaml: reordered }),
    );
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body) as {
      ok: boolean;
      schemaVersion: number;
      yaml: string;
      mtime: number;
      diagnostics: Array<{ severity: string }>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.schemaVersion).toBe(2);
    expect(payload.yaml.startsWith("schemaVersion: 2\n")).toBe(true);
    expect(payload.diagnostics.every((diagnostic) => diagnostic.severity !== "error")).toBe(true);
    expect(writes[0]?.filePath).toBe(path.resolve("E:/repo", "config/routes.yaml"));
    expect(writes[0]?.text).toBe(payload.yaml);
  });

  it("routes a yaml-only PUT body with a v2 document to the v2 save path", async () => {
    let written = "";
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      writeText: async (_filePath, text) => {
        written = text;
      },
    });
    const res = await callHandler(
      handler,
      "/api/project/config",
      "PUT",
      JSON.stringify({ yaml: validV2Yaml }),
    );
    expect(res.status).toBe(200);
    expect((JSON.parse(res.body) as { ok: boolean }).ok).toBe(true);
    expect(written.startsWith("schemaVersion: 2\n")).toBe(true);
  });

  it("responds 422 with diagnostics for an invalid v2 config and writes nothing", async () => {
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
      JSON.stringify({ schemaVersion: 2, yaml: validV2Yaml.replace("group: proxy", "group: ghost") }),
    );
    expect(res.status).toBe(422);
    const payload = JSON.parse(res.body) as {
      ok: boolean;
      diagnostics: Array<{ severity: string }>;
    };
    expect(payload.ok).toBe(false);
    expect(payload.diagnostics.some((diagnostic) => diagnostic.severity === "error")).toBe(true);
    expect(writes).toEqual([]);
  });

  it("responds 400 with diagnostics for broken v2 yaml", async () => {
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
      JSON.stringify({ schemaVersion: 2, yaml: "proxyGroups: [unclosed\n" }),
    );
    expect(res.status).toBe(400);
    const payload = JSON.parse(res.body) as {
      ok: boolean;
      output: string;
      diagnostics: Array<{ code: string }>;
    };
    expect(payload.ok).toBe(false);
    expect(payload.diagnostics[0]?.code).toBe("config.yaml.invalid");
    expect(writes).toEqual([]);
  });

  it("rejects PUT /api/project/config with schemaVersion 2 but no yaml", async () => {
    const handler = createRouteKitApiHandler({ ...baseOptions, writeText: async () => {} });
    const res = await callHandler(
      handler,
      "/api/project/config",
      "PUT",
      JSON.stringify({ schemaVersion: 2 }),
    );
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ ok: false, output: "Missing v2 config yaml" });
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

  it("returns branch and workflow status for GET /api/git/publish-status", async () => {
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      runCommand: async (_command, args) =>
        args[0] === "rev-parse" ? "main\n" : "git@github.com:acme/routes.git\n",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            workflow_runs: [
              {
                html_url: "https://github.com/acme/routes/actions/runs/9",
                created_at: "2026-09-13T00:00:00Z",
                status: "in_progress",
                conclusion: null,
              },
            ],
          }),
          { status: 200 },
        ),
      env: {},
    });
    const res = await callHandler(handler, "/api/git/publish-status");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      branch: "main",
      workflow: {
        state: "in-progress",
        runUrl: "https://github.com/acme/routes/actions/runs/9",
        createdAt: "2026-09-13T00:00:00Z",
      },
    });
  });

  it("responds 400 for publish-status when the branch cannot be read", async () => {
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      runCommand: async (_command, args) =>
        args[0] === "rev-parse" ? "HEAD\n" : "https://github.com/acme/routes.git",
      env: {},
    });
    const res = await callHandler(handler, "/api/git/publish-status");
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({
      ok: false,
      output: "当前处于 detached HEAD 状态，无法确认发布分支",
    });
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

describe("POST /api/project/migrate", () => {
  const migrateYaml = [
    "publishBaseUrl: http://127.0.0.1:8787",
    "template:",
    "  output: Custom_Clash.ini",
    "vendorRepos: []",
    "customProxyGroups:",
    "  - name: Proxy",
    "    type: select",
    "    options: [DIRECT]",
    "  - name: Auto",
    "    type: url-test",
    "    options: [Proxy]",
    "ruleSets:",
    "  - id: final",
    "    policy: Proxy",
    "    source:",
    "      type: final",
    "ruleProviders: []",
    "",
  ].join("\n");

  it("returns a read-only migration plan with summary for a v1 config", async () => {
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      readText: async () => migrateYaml,
    });
    const res = await callHandler(handler, "/api/project/migrate", "POST");
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body) as {
      currentSchemaVersion: number;
      plan: { summary: Record<string, number>; yaml: string } | null;
    };
    expect(payload.currentSchemaVersion).toBe(1);
    expect(payload.plan).not.toBeNull();
    expect(payload.plan?.summary.groups).toBe(2);
    expect(payload.plan?.summary.routes).toBe(1);
    expect(payload.plan?.yaml).toContain("schemaVersion: 2");
  });

  it("reports currentSchemaVersion 2 without a plan", async () => {
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      readText: async () => validV2Yaml,
    });
    const res = await callHandler(handler, "/api/project/migrate", "POST");
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body) as { currentSchemaVersion: number; plan: unknown };
    expect(payload.currentSchemaVersion).toBe(2);
    expect(payload.plan).toBeNull();
  });

  it("responds 400 with diagnostics when the config cannot be parsed", async () => {
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      readText: async () => "schemaVersion: 3\nproxyGroups: []\n",
    });
    const res = await callHandler(handler, "/api/project/migrate", "POST");
    expect(res.status).toBe(400);
    const payload = JSON.parse(res.body) as {
      ok: boolean;
      diagnostics: Array<{ code: string }>;
    };
    expect(payload.ok).toBe(false);
    expect(payload.diagnostics[0]?.code).toBe("schema.version.unsupported");
  });

  it("responds 405 for non-POST requests", async () => {
    const handler = createRouteKitApiHandler(baseOptions);
    const res = await callHandler(handler, "/api/project/migrate", "GET");
    expect(res.status).toBe(405);
  });
});

describe("POST /api/project/migrate/apply", () => {
  const applyYaml = [
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
    "ruleProviders: []",
    "",
  ].join("\n");

  it("applies a valid plan: backs up and writes v2 YAML", async () => {
    const writes: Array<{ filePath: string; text: string }> = [];
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      readText: async () => applyYaml,
      writeText: async (filePath, text) => {
        writes.push({ filePath, text });
      },
    });
    const res = await callHandler(
      handler,
      "/api/project/migrate/apply",
      "POST",
      JSON.stringify({ plan: planLegacyMigration(parseRouteKitConfig(applyYaml)) }),
    );
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body) as { ok: boolean; backupPath: string; yaml: string };
    expect(payload.ok).toBe(true);
    expect(payload.backupPath).toContain(".bak-");
    expect(payload.yaml.startsWith("schemaVersion: 2\n")).toBe(true);
    expect(writes.map((write) => write.filePath)).toEqual([
      payload.backupPath,
      path.resolve(baseOptions.root, baseOptions.configFile),
    ]);
  });

  it("responds 422 with diagnostics for an invalid plan and writes nothing", async () => {
    const writes: Array<{ filePath: string }> = [];
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      readText: async () => applyYaml,
      writeText: async (filePath) => {
        writes.push({ filePath });
      },
    });
    const plan = planLegacyMigration(parseRouteKitConfig(applyYaml));
    const tampered = {
      ...plan,
      draft: {
        ...plan.draft,
        routes: plan.draft.routes.map((route) =>
          route.id === "final" ? { ...route, policy: { group: "ghost" } } : route,
        ),
      },
    };
    const res = await callHandler(
      handler,
      "/api/project/migrate/apply",
      "POST",
      JSON.stringify({ plan: tampered }),
    );
    expect(res.status).toBe(422);
    const payload = JSON.parse(res.body) as {
      ok: boolean;
      diagnostics: Array<{ severity: string }>;
    };
    expect(payload.ok).toBe(false);
    expect(payload.diagnostics.some((diagnostic) => diagnostic.severity === "error")).toBe(true);
    expect(writes).toEqual([]);
  });

  it("responds 400 without a plan payload", async () => {
    const handler = createRouteKitApiHandler({
      ...baseOptions,
      readText: async () => applyYaml,
    });
    const res = await callHandler(handler, "/api/project/migrate/apply", "POST", JSON.stringify({}));
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ ok: false, output: "Missing plan" });
  });

  it("responds 405 for non-POST requests", async () => {
    const handler = createRouteKitApiHandler(baseOptions);
    const res = await callHandler(handler, "/api/project/migrate/apply", "GET");
    expect(res.status).toBe(405);
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
