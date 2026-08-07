import { describe, expect, it } from "vitest";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { serializeRouteKitConfig } from "@clash-route-kit/core";
import {
  applyDraftConfig,
  canSaveProject,
  createProjectController,
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
    expect(controller.selectedView).toBe("library");
    expect(controller.selectedRuleSetId).toBe("developer-geosite-github");
    expect(controller.selectedCustomProxyGroupName).toBe("Proxy");
    expect(canSaveProject(controller).ok).toBe(false);
  });

  it("defaults the landing view to library", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });
    expect(controller.selectedView).toBe("library");
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

    expect(canSaveProject(next)).toEqual({
      ok: false,
      reason: "RuleSet ID 不能为空",
      warnings: [],
    });
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

    expect(canSaveProject(next)).toEqual({
      ok: false,
      reason: "RuleSet ID 不能重复：developer-geosite-github",
      warnings: [],
    });
  });

  it("blocks save readiness when a ruleSet references an unknown custom proxy group", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });
    const next = applyDraftConfig(controller, {
      ...config,
      ruleSets: [{ ...config.ruleSets[0]!, policy: "Missing" }, config.ruleSets[2]!],
    });

    expect(canSaveProject(next)).toEqual({
      ok: false,
      reason: "RuleSet developer-geosite-github 引用了不存在的 custom_proxy_group：Missing",
      warnings: [],
    });
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

  it("keeps view, selected ruleSet, and validation output in controller state", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });

    const selected = setProjectSelection(controller, {
      selectedView: "publish",
      selectedRuleSetId: "streaming-geosite-youtube",
    });
    const validated = updateProjectValidation(selected, {
      status: "success",
      output: "[check] ok",
    });

    expect(validated.selectedView).toBe("publish");
    expect(validated.selectedRuleSetId).toBe("streaming-geosite-youtube");
    expect(validated.validation).toEqual({ status: "success", output: "[check] ok" });
  });

  it("uses draft validation diagnostics for save readiness", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });
    const dirty = applyDraftConfig(controller, {
      ...config,
      ruleSets: [{ id: "ai", policy: "Missing", source: { type: "geosite", value: "openai" } }],
    });

    expect(canSaveProject(dirty)).toEqual({
      ok: false,
      reason: "RuleSet ai 引用了不存在的 custom_proxy_group：Missing",
      warnings: [],
    });
  });

  it("allows saving drafts that only have placeholder provider warnings", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });
    const dirty = applyDraftConfig(controller, {
      ...config,
      ruleSets: [
        {
          id: "custom-direct",
          policy: "Proxy",
          source: { type: "rule-provider", behavior: "classical", file: "Custom_Direct_Classical_IP.yaml" },
        },
        { id: "final", policy: "Proxy", source: { type: "final" } },
      ],
      ruleProviders: [
        { name: "CustomDirect", output: "Custom_Direct_Classical_IP.yaml", behavior: "classical", sources: [] },
      ],
    });

    expect(canSaveProject(dirty)).toEqual({
      ok: true,
      warnings: ["规则源 CustomDirect 待补全：尚未指定数据源"],
    });
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
