import { describe, expect, it } from "vitest";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { importTemplateAsV2 } from "../src/features/project/importToV2.js";

const sampleIni = [
  "[custom]",
  "ruleset=Final,🎯 全球直连",
  "custom_proxy_group=🎯 全球直连`select`DIRECT",
  "",
].join("\n");

const base = {
  publishBaseUrl: "http://127.0.0.1:8787",
  template: { output: "Custom_Clash.ini" },
  vendorRepos: [],
  customProxyGroups: [],
  ruleSets: [],
  ruleProviders: [],
} as unknown as RouteKitProjectConfig;

describe("importTemplateAsV2", () => {
  it("converts an INI template into a schema v2 yaml over the base config", () => {
    const result = importTemplateAsV2(sampleIni, base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.yaml.startsWith("schemaVersion: 2")).toBe(true);
    expect(result.yaml).toContain("proxyGroups:");
    expect(result.yaml).toContain("routes:");
  });

  it("keeps provider references importable as disabled drafts", () => {
    const withProvider = [
      "[custom]",
      "ruleset=Custom,🎯 全球直连",
      "custom_proxy_group=🎯 全球直连`select`DIRECT",
      "",
    ].join("\n");
    const result = importTemplateAsV2(withProvider, base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.yaml).toContain("ruleProviders:");
  });

  it("tolerates non-INI text by producing an empty v2 config (parser is line-based)", () => {
    const result = importTemplateAsV2("not an ini", base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.yaml.startsWith("schemaVersion: 2")).toBe(true);
  });
});
