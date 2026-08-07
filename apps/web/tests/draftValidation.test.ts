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
    expect(validateDraftConfig(createConfig())).toEqual({ errors: [], warnings: [] });
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

    expect(validateDraftConfig(config)).toEqual({ errors: [], warnings: [] });
  });

  it("accepts explicit empty timeout and tolerance overrides", () => {
    const config = createConfig({
      customProxyGroups: [
        { name: "Proxy", type: "select", options: ["Auto", "DIRECT"] },
        {
          name: "Auto",
          type: "url-test",
          options: [],
          nodeFilters: [".*"],
          timeout: null,
          tolerance: null,
        },
      ],
      ruleSets: [{ id: "final", policy: "Proxy", source: { type: "final" } }],
      ruleProviders: [],
    });

    expect(validateDraftConfig(config)).toEqual({ errors: [], warnings: [] });
  });

  it("rejects invalid project defaults and item overrides", () => {
    const config = createConfig({
      defaults: {
        proxyGroups: {
          healthCheck: { url: "ftp://probe.example", interval: 0, timeout: 0 },
          urlTest: { tolerance: -1 },
        },
      },
      customProxyGroups: [
        { name: "Proxy", type: "select", options: ["Auto", "DIRECT"] },
        {
          name: "Auto",
          type: "url-test",
          options: [],
          nodeFilters: [".*"],
          timeout: 0,
        },
      ],
      ruleSets: [{ id: "final", policy: "Proxy", source: { type: "final" } }],
      ruleProviders: [],
    });

    expect(validateDraftConfig(config)).toEqual({
      errors: [
        "defaults.proxyGroups.healthCheck.url 必须是 HTTP/HTTPS URL",
        "defaults.proxyGroups.healthCheck.interval 必须为正整数",
        "defaults.proxyGroups.healthCheck.timeout 必须为正整数",
        "defaults.proxyGroups.urlTest.tolerance 必须为非负整数",
        "custom_proxy_group Auto 的 timeout 必须为正整数",
      ],
      warnings: [],
    });
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

    expect(validateDraftConfig(config)).toEqual({ errors: [], warnings: [] });
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

    expect(validateDraftConfig(config)).toEqual({
      errors: [
        "custom_proxy_group 名称不能重复：Proxy",
        "RuleSet ai 引用了不存在的 custom_proxy_group：Missing",
        "RuleSet final 引用了不存在的 custom_proxy_group：Gone",
      ],
      warnings: [],
    });
  });

  it("reports missing and duplicate FINAL ruleSets", () => {
    expect(validateDraftConfig(createConfig({
      ruleSets: [{ id: "ai", policy: "AI", source: { type: "geosite", value: "openai" } }],
    }))).toEqual({ errors: ["ruleSets 需要包含一条 FINAL 兜底规则"], warnings: [] });

    expect(validateDraftConfig(createConfig({
      ruleSets: [
        { id: "ai", policy: "AI", source: { type: "geosite", value: "openai" } },
        { id: "final-a", policy: "Proxy", source: { type: "final" } },
        { id: "final-b", policy: "Proxy", source: { type: "final" } },
      ],
    }))).toEqual({ errors: ["FINAL 兜底规则只能出现一次"], warnings: [] });
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

    expect(validateDraftConfig(config)).toEqual({
      errors: [
        "RuleSet ID 不能重复：ai",
        "RuleSet ai 的 provider 文件不能为空",
        "RuleSet ai 引用了不存在的 provider 输出：Missing.yaml",
        "RuleSet empty-geosite 的 GEOSITE 不能为空",
        "RuleSet empty-geoip 的 GEOIP 不能为空",
      ],
      warnings: [],
    });
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

    expect(validateDraftConfig(config)).toEqual({
      errors: [
        "Rule provider 名称不能重复：AI",
        "Rule provider 输出不能重复：AI_Domain.yaml",
        "Rule provider AI 的 source Bad path 不能包含绝对路径或 ..：../secret.list",
      ],
      warnings: ["规则源 AI 待补全：尚未指定数据源"],
    });
  });

  it("warns but does not error for empty placeholder rule providers", () => {
    const config = createConfig({
      ruleProviders: [
        { name: "CustomDirect", output: "Custom_Direct_Classical_IP.yaml", behavior: "classical", sources: [] },
      ] satisfies RuleProviderConfig[],
      ruleSets: [
        {
          id: "custom-direct",
          policy: "AI",
          source: { type: "rule-provider", behavior: "classical", file: "Custom_Direct_Classical_IP.yaml" },
        },
        { id: "final", policy: "Proxy", source: { type: "final" } },
      ],
    });

    expect(validateDraftConfig(config)).toEqual({
      errors: [],
      warnings: ["规则源 CustomDirect 待补全：尚未指定数据源"],
    });
  });
});
