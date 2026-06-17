import { describe, expect, it } from "vitest";
import { createCustomProxyGroupStats, createRouteSummary, selectInboundRuleSets } from "../src/routeSummary.js";

describe("route summary", () => {
  const config = {
    publishBaseUrl: "https://example.com/publish",
    template: { output: "Custom_Clash.ini" },
    customProxyGroups: [
      { name: "Proxy", type: "select" as const, options: ["Direct"], nodeFilters: [".*"] },
      { name: "Tech", type: "select" as const, options: ["Proxy", "Direct"] },
      { name: "Direct", type: "select" as const, options: ["DIRECT"] },
    ],
    ruleSets: [
      {
        id: "developer-provider",
        policy: "Tech",
        source: { type: "rule-provider" as const, behavior: "domain" as const, file: "Local_Developer_Domain.yaml" },
      },
      { id: "developer-geosite-github", policy: "Tech", source: { type: "geosite" as const, value: "github" } },
      { id: "streaming-geosite-netflix", enabled: false, policy: "Proxy", source: { type: "geosite" as const, value: "netflix" } },
      { id: "china-geoip-cn", policy: "Direct", source: { type: "geoip" as const, value: "cn", noResolve: true } },
      { id: "final", policy: "Proxy", source: { type: "final" as const } },
    ],
    vendorRepos: [],
    ruleProviders: [],
  };

  it("creates one route row per ruleSet in evaluation order", () => {
    expect(createRouteSummary(config)).toEqual([
      {
        id: "developer-provider",
        enabled: true,
        policy: "Tech",
        source: "clash-domain:Local_Developer_Domain.yaml",
        output: "ruleset=Tech,clash-domain:https://example.com/publish/rules/Local_Developer_Domain.yaml,28800",
      },
      {
        id: "developer-geosite-github",
        enabled: true,
        policy: "Tech",
        source: "[]GEOSITE,github",
        output: "ruleset=Tech,[]GEOSITE,github",
      },
      {
        id: "streaming-geosite-netflix",
        enabled: false,
        policy: "Proxy",
        source: "[]GEOSITE,netflix",
        output: "ruleset=Proxy,[]GEOSITE,netflix",
      },
      {
        id: "china-geoip-cn",
        enabled: true,
        policy: "Direct",
        source: "[]GEOIP,cn,no-resolve",
        output: "ruleset=Direct,[]GEOIP,cn,no-resolve",
      },
      {
        id: "final",
        enabled: true,
        policy: "Proxy",
        source: "[]FINAL",
        output: "ruleset=Proxy,[]FINAL",
      },
    ]);
  });

  it("counts enabled ruleSets per custom proxy group", () => {
    expect(createCustomProxyGroupStats(config)).toEqual([
      { name: "Proxy", ruleSets: 1, options: 2 },
      { name: "Tech", ruleSets: 2, options: 2 },
      { name: "Direct", ruleSets: 1, options: 1 },
    ]);
  });

  it("selects inbound ruleSets for a group in order, keeping disabled", () => {
    expect(selectInboundRuleSets(config, "Tech")).toEqual([
      { id: "developer-provider", enabled: true, source: "clash-domain:Local_Developer_Domain.yaml" },
      { id: "developer-geosite-github", enabled: true, source: "[]GEOSITE,github" },
    ]);
    expect(selectInboundRuleSets(config, "Proxy")).toEqual([
      { id: "streaming-geosite-netflix", enabled: false, source: "[]GEOSITE,netflix" },
      { id: "final", enabled: true, source: "[]FINAL" },
    ]);
    expect(selectInboundRuleSets(config, "Nonexistent")).toEqual([]);
  });
});
