import { describe, expect, it } from "vitest";
import type {
  CustomProxyGroup,
  RouteKitProjectConfig,
  RuleProviderConfig,
  RuleSet,
} from "@clash-route-kit/core";
import { validateDraftConfig } from "../src/draftValidation.js";

function createConfig(overrides: Partial<RouteKitProjectConfig> = {}): RouteKitProjectConfig {
  return {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    customProxyGroups: [
      { name: "Proxy", type: "select", options: ["DIRECT"] },
      { name: "AI", type: "select", options: ["Proxy", "DIRECT"] },
    ],
    ruleSets: [
      { id: "ai-provider", policy: "AI", source: { type: "rule-provider", behavior: "domain", file: "AI_Domain.yaml" } },
      { id: "final", policy: "Proxy", source: { type: "final" } },
    ],
    ruleProviders: [
      {
        name: "AI",
        output: "AI_Domain.yaml",
        behavior: "domain",
        sources: [{ name: "AI", type: "clash-list", path: "config/rules/AI.list" }],
      },
    ],
    ...overrides,
  };
}

describe("draft config validation", () => {
  it("accepts a valid draft config", () => {
    expect(validateDraftConfig(createConfig())).toEqual([]);
  });

  it("accepts custom proxy groups that use node filters without explicit options", () => {
    const config = createConfig({
      customProxyGroups: [
        { name: "Proxy", type: "select", options: ["Auto", "DIRECT"] },
        { name: "Auto", type: "url-test", options: [], nodeFilters: [".*"] },
      ] satisfies CustomProxyGroup[],
      ruleSets: [
        { id: "ai", policy: "Proxy", source: { type: "geosite", value: "openai" } },
        { id: "final", policy: "Proxy", source: { type: "final" } },
      ],
    });

    expect(validateDraftConfig(config)).toEqual([]);
  });

  it("accepts vendor rule provider sources with a safe base path", () => {
    const config = createConfig({
      ruleSets: [
        { id: "developer-provider", policy: "AI", source: { type: "rule-provider", behavior: "domain", file: "Developer_Domain.yaml" } },
        { id: "final", policy: "Proxy", source: { type: "final" } },
      ],
      ruleProviders: [
        {
          name: "Developer",
          output: "Developer_Domain.yaml",
          behavior: "domain",
          sources: [
            {
              name: "ACL4SSR_Developer",
              type: "clash-list",
              basePath: "vendor/ACL4SSR",
              path: "Clash/Ruleset/Developer.list",
            },
          ],
        },
      ] satisfies RuleProviderConfig[],
    });

    expect(validateDraftConfig(config)).toEqual([]);
  });

  it("reports duplicate custom proxy group names and missing policy references", () => {
    const config = createConfig({
      customProxyGroups: [
        { name: "Proxy", type: "select", options: ["DIRECT"] },
        { name: "Proxy", type: "select", options: ["DIRECT"] },
      ] satisfies CustomProxyGroup[],
      ruleSets: [
        { id: "ai", policy: "Missing", source: { type: "geosite", value: "openai" } },
        { id: "final", policy: "Gone", source: { type: "final" } },
      ] satisfies RuleSet[],
    });

    expect(validateDraftConfig(config)).toEqual([
      "custom_proxy_group 名称不能重复：Proxy",
      "RuleSet ai 引用了不存在的 custom_proxy_group：Missing",
      "RuleSet final 引用了不存在的 custom_proxy_group：Gone",
    ]);
  });

  it("reports missing and duplicate FINAL ruleSets", () => {
    expect(validateDraftConfig(createConfig({
      ruleSets: [{ id: "ai", policy: "AI", source: { type: "geosite", value: "openai" } }],
    }))).toEqual(["ruleSets 需要包含一条 FINAL 兜底规则"]);

    expect(validateDraftConfig(createConfig({
      ruleSets: [
        { id: "ai", policy: "AI", source: { type: "geosite", value: "openai" } },
        { id: "final-a", policy: "Proxy", source: { type: "final" } },
        { id: "final-b", policy: "Proxy", source: { type: "final" } },
      ],
    }))).toEqual(["FINAL 兜底规则只能出现一次"]);
  });

  it("reports duplicate ruleSets and invalid ruleSet sources", () => {
    const config = createConfig({
      ruleSets: [
        { id: "ai", policy: "AI", source: { type: "rule-provider", behavior: "domain", file: "" } },
        { id: "ai", policy: "AI", source: { type: "rule-provider", behavior: "domain", file: "Missing.yaml" } },
        { id: "empty-geosite", policy: "Proxy", source: { type: "geosite", value: "" } },
        { id: "empty-geoip", policy: "Proxy", source: { type: "geoip", value: "" } },
        { id: "final", policy: "Proxy", source: { type: "final" } },
      ] satisfies RuleSet[],
    });

    expect(validateDraftConfig(config)).toEqual([
      "RuleSet ID 不能重复：ai",
      "RuleSet ai 的 provider 文件不能为空",
      "RuleSet ai 引用了不存在的 provider 输出：Missing.yaml",
      "RuleSet empty-geosite 的 GEOSITE 不能为空",
      "RuleSet empty-geoip 的 GEOIP 不能为空",
    ]);
  });

  it("reports invalid rule providers and unsafe rule source paths", () => {
    const config = createConfig({
      ruleProviders: [
        { name: "AI", output: "AI_Domain.yaml", behavior: "domain", sources: [] },
        {
          name: "AI",
          output: "AI_Domain.yaml",
          behavior: "domain",
          sources: [{ name: "Bad", type: "clash-list", path: "../secret.list" }],
        },
      ] satisfies RuleProviderConfig[],
    });

    expect(validateDraftConfig(config)).toEqual([
      "Rule provider 名称不能重复：AI",
      "Rule provider 输出不能重复：AI_Domain.yaml",
      "Rule provider AI 至少需要一个 source",
      "Rule provider AI 的 source Bad path 不能包含绝对路径或 ..：../secret.list",
    ]);
  });
});
