import { describe, expect, it } from "vitest";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { serializeRouteKitConfig } from "@clash-route-kit/core";
import {
  applyDraftConfig,
  canSaveProject,
  createProjectController,
  markProjectMigrated,
  markProjectSaved,
  setProjectSelection,
  updateProjectValidation,
} from "../src/projectController.js";

function createConfig(): RouteKitProjectConfig {
  return {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
    ruleSets: [
      { id: "developer-geosite-github", policy: "Proxy", source: { type: "geosite", value: "github" } },
      { id: "streaming-geosite-youtube", enabled: false, policy: "Proxy", source: { type: "geosite", value: "youtube" } },
      { id: "final", policy: "Proxy", source: { type: "final" } },
    ],
    ruleProviders: [],
  };
}

describe("project controller", () => {
  it("starts clean even when loaded yaml formatting differs from normalized yaml", () => {
    const config = createConfig();
    const controller = createProjectController({
      yaml: "publishBaseUrl: http://127.0.0.1:8787\n",
      config,
    });

    expect(controller.dirty).toBe(false);
    expect(controller.draftYaml).toBe(serializeRouteKitConfig(config));
    expect(controller.selectedView).toBe("project");
    expect(controller.selectedRuleSetId).toBe("developer-geosite-github");
    expect(controller.selectedCustomProxyGroupName).toBe("Proxy");
    expect(canSaveProject(controller).ok).toBe(false);
  });

  it("defaults the landing view to project", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });
    expect(controller.selectedView).toBe("project");
  });

  it("tracks dirty state after draft config changes", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });

    const next = applyDraftConfig(controller, {
      ...config,
      ruleSets: config.ruleSets.map((ruleSet) =>
        ruleSet.id === "developer-geosite-github"
          ? { ...ruleSet, source: { type: "geosite", value: "gitlab" } }
          : ruleSet,
      ),
    });

    expect(next.dirty).toBe(true);
    expect(canSaveProject(next)).toEqual({ ok: true, warnings: [] });
    expect(controller.dirty).toBe(false);
  });

  it("blocks save readiness when required fields are empty", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });
    const next = applyDraftConfig(controller, {
      ...config,
      ruleSets: [{ ...config.ruleSets[0]!, id: "" }],
    });

    const readiness = canSaveProject(next);
    expect(readiness.ok).toBe(false);
    if (readiness.ok) throw new Error("expected blocked save");
    expect(readiness.reason).toBe("RuleSet ID 不能为空");
    expect(readiness.warnings).toEqual([]);
    expect(readiness.diagnostics).toContainEqual(expect.objectContaining({
      code: "route.id.empty",
      severity: "error",
    }));
  });

  it("blocks save readiness when ruleSet ids are duplicated", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });
    const next = applyDraftConfig(controller, {
      ...config,
      ruleSets: [
        { ...config.ruleSets[0]!, id: "developer-geosite-github" },
        { ...config.ruleSets[1]!, id: "developer-geosite-github" },
        config.ruleSets[2]!,
      ],
    });

    const readiness = canSaveProject(next);
    expect(readiness.ok).toBe(false);
    if (readiness.ok) throw new Error("expected blocked save");
    expect(readiness.reason).toBe("重复值：developer-geosite-github");
    expect(readiness.warnings).toEqual([]);
    expect(readiness.diagnostics).toContainEqual(expect.objectContaining({
      code: "route.id.duplicate",
      severity: "error",
    }));
  });

  it("blocks save readiness when a ruleSet references an unknown custom proxy group", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });
    const next = applyDraftConfig(controller, {
      ...config,
      ruleSets: [{ ...config.ruleSets[0]!, policy: "Missing" }, config.ruleSets[2]!],
    });

    const readiness = canSaveProject(next);
    expect(readiness.ok).toBe(false);
    if (readiness.ok) throw new Error("expected blocked save");
    expect(readiness.reason).toBe("RuleSet developer-geosite-github 引用了不存在的 custom_proxy_group：Missing");
    expect(readiness.warnings).toEqual([]);
    expect(readiness.diagnostics).toContainEqual(expect.objectContaining({
      code: "route.policy.missing",
      severity: "error",
    }));
  });

  it("resets the dirty baseline after save", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });
    const dirty = applyDraftConfig(controller, {
      ...config,
      ruleSets: config.ruleSets.map((ruleSet) =>
        ruleSet.id === "final" ? { ...ruleSet, policy: "DIRECT" } : ruleSet,
      ),
    });

    const saved = markProjectSaved(dirty, {
      yaml: dirty.draftYaml,
      config: dirty.draftConfig,
    });

    expect(saved.dirty).toBe(false);
    expect(saved.originalConfig.ruleSets.find((ruleSet) => ruleSet.id === "final")?.policy).toBe("DIRECT");
    expect(saved.message).toBe("已保存 config/routes.yaml，可运行检查、生成和提交");
  });

  it("counts Core warning diagnostics after save", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });
    const warningConfig: RouteKitProjectConfig = {
      ...config,
      ruleSets: [
        {
          id: "legacy-provider",
          enabled: false,
          policy: "Proxy",
          source: { type: "rule-provider", behavior: "domain", file: "Legacy.mrs" },
        },
        { id: "final", policy: "Proxy", source: { type: "final" } },
      ],
      ruleProviders: [
        { name: "Legacy", output: "Legacy.mrs", behavior: "domain", enabled: false, sources: [] },
      ],
    };

    const saved = markProjectSaved(controller, {
      yaml: serializeRouteKitConfig(warningConfig),
      config: warningConfig,
    });

    expect(saved.message).toBe("已保存，2 条配置警告待处理");
  });

  it("keeps view, selected ruleSet, and validation output in controller state", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });

    const selected = setProjectSelection(controller, {
      selectedView: "output",
      selectedRuleSetId: "streaming-geosite-youtube",
    });
    const validated = updateProjectValidation(selected, {
      status: "success",
      output: "[check] ok",
    });

    expect(validated.selectedView).toBe("output");
    expect(validated.selectedRuleSetId).toBe("streaming-geosite-youtube");
    expect(validated.validation).toEqual({ status: "success", output: "[check] ok" });
  });

  it("blocks save with the first Core error and keeps all diagnostics", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });
    const dirty = applyDraftConfig(controller, {
      ...config,
      ruleSets: [
        { id: "ai", policy: "Missing", source: { type: "geosite", value: "openai" } },
        { id: "final", policy: "Proxy", source: { type: "final" } },
      ],
    });

    const readiness = canSaveProject(dirty);
    expect(readiness.ok).toBe(false);
    if (readiness.ok) throw new Error("expected blocked save");
    expect(readiness.reason).toBe("RuleSet ai 引用了不存在的 custom_proxy_group：Missing");
    expect(readiness.diagnostics).toContainEqual(expect.objectContaining({
      code: "route.policy.missing",
      severity: "error",
    }));
  });

  it("allows disabled imported provider placeholders as warnings", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });
    const dirty = applyDraftConfig(controller, {
      ...config,
      ruleSets: [
        {
          id: "legacy-provider",
          enabled: false,
          policy: "Proxy",
          source: { type: "rule-provider", behavior: "domain", file: "Legacy.mrs" },
        },
        { id: "final", policy: "Proxy", source: { type: "final" } },
      ],
      ruleProviders: [
        { name: "Legacy", output: "Legacy.mrs", behavior: "domain", enabled: false, sources: [] },
      ],
    });

    const readiness = canSaveProject(dirty);
    expect(readiness.ok).toBe(true);
    if (!readiness.ok) throw new Error(readiness.reason);
    expect(readiness.warnings.map((diagnostic) => diagnostic.code)).toEqual([
      "provider.sources.disabled-empty",
      "provider.output.disabled-unsupported",
    ]);
  });

  it("selects first custom proxy group, provider, and rule file when available", () => {
    const config = {
      ...createConfig(),
      ruleProviders: [{ name: "AI", output: "AI_Domain.yaml", behavior: "domain" as const, sources: [] }],
    };
    const controller = createProjectController({
      yaml: serializeRouteKitConfig(config),
      config,
    });

    expect(controller.selectedCustomProxyGroupName).toBe("Proxy");
    expect(controller.selectedProviderName).toBe("AI");
    expect(controller.selectedRuleFile).toBe("");
  });

  it("keeps selections valid after draft changes", () => {
    const config = {
      ...createConfig(),
      ruleProviders: [{ name: "AI", output: "AI_Domain.yaml", behavior: "domain" as const, sources: [] }],
    };
    const controller = setProjectSelection(
      createProjectController({
        yaml: serializeRouteKitConfig(config),
        config,
      }),
      {
        selectedCustomProxyGroupName: "Proxy",
        selectedProviderName: "AI",
        selectedRuleFile: "AI.list",
        selectedRuleSetId: "developer-geosite-github",
      },
    );

    const next = applyDraftConfig(controller, {
      ...config,
      customProxyGroups: [{ name: "Direct", type: "select", options: ["DIRECT"] }],
      ruleSets: [
        { id: "direct", policy: "Direct", source: { type: "geosite", value: "cn" } },
        { id: "final", policy: "Direct", source: { type: "final" } },
      ],
      ruleProviders: [],
    });

    expect(next.selectedRuleSetId).toBe("direct");
    expect(next.selectedCustomProxyGroupName).toBe("Direct");
    expect(next.selectedProviderName).toBe("");
    expect(next.selectedRuleFile).toBe("AI.list");
  });
});

