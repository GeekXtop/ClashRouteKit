import { describe, expect, it } from "vitest";
import {
  parseRouteKitConfig,
  serializeRouteKitConfig,
} from "../src/index.js";

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
    expect(() => parseRouteKitConfig("modules: nope\n")).toThrow("Invalid RouteKit project config");
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
    ).toThrow("Invalid RouteKit project config");
  });
});
