import { describe, expect, it } from "vitest";
import { createPolicyStats, createRouteSummary } from "../src/routeSummary.js";

describe("route summary", () => {
  const config = {
    publishBaseUrl: "https://example.com/publish",
    template: { output: "Custom_Clash.ini" },
    proxyGroups: [
      { name: "Proxy", type: "select" as const, options: ["Direct"], nodeFilters: [".*"] },
      { name: "Tech", type: "select" as const, options: ["Proxy", "Direct"] },
      { name: "Direct", type: "select" as const, options: ["DIRECT"] },
    ],
    modules: [
      {
        id: "developer",
        policy: "Tech",
        geosite: ["github", "debian"],
        providers: [{ behavior: "domain" as const, file: "Local_Developer_Domain.yaml" }],
      },
      { id: "streaming", enabled: false, policy: "Proxy", geosite: ["netflix"] },
      { id: "china", policy: "Direct", geosite: ["cn"], geoip: ["cn"] },
    ],
    final: { policy: "Proxy" },
    vendorRepos: [],
    ruleProviders: [],
  };

  it("creates enabled route rows in evaluation order", () => {
    expect(createRouteSummary(config)).toEqual([
      { moduleId: "developer", source: "Provider", value: "Local_Developer_Domain.yaml", policy: "Tech" },
      { moduleId: "developer", source: "GEOSITE", value: "github", policy: "Tech" },
      { moduleId: "developer", source: "GEOSITE", value: "debian", policy: "Tech" },
      { moduleId: "china", source: "GEOSITE", value: "cn", policy: "Direct" },
      { moduleId: "china", source: "GEOIP", value: "cn", policy: "Direct" },
      { moduleId: "FINAL", source: "FINAL", value: "fallback", policy: "Proxy" },
    ]);
  });

  it("counts enabled modules per policy", () => {
    expect(createPolicyStats(config)).toEqual([
      { name: "Proxy", modules: 0, options: 2 },
      { name: "Tech", modules: 1, options: 2 },
      { name: "Direct", modules: 1, options: 1 },
    ]);
  });
});
