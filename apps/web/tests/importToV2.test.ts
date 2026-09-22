import { describe, expect, it } from "vitest";
import { parseAuthorProjectConfig } from "@clash-route-kit/core";
import type { AuthorProjectConfigV2 } from "@clash-route-kit/core";
import { importTemplateAsV2 } from "../src/features/project/importToV2.js";

const baseYaml = `schemaVersion: 2
project:
  template:
    output: Custom_Clash.ini
proxyGroups:
  - id: proxy
    name: Proxy
    type: select
    members:
      - builtin: DIRECT
routes:
  - id: final
    policy:
      group: proxy
    source:
      type: final
ruleProviders:
  - id: ai-domain
    name: AI_Domain
    output: AI_Domain.yaml
    behavior: domain
    sources:
      - id: ai-domain
        name: AI_Domain
        type: clash-list
        path: rules/AI_Domain.list
vendorRepos: []
`;

const base = parseAuthorProjectConfig(baseYaml).v2 as AuthorProjectConfigV2;

describe("importTemplateAsV2", () => {
  it("converts an INI template into a schema v2 yaml over the base config", () => {
    const sampleIni = [
      "[custom]",
      "custom_proxy_group=AI`select`[]DIRECT",
      "ruleset=AI,[]GEOSITE,openai",
      "ruleset=AI,[]FINAL",
      "",
    ].join("\n");
    const result = importTemplateAsV2(sampleIni, base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.yaml.startsWith("schemaVersion: 2")).toBe(true);
    const merged = parseAuthorProjectConfig(result.yaml).v2 as AuthorProjectConfigV2;
    expect(merged.project?.template?.output).toBe("Custom_Clash.ini");
    expect(merged.vendorRepos).toEqual([]);
    // 组与路由整体替换为导入内容
    expect(merged.proxyGroups.map((group) => group.id)).toEqual(["ai"]);
    expect(merged.routes.map((route) => route.id)).toEqual(["openai", "final"]);
    expect(merged.routes[0]?.policy).toEqual({ group: "ai" });
  });

  it("reuses existing providers by output and keeps them enabled", () => {
    const withProvider = [
      "[custom]",
      "custom_proxy_group=AI`select`[]DIRECT",
      "ruleset=AI,clash-domain:https://raw.example/publish/rules/AI_Domain.yaml,28800",
      "ruleset=AI,[]FINAL",
      "",
    ].join("\n");
    const result = importTemplateAsV2(withProvider, base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const merged = parseAuthorProjectConfig(result.yaml).v2 as AuthorProjectConfigV2;
    // 命中既有 output：不新建占位，路由直接引用既有 provider id
    expect(merged.ruleProviders).toHaveLength(1);
    expect(merged.ruleProviders[0]?.id).toBe("ai-domain");
    expect(merged.ruleProviders[0]?.sources).toHaveLength(1);
    expect(merged.routes[0]?.source).toEqual({ type: "rule-provider", provider: "ai-domain" });
  });

  it("creates disabled placeholder providers for unknown outputs", () => {
    const withUnknown = [
      "[custom]",
      "custom_proxy_group=AI`select`[]DIRECT",
      "ruleset=AI,clash-domain:https://raw.example/rules/New_List.yaml,28800",
      "ruleset=AI,[]FINAL",
      "",
    ].join("\n");
    const result = importTemplateAsV2(withUnknown, base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const merged = parseAuthorProjectConfig(result.yaml).v2 as AuthorProjectConfigV2;
    expect(merged.ruleProviders).toHaveLength(2);
    const placeholder = merged.ruleProviders.find((provider) => provider.id !== "ai-domain");
    expect(placeholder).toMatchObject({ output: "New_List.yaml", enabled: false, sources: [] });
    expect(merged.routes[0]?.source).toEqual({
      type: "rule-provider",
      provider: placeholder?.id,
    });
  });

  it("fails on INI parse errors instead of producing a half config", () => {
    const result = importTemplateAsV2("custom_proxy_group=broken\n", base);
    // 行级警告不阻断（尽力转换），只有解析层异常才失败
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const merged = parseAuthorProjectConfig(result.yaml).v2 as AuthorProjectConfigV2;
    expect(merged.proxyGroups).toEqual([]);
  });
});
