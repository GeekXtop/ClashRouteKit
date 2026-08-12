import { describe, expect, it } from "vitest";
import {
  createLegacyProxyGroupGraph,
  validateLegacyProjectConfig,
  type RouteKitProjectConfig,
} from "../src/index.js";

function project(
  patch: Partial<RouteKitProjectConfig> = {},
): RouteKitProjectConfig {
  return {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    customProxyGroups: [
      { name: "Proxy", type: "select", options: ["DIRECT"] },
    ],
    ruleSets: [
      { id: "final", policy: "Proxy", source: { type: "final" } },
    ],
    ruleProviders: [],
    ...patch,
  };
}

describe("validateLegacyProjectConfig", () => {
  it("reports missing group references and group cycles with stable codes", () => {
    const diagnostics = validateLegacyProjectConfig(project({
      customProxyGroups: [
        { name: "A", type: "select", options: ["B"] },
        { name: "B", type: "select", options: ["A", "Missing"] },
      ],
      ruleSets: [
        { id: "missing-policy", policy: "Unknown", source: { type: "geosite", value: "openai" } },
        { id: "final", policy: "A", source: { type: "final" } },
      ],
    }));

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "group.member.missing", severity: "error", related: ["Missing"] }),
      expect.objectContaining({ code: "group.cycle", severity: "error", related: ["A", "B"] }),
      expect.objectContaining({ code: "route.policy.missing", severity: "error", related: ["Unknown"] }),
    ]));
  });

  it("blocks executable empty providers, mrs output, behavior mismatch and URL node filters", () => {
    const diagnostics = validateLegacyProjectConfig(project({
      customProxyGroups: [
        {
          name: "Proxy",
          type: "select",
          options: ["DIRECT"],
          nodeFilters: ["http://wifi.vivo.com.cn/generate_204"],
        },
      ],
      ruleSets: [
        {
          id: "custom",
          policy: "Proxy",
          source: {
            type: "rule-provider",
            behavior: "classical",
            file: "Custom.mrs",
          },
        },
        { id: "final-a", policy: "Proxy", source: { type: "final" } },
        { id: "final-b", policy: "DIRECT", source: { type: "final" } },
      ],
      ruleProviders: [
        {
          name: "Custom",
          output: "Custom.mrs",
          behavior: "domain",
          sources: [],
        },
      ],
    }));

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      "group.node-filter.url",
      "provider.sources.empty",
      "provider.output.unsupported",
      "route.provider.behavior-mismatch",
      "route.final.multiple",
    ]));
  });

  it("keeps disabled unresolved imports as warnings and excludes disabled routes from FINAL counts", () => {
    const diagnostics = validateLegacyProjectConfig(project({
      ruleSets: [
        {
          id: "disabled-provider-route",
          enabled: false,
          policy: "Proxy",
          source: { type: "rule-provider", behavior: "domain", file: "Legacy.mrs" },
        },
        { id: "final", policy: "Proxy", source: { type: "final" } },
      ],
      ruleProviders: [
        {
          name: "Legacy",
          output: "Legacy.mrs",
          behavior: "domain",
          enabled: false,
          sources: [],
        },
      ],
    }));

    expect(diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "provider.sources.disabled-empty",
      "provider.output.disabled-unsupported",
    ]);
  });

  it("does not block disabled providers with an empty output placeholder", () => {
    const diagnostics = validateLegacyProjectConfig(project({
      ruleProviders: [
        {
          name: "Draft",
          output: "",
          behavior: "domain",
          enabled: false,
          sources: [],
        },
      ],
    }));

    expect(diagnostics.map(({ code, severity }) => ({ code, severity }))).toEqual([
      { code: "provider.sources.disabled-empty", severity: "warning" },
      { code: "provider.output.disabled-unsupported", severity: "warning" },
    ]);
  });

  it("reports invalid regular expressions without throwing", () => {
    const diagnostics = validateLegacyProjectConfig(project({
      customProxyGroups: [
        { name: "Proxy", type: "select", options: [], nodeFilters: ["("] },
      ],
    }));
    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: "group.node-filter.regex",
      severity: "error",
    }));
  });

  it("builds a proxy-group-only graph in config order", () => {
    expect(createLegacyProxyGroupGraph([
      { name: "Proxy", type: "select", options: ["Auto", "DIRECT", "Missing"] },
      { name: "Auto", type: "url-test", options: ["Proxy"], nodeFilters: [".*"] },
    ])).toEqual({
      Proxy: ["Auto"],
      Auto: ["Proxy"],
    });
  });

  it("orders default, duplicate, group, cycle, provider, route and FINAL diagnostics", () => {
    const diagnostics = validateLegacyProjectConfig(project({
      defaults: {
        proxyGroups: { healthCheck: { interval: 0 } },
      },
      customProxyGroups: [
        { name: "A", type: "select", options: ["B", "Missing"] },
        { name: "B", type: "select", options: ["A"] },
        { name: "C", type: "select", options: ["DIRECT"] },
        { name: "C", type: "select", options: ["DIRECT"] },
      ],
      ruleProviders: [
        { name: "P", output: "P.mrs", behavior: "domain", sources: [] },
        { name: "P", output: "P.mrs", behavior: "domain", sources: [] },
      ],
      ruleSets: [
        { id: "route", policy: "Unknown", source: { type: "geosite", value: "openai" } },
        { id: "route", policy: "A", source: { type: "final" } },
        { id: "final-2", policy: "A", source: { type: "final" } },
      ],
    }));

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "defaults.health-check.interval",
      "group.name.duplicate",
      "route.id.duplicate",
      "provider.name.duplicate",
      "provider.output.duplicate",
      "group.member.missing",
      "group.cycle",
      "provider.sources.empty",
      "provider.output.unsupported",
      "provider.sources.empty",
      "provider.output.unsupported",
      "route.policy.missing",
      "route.final.multiple",
    ]);
  });

  it("reports empty entities and node filters at their exact paths", () => {
    const diagnostics = validateLegacyProjectConfig(project({
      customProxyGroups: [
        { name: "", type: "select", options: [], nodeFilters: ["  "] },
      ],
      ruleSets: [
        { id: "", policy: "", source: { type: "geosite", value: "" } },
      ],
      ruleProviders: [
        {
          name: "",
          output: "",
          behavior: "domain",
          sources: [],
        },
      ],
    }));

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "group.name.empty", path: "customProxyGroups[0].name" }),
      expect.objectContaining({ code: "group.members.empty", path: "customProxyGroups[0]" }),
      expect.objectContaining({ code: "group.node-filter.empty", path: "customProxyGroups[0].nodeFilters[0]" }),
      expect.objectContaining({ code: "provider.name.empty", path: "ruleProviders[0].name" }),
      expect.objectContaining({ code: "provider.output.empty", path: "ruleProviders[0].output" }),
      expect.objectContaining({ code: "route.id.empty", path: "ruleSets[0].id" }),
      expect.objectContaining({ code: "route.policy.empty", path: "ruleSets[0].policy" }),
      expect.objectContaining({ code: "route.geosite.empty", path: "ruleSets[0].source.value" }),
      expect.objectContaining({ code: "route.final.missing", path: "ruleSets" }),
    ]));
  });

  it("reports provider source emptiness and unsafe project paths", () => {
    const diagnostics = validateLegacyProjectConfig(project({
      ruleProviders: [
        {
          name: "Unsafe",
          output: "Unsafe.yaml",
          behavior: "domain",
          sources: [
            {
              name: "",
              type: "clash-list",
              basePath: "C:\\vendor",
              path: "../secret.list",
            },
            {
              name: "DLC",
              type: "domain-list-community",
              entry: "",
            },
          ],
        },
      ],
    }));

    expect(diagnostics.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "provider.source.name-empty", path: "ruleProviders[0].sources[0].name" },
      { code: "provider.source.path-unsafe", path: "ruleProviders[0].sources[0].basePath" },
      { code: "provider.source.path-unsafe", path: "ruleProviders[0].sources[0].value" },
      { code: "provider.source.value-empty", path: "ruleProviders[0].sources[1].entry" },
    ]);
  });

  it("resolves enabled provider routes by output and validates state and behavior", () => {
    const diagnostics = validateLegacyProjectConfig(project({
      ruleProviders: [
        {
          name: "Disabled",
          output: "Disabled.yaml",
          behavior: "domain",
          enabled: false,
          sources: [{ name: "Source", type: "clash-list", path: "config/rules/source.list" }],
        },
        {
          name: "Classical",
          output: "Classical.yaml",
          behavior: "classical",
          sources: [{ name: "Source", type: "clash-list", path: "config/rules/source.list" }],
        },
      ],
      ruleSets: [
        {
          id: "missing",
          policy: "Proxy",
          source: { type: "rule-provider", behavior: "domain", file: "Missing.yaml" },
        },
        {
          id: "disabled",
          policy: "Proxy",
          source: { type: "rule-provider", behavior: "domain", file: "Disabled.yaml" },
        },
        {
          id: "mismatch",
          policy: "Proxy",
          source: { type: "rule-provider", behavior: "domain", file: "Classical.yaml" },
        },
        { id: "final", policy: "Proxy", source: { type: "final" } },
      ],
    }));

    expect(diagnostics.map(({ code, related }) => ({ code, related }))).toEqual([
      { code: "route.provider.missing", related: ["Missing.yaml"] },
      { code: "route.provider.disabled", related: ["Disabled.yaml"] },
      { code: "route.provider.behavior-mismatch", related: ["Classical.yaml"] },
    ]);
  });

  it("does not resolve an enabled provider route with an empty output file", () => {
    const diagnostics = validateLegacyProjectConfig(project({
      ruleProviders: [
        { name: "Blank", output: "", behavior: "domain", sources: [] },
      ],
      ruleSets: [
        {
          id: "blank-route",
          policy: "Proxy",
          source: { type: "rule-provider", behavior: "domain", file: "" },
        },
        { id: "final", policy: "Proxy", source: { type: "final" } },
      ],
    }));

    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: "route.provider.missing",
      path: "ruleSets[0].source.file",
      related: [""],
    }));
  });
});
