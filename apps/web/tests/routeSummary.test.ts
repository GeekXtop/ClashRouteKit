import { describe, expect, it } from "vitest";
import {
  createCustomProxyGroupDetails,
  createCustomProxyGroupStats,
  createRouteSummary,
  selectInboundRuleSets,
} from "../src/routeSummary.js";

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

  it("counts all ruleSets per custom proxy group, including disabled", () => {
    expect(createCustomProxyGroupStats(config)).toEqual([
      {
        name: "Proxy",
        type: "select",
        directRuleSetCount: 2,
        referencedByGroupCount: 1,
        memberCount: 2,
      },
      {
        name: "Tech",
        type: "select",
        directRuleSetCount: 2,
        referencedByGroupCount: 0,
        memberCount: 2,
      },
      {
        name: "Direct",
        type: "select",
        directRuleSetCount: 1,
        referencedByGroupCount: 2,
        memberCount: 1,
      },
    ]);
  });

  it("returns direct RuleSets and parent groups in config order", () => {
    expect(createCustomProxyGroupDetails(config, "Direct")).toEqual({
      directRuleSets: [
        {
          id: "china-geoip-cn",
          enabled: true,
          source: "[]GEOIP,cn,no-resolve",
        },
      ],
      referencedByGroups: [
        { name: "Proxy", type: "select" },
        { name: "Tech", type: "select" },
      ],
      memberCount: 1,
    });
    expect(createCustomProxyGroupDetails(config, "Missing")).toBeUndefined();
  });

  it("includes effective health-check values for test groups", () => {
    const healthConfig = {
      ...config,
      defaults: {
        proxyGroups: {
          healthCheck: { interval: 600, timeout: 5 },
          urlTest: { tolerance: 80 },
        },
      },
      customProxyGroups: [
        ...config.customProxyGroups,
        { name: "Auto", type: "url-test" as const, options: [], nodeFilters: [".*"] },
      ],
    };

    expect(createCustomProxyGroupDetails(healthConfig, "Auto")?.healthCheck).toMatchObject({
      interval: { value: 600, source: "project" },
      timeout: { value: 5, source: "project" },
      tolerance: { value: 80, source: "project" },
    });
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