describe("project controller schema version", () => {
  it("detects schema v1 and v2 from the loaded yaml", () => {
    const config = createConfig();
    const v1 = createProjectController({ yaml: serializeRouteKitConfig(config), config });
    expect(v1.schemaVersion).toBe(1);

    const v2 = createProjectController({
      yaml: "schemaVersion: 2\nproject:\n  template:\n    output: Custom_Clash.ini\nproxyGroups: []\nroutes: []\n",
      config,
    });
    expect(v2.schemaVersion).toBe(2);
  });

  it("keeps the schema version across draft edits", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });
    const next = applyDraftConfig(controller, {
      ...config,
      ruleSets: [{ id: "final", policy: "DIRECT", source: { type: "final" } }],
    });
    expect(next.schemaVersion).toBe(1);
  });

  it("blocks v1 save on migrated snapshots and marks the project as schema v2", () => {
    const config = createConfig();
    const migrated = markProjectMigrated(
      createProjectController({ yaml: serializeRouteKitConfig(config), config }),
    );
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.dirty).toBe(false);

    const readiness = canSaveProject({ ...migrated, dirty: true });
    expect(readiness.ok).toBe(false);
    if (!readiness.ok) {
      expect(readiness.reason).toBe("Schema v2 项目暂不支持 v1 编辑保存");
    }
  });
});
