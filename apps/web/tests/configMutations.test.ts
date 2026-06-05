import { describe, expect, it } from "vitest";
import type { ProviderReference, RouteKitProjectConfig } from "@clash-route-kit/core";
import {
  addModule,
  deleteModule,
  setModuleProviderRefs,
  setModuleTags,
  toggleModule,
  createModule,
  updateModule,
} from "../src/configMutations.js";

function createConfig(): RouteKitProjectConfig {
  return {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    proxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
    modules: [
      {
        id: "developer",
        policy: "Proxy",
        geosite: ["github"],
        providers: [{ behavior: "domain", file: "rules/dev.yaml" }],
      },
      { id: "streaming", enabled: false, policy: "Media", geoip: ["netflix"] },
    ],
    final: { policy: "Proxy" },
    ruleProviders: [],
  };
}

describe("config mutation helpers", () => {
  it("updates one module without mutating the original config", () => {
    const config = createConfig();

    const next = updateModule(config, "developer", { policy: "DIRECT" });

    expect(next).not.toBe(config);
    expect(next.modules[0]).toEqual({
      id: "developer",
      policy: "DIRECT",
      geosite: ["github"],
      providers: [{ behavior: "domain", file: "rules/dev.yaml" }],
    });
    expect(config.modules[0]?.policy).toBe("Proxy");
  });

  it("returns the same config when updating a missing module", () => {
    const config = createConfig();

    expect(updateModule(config, "missing", { policy: "DIRECT" })).toBe(config);
  });

  it("toggles module enabled state using missing enabled as active", () => {
    const config = createConfig();

    const disabled = toggleModule(config, "developer");
    const enabled = toggleModule(config, "streaming");

    expect(disabled.modules[0]?.enabled).toBe(false);
    expect(enabled.modules[1]?.enabled).toBe(true);
  });

  it("adds a module and rejects duplicate module ids", () => {
    const config = createConfig();

    const next = addModule(config, { id: "ai", policy: "Proxy", geosite: ["openai"] });

    expect(next.modules.map((module) => module.id)).toEqual(["developer", "streaming", "ai"]);
    expect(() => addModule(next, { id: "ai", policy: "Proxy" })).toThrow("already exists");
  });

  it("creates a default module with the next available id and first policy", () => {
    const config = createConfig();

    const module = createModule(config);
    const custom = createModule({ ...config, modules: [...config.modules, module] }, { baseId: "module" });

    expect(module).toEqual({
      id: "module",
      enabled: true,
      policy: "Proxy",
      geosite: [],
      geoip: [],
      providers: [],
    });
    expect(custom.id).toBe("module-2");
  });

  it("deletes modules without mutating unrelated modules", () => {
    const config = createConfig();

    const next = deleteModule(config, "developer");

    expect(next.modules).toEqual([{ id: "streaming", enabled: false, policy: "Media", geoip: ["netflix"] }]);
    expect(config.modules).toHaveLength(2);
  });

  it("normalizes geosite and geoip tag lists", () => {
    const config = createConfig();

    const next = setModuleTags(config, "developer", "geosite", [" github ", "", "youtube", "github"]);
    const nextGeoip = setModuleTags(next, "developer", "geoip", ["  cn", "private "]);

    expect(nextGeoip.modules[0]?.geosite).toEqual(["github", "youtube"]);
    expect(nextGeoip.modules[0]?.geoip).toEqual(["cn", "private"]);
  });

  it("sets provider references immutably", () => {
    const config = createConfig();
    const providers: ProviderReference[] = [
      { behavior: "domain", file: "rules/ai.yaml", interval: 86400 },
      { behavior: "classical", file: "rules/custom.yaml" },
    ];

    const next = setModuleProviderRefs(config, "developer", providers);

    expect(next.modules[0]?.providers).toEqual(providers);
    expect(next.modules[0]?.providers).not.toBe(providers);
    expect(config.modules[0]?.providers).toEqual([{ behavior: "domain", file: "rules/dev.yaml" }]);
  });
});
