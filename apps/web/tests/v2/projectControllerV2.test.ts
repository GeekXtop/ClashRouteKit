import { describe, expect, it } from "vitest";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { createV2Config, createV2Yaml } from "./fixtures.js";
import { addRoute, removeRoute } from "../../src/v2/mutations.js";
import { serializeV2Project } from "../../src/v2/v2Project.js";
import {
  applyV2Config,
  canSaveProject,
  createProjectControllerFromDocument,
  createV2ProjectController,
  markV2ProjectSaved,
} from "../../src/projectController.js";

function createV1Document(): { yaml: string; config: RouteKitProjectConfig } {
  const config: RouteKitProjectConfig = {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
    ruleSets: [{ id: "final", policy: "DIRECT", source: { type: "final" } }],
    ruleProviders: [],
  };
  return { yaml: "publishBaseUrl: http://127.0.0.1:8787\n", config };
}

describe("createV2ProjectController", () => {
  it("loads a v2 yaml into the snapshot with a clean baseline", () => {
    const yaml = createV2Yaml();
    const state = createV2ProjectController(yaml);

    expect(state.schemaVersion).toBe(2);
    expect(state.v2?.config).toEqual(createV2Config());
    expect(state.v2?.diagnostics).toEqual([]);
    expect(state.dirty).toBe(false);
    expect(state.draftYaml).toBe(yaml);
    expect(state.originalYaml).toBe(yaml);
    expect(state.status).toBe("ready");
    // v1 页面拿到的是只读投影，v2 保存不经过它。
    expect(state.draftConfig.ruleSets).toEqual([]);

    expect(canSaveProject(state)).toEqual({
      ok: false,
      reason: "没有未保存的修改",
      diagnostics: [],
      warnings: [],
    });
  });

  it("keeps the project open but blocks saving when the yaml fails to parse", () => {
    const state = createV2ProjectController("schemaVersion: 2\nproxyGroups: []\n");

    expect(state.schemaVersion).toBe(2);
    expect(state.v2).toBeUndefined();
    expect(state.status).toBe("error");

    const readiness = canSaveProject(state);
    expect(readiness.ok).toBe(false);
    if (!readiness.ok) {
      expect(readiness.reason).toBe("Schema v2 配置未成功装载，无法保存");
    }
  });
});

describe("v2 save readiness", () => {
  it("allows saving after a v2 mutation and recomputes diagnostics", () => {
    const state = createV2ProjectController(createV2Yaml());
    const nextConfig = removeRoute(state.v2!.config, "geosite-openai");
    const next = applyV2Config(state, nextConfig);

    expect(next.dirty).toBe(true);
    expect(next.draftYaml).toBe(serializeV2Project(nextConfig));
    expect(next.v2?.normalizedSummary).toMatchObject({ routes: 1 });
    expect(next.originalYaml).toBe(createV2Yaml());

    expect(canSaveProject(next)).toEqual({ ok: true, warnings: [] });
  });

  it("blocks saving with the first error diagnostic after a breaking mutation", () => {
    const state = createV2ProjectController(createV2Yaml());
    const brokenConfig = {
      ...state.v2!.config,
      routes: state.v2!.config.routes.map((route) =>
        route.id === "geosite-openai" ? { ...route, policy: { group: "ghost" } } : route,
      ),
    };
    const next = applyV2Config(state, brokenConfig);

    const readiness = canSaveProject(next);
    expect(readiness.ok).toBe(false);
    if (!readiness.ok) {
      expect(readiness.reason).toBe('路由 geosite-openai 引用的策略组 "ghost" 不存在');
      expect(readiness.diagnostics).toContainEqual(
        expect.objectContaining({ code: "validate.reference.missing", severity: "error" }),
      );
    }
  });

  it("resets the baseline after a v2 save", () => {
    const state = createV2ProjectController(createV2Yaml());
    const mutated = applyV2Config(state, addRoute(state.v2!.config, {
      policy: { group: "proxy" },
      source: { type: "geosite", value: "netflix" },
    }));
    expect(mutated.dirty).toBe(true);

    const saved = markV2ProjectSaved(mutated, mutated.draftYaml);
    expect(saved.dirty).toBe(false);
    expect(saved.originalYaml).toBe(mutated.draftYaml);
    expect(saved.status).toBe("ready");
    expect(saved.message).toBe("已保存 config/routes.yaml，可运行检查、生成和提交");
  });

  it("round-trips a mutated config through the load chain without errors", () => {
    const state = createV2ProjectController(createV2Yaml());
    const mutated = applyV2Config(state, addRoute(state.v2!.config, {
      policy: { group: "proxy" },
      source: { type: "rule-provider", provider: "ai" },
      section: "AI",
    }));
    expect(mutated.v2?.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });
});

describe("createProjectControllerFromDocument", () => {
  it("creates a v1 controller for v1 documents", () => {
    const document = createV1Document();
    const state = createProjectControllerFromDocument({ schemaVersion: 1, ...document });

    expect(state.schemaVersion).toBe(1);
    expect(state.v2).toBeUndefined();
    expect(state.draftConfig).toEqual(document.config);
  });

  it("creates a v2 controller with loaded v2 state for v2 documents", () => {
    const state = createProjectControllerFromDocument({
      schemaVersion: 2,
      yaml: createV2Yaml(),
    });

    expect(state.schemaVersion).toBe(2);
    expect(state.v2?.config).toEqual(createV2Config());
    expect(state.dirty).toBe(false);
  });
});
