import { describe, expect, it } from "vitest";
import { createV2Config, createV2Yaml } from "./fixtures.js";
import { addRoute, removeRoute } from "../../src/v2/mutations.js";
import { serializeV2Project } from "../../src/v2/v2Project.js";
import {
  applyV2Config,
  canSaveProject,
  createV2ProjectController,
  markV2ProjectSaved,
} from "../../src/projectController.js";

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

describe("document loading", () => {
  it("creates a v2 controller with loaded v2 state for a v2 document payload", () => {
    const state = createV2ProjectController(createV2Yaml());

    expect(state.schemaVersion).toBe(2);
    expect(state.v2?.config).toEqual(createV2Config());
    expect(state.dirty).toBe(false);
  });

  it("threads runtime urls from the document into the v2 controller and projection", () => {
    const runtimeUrls = {
      publishBaseUrl: "http://192.168.1.10:8787",
      subconverterUrl: "http://10.0.0.3:25500/sub",
    };
    const state = createV2ProjectController(createV2Yaml(), runtimeUrls);

    expect(state.runtimeUrls).toEqual(runtimeUrls);
    // 只读投影（draftConfig 兜底）同样携带运行时 URL
    expect(state.draftConfig.publishBaseUrl).toBe("http://192.168.1.10:8787");
    expect(state.draftConfig.subconverterUrl).toBe("http://10.0.0.3:25500/sub");

    // 保存基线重置与 mutation 后 runtimeUrls 保留
    const mutated = applyV2Config(state, state.v2!.config);
    expect(mutated.runtimeUrls).toEqual(runtimeUrls);
    const saved = markV2ProjectSaved(mutated, mutated.draftYaml);
    expect(saved.runtimeUrls).toEqual(runtimeUrls);
  });
});

describe("baseMtime 透传", () => {
  it("createV2ProjectController 携带 baseMtime，markV2ProjectSaved 更新它", () => {
    const state = createV2ProjectController(createV2Yaml(), undefined, 1234);
    expect(state.baseMtime).toBe(1234);

    const mutated = applyV2Config(state, state.v2!.config);
    expect(mutated.baseMtime).toBe(1234);
    const saved = markV2ProjectSaved(mutated, mutated.draftYaml, 5678);
    expect(saved.baseMtime).toBe(5678);
  });

  it("未传 baseMtime 时为 undefined（调用方以 ?? 0 兜底）", () => {
    const state = createV2ProjectController(createV2Yaml());
    expect(state.baseMtime).toBeUndefined();
  });
});
