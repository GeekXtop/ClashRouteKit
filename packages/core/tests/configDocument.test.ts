import { describe, expect, it } from "vitest";
import {
  parseRouteKitConfig,
  serializeRouteKitConfig,
} from "../src/index.js";

const base = `
publishBaseUrl: http://127.0.0.1:8787
template:
  output: Custom_Clash.ini
vendorRepos: []
customProxyGroups:
  - name: Proxy
    type: select
    options:
      - DIRECT
ruleSets:
  - id: final
    policy: Proxy
    source:
      type: final
ruleProviders: []
`;

describe("config document utilities", () => {
  const yaml = [
    "publishBaseUrl: http://127.0.0.1:8787",
    "template:",
    "  output: Custom_Clash.ini",
    "vendorRepos: []",
    "customProxyGroups:",
    "  - name: Proxy",
    "    type: select",
    "    options:",
    "      - DIRECT",
    "ruleSets:",
    "  - id: ai-provider",
    "    policy: Proxy",
    "    source:",
    "      type: rule-provider",
    "      behavior: domain",
    "      file: AI_Domain.yaml",
    "  - id: ai-openai",
    "    policy: Proxy",
    "    source:",
    "      type: geosite",
    "      value: openai",
    "  - id: final",
    "    policy: Proxy",
    "    source:",
    "      type: final",
    "ruleProviders: []",
    "",
  ].join("\n");

  it("parses routes-first config documents", () => {
    const config = parseRouteKitConfig(yaml);

    expect(config.template.output).toBe("Custom_Clash.ini");
    expect(config.customProxyGroups).toEqual([
      { name: "Proxy", type: "select", options: ["DIRECT"] },
    ]);
    expect(config.ruleSets).toEqual([
      {
        id: "ai-provider",
        policy: "Proxy",
        source: { type: "rule-provider", behavior: "domain", file: "AI_Domain.yaml" },
      },
      {
        id: "ai-openai",
        policy: "Proxy",
        source: { type: "geosite", value: "openai" },
      },
      {
        id: "final",
        policy: "Proxy",
        source: { type: "final" },
      },
    ]);
  });

  it("serializes only routes-first fields with a trailing newline", () => {
    const serialized = serializeRouteKitConfig(parseRouteKitConfig(yaml));

    expect(serialized).toContain("publishBaseUrl: http://127.0.0.1:8787");
    expect(serialized).toContain("template:");
    expect(serialized).toContain("customProxyGroups:");
    expect(serialized).toContain("ruleSets:");
    expect(serialized).not.toContain("proxyGroups:");
    expect(serialized).not.toContain("modules:");
    expect(serialized.endsWith("\n")).toBe(true);
  });

  it("rejects documents that are not route kit project configs", () => {
    expect(() => parseRouteKitConfig("modules: nope\n")).toThrow(
      "config.modules: unknown field",
    );
  });

  it("rejects legacy modules/proxyGroups documents", () => {
    expect(() =>
      parseRouteKitConfig([
        "publishBaseUrl: http://127.0.0.1:8787",
        "template:",
        "  output: Custom_Clash.ini",
        "vendorRepos: []",
        "proxyGroups: []",
        "modules: []",
        "",
      ].join("\n")),
    ).toThrow("config.proxyGroups: unknown field");
  });

  it("preserves template flags and globalRemove through parse + serialize", () => {
    const doc = [
      "publishBaseUrl: http://127.0.0.1:8787",
      "template:",
      "  output: Custom_Clash.ini",
      "  enableRuleGenerator: true",
      "  overwriteOriginalRules: true",
      "  clashRuleBase: https://example.com/Base.yml",
      "vendorRepos: []",
      "globalRemove:",
      "  - DOMAIN-SUFFIX,example.com",
      "customProxyGroups: []",
      "ruleSets:",
      "  - id: final",
      "    policy: DIRECT",
      "    source:",
      "      type: final",
      "",
    ].join("\n");

    const config = parseRouteKitConfig(doc);
    expect(config.template.clashRuleBase).toBe("https://example.com/Base.yml");
    expect(config.globalRemove).toEqual(["DOMAIN-SUFFIX,example.com"]);

    const serialized = serializeRouteKitConfig(config);
    expect(serialized).toContain("clashRuleBase: https://example.com/Base.yml");
    expect(serialized).toContain("- DOMAIN-SUFFIX,example.com");
  });

  it("preserves subconverterUrl across parse + serialize", () => {
    const config = parseRouteKitConfig(
      [
        "publishBaseUrl: http://10.0.0.3:8787",
        "subconverterUrl: http://10.0.0.3:25500/sub",
        "template:",
        "  output: Custom_Clash.ini",
        "vendorRepos: []",
        "customProxyGroups: []",
        "ruleSets: []",
        "",
      ].join("\n"),
    );
    expect(config.subconverterUrl).toBe("http://10.0.0.3:25500/sub");
    expect(serializeRouteKitConfig(config)).toContain("subconverterUrl: http://10.0.0.3:25500/sub");
  });

  it("preserves project defaults across parse and serialize", () => {
    const config = parseRouteKitConfig(
      [
        "publishBaseUrl: http://127.0.0.1:8787",
        "defaults:",
        "  proxyGroups:",
        "    healthCheck:",
        "      url: https://probe.example/204",
        "      interval: 300",
        "      timeout: 5",
        "    urlTest:",
        "      tolerance: 50",
        "  ruleSets:",
        "    ruleProviderInterval: 28800",
        "    geoipNoResolve: true",
        "template:",
        "  output: Custom_Clash.ini",
        "vendorRepos: []",
        "customProxyGroups: []",
        "ruleSets: []",
        "",
      ].join("\n"),
    );

    expect(config.defaults).toEqual({
      proxyGroups: {
        healthCheck: {
          url: "https://probe.example/204",
          interval: 300,
          timeout: 5,
        },
        urlTest: { tolerance: 50 },
      },
      ruleSets: {
        ruleProviderInterval: 28800,
        geoipNoResolve: true,
      },
    });
    expect(serializeRouteKitConfig(config)).toContain("ruleProviderInterval: 28800");
  });

  it("rejects a numeric proxy group instead of trusting a TypeScript assertion", () => {
    expect(() => parseRouteKitConfig(base.replace(
      "  - name: Proxy\n    type: select\n    options:\n      - DIRECT",
      "  - 42",
    ))).toThrow("customProxyGroups[0]: expected object");
  });

  it("rejects a RuleSet with a missing policy", () => {
    expect(() => parseRouteKitConfig(base.replace("    policy: Proxy\n", ""))).toThrow(
      "ruleSets[0].policy: expected string",
    );
  });

  it("rejects an invalid nested vendor catalog kind", () => {
    const yaml = base.replace(
      "vendorRepos: []",
      `vendorRepos:
  - name: bad
    url: https://example.com/repo.git
    path: vendor/bad
    catalog:
      dir: vendor/bad/data
      kind: 123`,
    );
    expect(() => parseRouteKitConfig(yaml)).toThrow(
      "vendorRepos[0].catalog.kind: expected string",
    );
  });

  it("rejects unknown nested source fields", () => {
    const yaml = base.replace(
      "ruleProviders: []",
      `ruleProviders:
  - name: Custom
    output: Custom.yaml
    behavior: domain
    sources:
      - name: Local
        type: clash-list
        path: config/rules/Custom.list
        absolutePath: C:/secret`,
    );
    expect(() => parseRouteKitConfig(yaml)).toThrow(
      "ruleProviders[0].sources[0].absolutePath: unknown field",
    );
  });

  it("rejects null rule-provider source intervals", () => {
    const yaml = base.replace(
      "      type: final",
      "      type: rule-provider\n      behavior: domain\n      file: rules.yaml\n      interval: null",
    );
    expect(() => parseRouteKitConfig(yaml)).toThrow(
      "ruleSets[0].source.interval: expected number",
    );
  });
});
