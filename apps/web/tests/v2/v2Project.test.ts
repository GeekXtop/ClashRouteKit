import { describe, expect, it, vi } from "vitest";
import YAML from "yaml";
import { ConfigDiagnosticError, type RouteKitProjectConfig } from "@clash-route-kit/core";
import { createV2Config, createV2Yaml } from "./fixtures.js";
import {
  fetchProjectDocument,
  loadV2Project,
  saveV2Project,
  serializeV2Project,
} from "../../src/v2/v2Project.js";

describe("loadV2Project", () => {
  it("loads a valid yaml into config, diagnostics, and a normalized summary", () => {
    const state = loadV2Project(createV2Yaml());
    expect(state.config).toEqual(createV2Config());
    expect(state.diagnostics).toEqual([]);
    expect(state.normalizedSummary).toEqual({
      groups: 2,
      routes: 2,
      providers: 1,
      memberSets: 1,
    });
  });

  it("collects error diagnostics for dangling references while returning the config", () => {
    const config = createV2Config();
    const broken = {
      ...config,
      routes: config.routes.map((route) =>
        route.id === "geosite-openai" ? { ...route, policy: { group: "ghost" } } : route,
      ),
    };
    const state = loadV2Project(serializeV2Project(broken));
    expect(state.config).toEqual(broken);
    expect(state.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "validate.reference.missing",
        severity: "error",
        related: ["ghost"],
      }),
    );
  });

  it("throws a ConfigDiagnosticError for structurally invalid yaml", () => {
    expect(() => loadV2Project("schemaVersion: 2\nproxyGroups: []\n")).toThrow(
      ConfigDiagnosticError,
    );
  });
});

describe("serializeV2Project", () => {
  it("keeps schemaVersion: 2 as the first line and round-trips the config", () => {
    const yaml = serializeV2Project(createV2Config());
    expect(yaml.split("\n")[0]).toBe("schemaVersion: 2");
    expect(yaml.endsWith("\n")).toBe(true);
    expect(YAML.parse(yaml)).toEqual(createV2Config());
  });
});

describe("fetchProjectDocument", () => {
  it("returns a v1 document for legacy payloads without schemaVersion", async () => {
    const config: RouteKitProjectConfig = {
      publishBaseUrl: "http://127.0.0.1:8787",
      template: { output: "Custom_Clash.ini" },
      vendorRepos: [],
      customProxyGroups: [],
      ruleSets: [{ id: "final", policy: "DIRECT", source: { type: "final" } }],
      ruleProviders: [],
    };
    const yaml = "publishBaseUrl: http://127.0.0.1:8787\n";
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ yaml, config }), { status: 200 }),
    );

    await expect(fetchProjectDocument(fetcher)).resolves.toEqual({ schemaVersion: 1, yaml, config });
    expect(fetcher).toHaveBeenCalledWith("/api/project/config");
  });

  it("returns a v2 document without a config field", async () => {
    const yaml = createV2Yaml();
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ schemaVersion: 2, yaml, mtime: 1 }), { status: 200 }),
    );

    await expect(fetchProjectDocument(fetcher)).resolves.toEqual({ schemaVersion: 2, yaml });
  });

  it("throws on invalid payloads", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 500 }));
    await expect(fetchProjectDocument(fetcher)).rejects.toThrow("Invalid local project response");
  });
});

describe("saveV2Project", () => {
  it("puts schemaVersion: 2 with the yaml and resolves the normalized result", async () => {
    const yaml = createV2Yaml();
    const warning = { code: "demo.warning", severity: "warning" as const, message: "w" };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/project/config");
      expect(init?.method).toBe("PUT");
      expect(init?.headers).toEqual({ "content-type": "application/json" });
      expect(JSON.parse(String(init?.body))).toEqual({ schemaVersion: 2, yaml });
      return new Response(
        JSON.stringify({ ok: true, schemaVersion: 2, yaml: `${yaml}# normalized\n`, diagnostics: [warning] }),
        { status: 200 },
      );
    });

    await expect(saveV2Project(yaml, fetcher)).resolves.toEqual({
      ok: true,
      yaml: `${yaml}# normalized\n`,
      warnings: [warning],
    });
  });

  it("returns diagnostics on a 422 validation rejection", async () => {
    const diagnostics = [
      { code: "validate.reference.missing", severity: "error", message: "引用的策略组不存在" },
    ];
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, diagnostics }), { status: 422 }),
    );

    const result = await saveV2Project(createV2Yaml(), fetcher);
    expect(result).toEqual({
      ok: false,
      reason: "Schema v2 保存被拒绝",
      diagnostics,
    });
  });

  it("uses the server output as reason on a 400 error", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, output: "Missing v2 config yaml" }), { status: 400 }),
    );

    await expect(saveV2Project(createV2Yaml(), fetcher)).resolves.toEqual({
      ok: false,
      reason: "Missing v2 config yaml",
      diagnostics: [],
    });
  });

  it("propagates network failures", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("network offline");
    });
    await expect(saveV2Project(createV2Yaml(), fetcher)).rejects.toThrow("network offline");
  });

  it("throws on non-JSON error responses", async () => {
    const fetcher = vi.fn(async () => new Response("<html>", { status: 500 }));
    await expect(saveV2Project(createV2Yaml(), fetcher)).rejects.toThrow(
      "Invalid v2 project save response",
    );
  });
});
