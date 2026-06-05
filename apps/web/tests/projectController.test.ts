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
    proxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
    modules: [
      { id: "developer", policy: "Proxy", geosite: ["github"] },
      { id: "streaming", enabled: false, policy: "Proxy" },
    ],
    final: { policy: "Proxy" },
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
    expect(canSaveProject(controller).ok).toBe(false);
  });

  it("tracks dirty state after draft config changes", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });

    const next = applyDraftConfig(controller, {
      ...config,
      modules: config.modules.map((module) =>
        module.id === "developer" ? { ...module, policy: "DIRECT" } : module,
      ),
    });

    expect(next.dirty).toBe(true);
    expect(canSaveProject(next)).toEqual({ ok: true });
    expect(controller.dirty).toBe(false);
  });

  it("blocks save readiness when required fields are empty", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });
    const next = applyDraftConfig(controller, {
      ...config,
      modules: [{ ...config.modules[0]!, id: "" }],
    });

    expect(canSaveProject(next)).toEqual({
      ok: false,
      reason: "模块 ID 不能为空",
    });
  });

  it("resets the dirty baseline after save", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });
    const dirty = applyDraftConfig(controller, {
      ...config,
      final: { policy: "DIRECT" },
    });

    const saved = markProjectSaved(dirty, {
      yaml: dirty.draftYaml,
      config: dirty.draftConfig,
    });

    expect(saved.dirty).toBe(false);
    expect(saved.originalConfig.final.policy).toBe("DIRECT");
    expect(saved.message).toBe("已保存 config/modules.yaml，可运行检查、生成和提交");
  });

  it("keeps view, selected module, and validation output in controller state", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });

    const selected = setProjectSelection(controller, {
      selectedView: "publish",
      selectedModuleId: "streaming",
    });
    const validated = updateProjectValidation(selected, {
      status: "success",
      output: "[check] ok",
    });

    expect(validated.selectedView).toBe("publish");
    expect(validated.selectedModuleId).toBe("streaming");
    expect(validated.validation).toEqual({ status: "success", output: "[check] ok" });
  });
});
