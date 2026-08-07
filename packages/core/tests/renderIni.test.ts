import { describe, expect, it } from "vitest";
import { renderIni } from "../src/index.js";

describe("renderIni", () => {
  it("renders ruleSets directly as SubConverter ruleset lines", () => {
    const ini = renderIni({
      publishBaseUrl: "https://raw.githubusercontent.com/acme/routes/publish",
      customProxyGroups: [
        { name: "AI", type: "select", options: ["Proxy", "Direct"], nodeFilters: [".*"] },
      ],
      ruleSets: [
        {
          id: "ai-provider",
          policy: "AI",
          source: { type: "rule-provider", behavior: "domain", file: "AI_Domain.yaml", interval: 300 },
        },
        {
          id: "ai-geosite",
          policy: "AI",
          source: { type: "geosite", value: "openai" },
        },
        {
          id: "telegram-ip",
          policy: "Proxy",
          source: { type: "geoip", value: "telegram", noResolve: true },
        },
        {
          id: "china-ip",
          policy: "Direct",
          source: { type: "geoip", value: "cn", noResolve: false },
        },
        {
          id: "final",
          policy: "AI",
          source: { type: "final" },
        },
      ],
    });

    expect(ini.split("\n")).toContain("[custom]");
    expect(ini).toContain(
      "ruleset=AI,clash-domain:https://raw.githubusercontent.com/acme/routes/publish/rules/AI_Domain.yaml,300",
    );
    expect(ini).toContain("ruleset=AI,[]GEOSITE,openai");
    expect(ini).toContain("ruleset=Proxy,[]GEOIP,telegram,no-resolve");
    expect(ini).toContain("ruleset=Direct,[]GEOIP,cn");
    expect(ini).not.toContain("ruleset=Direct,[]GEOIP,cn,no-resolve");
    expect(ini).toContain("ruleset=AI,[]FINAL");
    expect(ini).toContain("custom_proxy_group=AI`select`[]Proxy`[]Direct`.*");
    expect(ini).not.toContain("[].*");
  });

  it("skips disabled ruleSet entries", () => {
    const ini = renderIni({
      publishBaseUrl: "http://127.0.0.1:8787",
      customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
      ruleSets: [
        { id: "off", enabled: false, policy: "Proxy", source: { type: "geosite", value: "youtube" } },
      ],
    });

    expect(ini).not.toContain("youtube");
  });

  it("defaults the rule-generator and overwrite flags to true", () => {
    const ini = renderIni({
      publishBaseUrl: "http://127.0.0.1:8787",
      customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
      ruleSets: [{ id: "final", policy: "Proxy", source: { type: "final" } }],
    });
    expect(ini).toContain("enable_rule_generator=true");
    expect(ini).toContain("overwrite_original_rules=true");
  });

  it("honors overridden rule-generator and overwrite flags", () => {
    const ini = renderIni(
      {
        publishBaseUrl: "http://127.0.0.1:8787",
        customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
        ruleSets: [{ id: "final", policy: "Proxy", source: { type: "final" } }],
      },
      { enableRuleGenerator: false, overwriteOriginalRules: false },
    );
    expect(ini).toContain("enable_rule_generator=false");
    expect(ini).toContain("overwrite_original_rules=false");
  });

  it("emits clash_rule_base only when provided", () => {
    const without = renderIni({
      publishBaseUrl: "http://127.0.0.1:8787",
      customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
      ruleSets: [{ id: "final", policy: "Proxy", source: { type: "final" } }],
    });
    expect(without).not.toContain("clash_rule_base=");

    const withBase = renderIni(
      {
        publishBaseUrl: "http://127.0.0.1:8787",
        customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
        ruleSets: [{ id: "final", policy: "Proxy", source: { type: "final" } }],
      },
      { clashRuleBase: "https://example.com/Base.yml" },
    );
    expect(withBase).toContain("clash_rule_base=https://example.com/Base.yml");
  });

  it("emits a comment separator when the ruleSet section changes", () => {
    const ini = renderIni({
      publishBaseUrl: "http://127.0.0.1:8787",
      customProxyGroups: [{ name: "AI", type: "select", options: ["DIRECT"] }],
      ruleSets: [
        { id: "ad", section: "拦截", policy: "AI", source: { type: "geosite", value: "category-ads-all" } },
        { id: "openai", section: "海外类目", policy: "AI", source: { type: "geosite", value: "openai" } },
        { id: "anthropic", section: "海外类目", policy: "AI", source: { type: "geosite", value: "anthropic" } },
        { id: "final", policy: "AI", source: { type: "final" } },
      ],
    });
    const lines = ini.split("\n");
    expect(lines).toContain("; 拦截");
    expect(lines).toContain("; 海外类目");
    expect(lines.filter((line) => line === "; 海外类目")).toHaveLength(1);
    expect(lines.indexOf("; 海外类目")).toBeLessThan(lines.indexOf("ruleset=AI,[]GEOSITE,openai"));
  });

  it("renders inherited and explicitly empty health-check slots with the shortest legal tail", () => {
    const ini = renderIni({
      publishBaseUrl: "https://example.com/publish",
      defaults: {
        proxyGroups: {
          healthCheck: {
            url: "https://probe.example/204",
            interval: 300,
            timeout: 5,
          },
          urlTest: { tolerance: 50 },
        },
      },
      customProxyGroups: [
        { name: "Inherited", type: "url-test", options: [], nodeFilters: [".*"] },
        {
          name: "NoTimeout",
          type: "url-test",
          options: [],
          nodeFilters: [".*"],
          timeout: null,
        },
        {
          name: "NoTolerance",
          type: "url-test",
          options: [],
          nodeFilters: [".*"],
          timeout: 8,
          tolerance: null,
        },
      ],
      ruleSets: [],
    });

    expect(ini).toContain(
      "custom_proxy_group=Inherited`url-test`.*`https://probe.example/204`300,5,50",
    );
    expect(ini).toContain(
      "custom_proxy_group=NoTimeout`url-test`.*`https://probe.example/204`300,,50",
    );
    expect(ini).toContain(
      "custom_proxy_group=NoTolerance`url-test`.*`https://probe.example/204`300,8",
    );
  });

  it("keeps the legacy health-check tail when project defaults are absent", () => {
    const ini = renderIni({
      publishBaseUrl: "https://example.com/publish",
      customProxyGroups: [
        { name: "Auto", type: "url-test", options: [], nodeFilters: [".*"] },
      ],
      ruleSets: [],
    });

    expect(ini).toContain(
      "custom_proxy_group=Auto`url-test`.*`https://cp.cloudflare.com/generate_204`300,,50",
    );
  });

  it("uses project RuleSet defaults while preserving item overrides", () => {
    const ini = renderIni({
      publishBaseUrl: "https://example.com/publish",
      defaults: {
        ruleSets: {
          ruleProviderInterval: 600,
          geoipNoResolve: false,
        },
      },
      customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
      ruleSets: [
        {
          id: "inherited-provider",
          policy: "Proxy",
          source: { type: "rule-provider", behavior: "domain", file: "Inherited.yaml" },
        },
        {
          id: "custom-provider",
          policy: "Proxy",
          source: {
            type: "rule-provider",
            behavior: "domain",
            file: "Custom.yaml",
            interval: 120,
          },
        },
        {
          id: "inherited-geoip",
          policy: "Proxy",
          source: { type: "geoip", value: "cn" },
        },
        {
          id: "custom-geoip",
          policy: "Proxy",
          source: { type: "geoip", value: "telegram", noResolve: true },
        },
      ],
    });

    expect(ini).toContain(
      "ruleset=Proxy,clash-domain:https://example.com/publish/rules/Inherited.yaml,600",
    );
    expect(ini).toContain(
      "ruleset=Proxy,clash-domain:https://example.com/publish/rules/Custom.yaml,120",
    );
    expect(ini).toContain("ruleset=Proxy,[]GEOIP,cn\n");
    expect(ini).not.toContain("ruleset=Proxy,[]GEOIP,cn,no-resolve");
    expect(ini).toContain("ruleset=Proxy,[]GEOIP,telegram,no-resolve");
  });
});
