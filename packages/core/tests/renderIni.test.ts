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
});
