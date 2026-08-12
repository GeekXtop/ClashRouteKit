import { describe, expect, it } from "vitest";
import {
  resolveGeoipNoResolve,
  resolveProxyGroupHealthCheck,
  resolveRuleProviderInterval,
  validateDefaultAwareConfig,
  validateLegacyProjectConfig,
} from "../src/index.js";

describe("project defaults", () => {
  it("resolves item overrides, project defaults and explicit empty values in order", () => {
    const defaults = {
      proxyGroups: {
        healthCheck: {
          url: "https://probe.example/204",
          interval: 600,
          timeout: 5,
        },
        urlTest: { tolerance: 80 },
      },
    };

    expect(
      resolveProxyGroupHealthCheck(
        {
          name: "Auto",
          type: "url-test",
          options: [],
          timeout: null,
          tolerance: 20,
        },
        defaults,
      ),
    ).toEqual({
      url: { value: "https://probe.example/204", source: "project" },
      interval: { value: 600, source: "project" },
      timeout: { value: undefined, source: "empty" },
      tolerance: { value: 20, source: "item" },
    });
  });

  it("keeps legacy fallbacks when the project has no defaults", () => {
    expect(
      resolveProxyGroupHealthCheck({
        name: "Auto",
        type: "url-test",
        options: [],
      }),
    ).toEqual({
      url: { value: "https://cp.cloudflare.com/generate_204", source: "fallback" },
      interval: { value: 300, source: "fallback" },
      timeout: { value: undefined, source: "fallback" },
      tolerance: { value: 50, source: "fallback" },
    });

    expect(
      resolveRuleProviderInterval({
        type: "rule-provider",
        behavior: "domain",
        file: "AI.yaml",
      }),
    ).toEqual({ value: 28800, source: "fallback" });
    expect(resolveGeoipNoResolve({ type: "geoip", value: "cn" })).toEqual({
      value: true,
      source: "fallback",
    });
  });

  it("uses project RuleSet defaults while preserving explicit false and item intervals", () => {
    const defaults = {
      ruleSets: {
        ruleProviderInterval: 600,
        geoipNoResolve: true,
      },
    };

    expect(
      resolveRuleProviderInterval(
        { type: "rule-provider", behavior: "classical", file: "Mixed.yaml" },
        defaults,
      ),
    ).toEqual({ value: 600, source: "project" });
    expect(
      resolveRuleProviderInterval(
        { type: "rule-provider", behavior: "classical", file: "Mixed.yaml", interval: 120 },
        defaults,
      ),
    ).toEqual({ value: 120, source: "item" });
    expect(resolveGeoipNoResolve({ type: "geoip", value: "cn", noResolve: false }, defaults)).toEqual({
      value: false,
      source: "item",
    });
  });

  it("applies project tolerance only to url-test groups", () => {
    const defaults = { proxyGroups: { urlTest: { tolerance: 90 } } };

    expect(
      resolveProxyGroupHealthCheck({ name: "Auto", type: "url-test", options: [] }, defaults).tolerance,
    ).toEqual({ value: 90, source: "project" });
    expect(
      resolveProxyGroupHealthCheck({ name: "Fallback", type: "fallback", options: [] }, defaults).tolerance,
    ).toEqual({ value: 50, source: "fallback" });
  });

  it("reports invalid project defaults and explicit item overrides in config order", () => {
    expect(
      validateDefaultAwareConfig({
        publishBaseUrl: "https://example.com/publish",
        defaults: {
          proxyGroups: {
            healthCheck: { url: "ftp://probe.example", interval: 0, timeout: -1 },
            urlTest: { tolerance: -1 },
          },
          ruleSets: { ruleProviderInterval: 1.5, geoipNoResolve: true },
        },
        customProxyGroups: [
          {
            name: "Auto",
            type: "url-test",
            options: [],
            url: "not-a-url",
            interval: 1.5,
            timeout: 0,
            tolerance: -5,
          },
        ],
        ruleSets: [
          {
            id: "provider",
            policy: "Auto",
            source: {
              type: "rule-provider",
              behavior: "domain",
              file: "AI.yaml",
              interval: 0,
            },
          },
        ],
      }),
    ).toEqual([
      "defaults.proxyGroups.healthCheck.url 必须是 HTTP/HTTPS URL",
      "defaults.proxyGroups.healthCheck.interval 必须为正整数",
      "defaults.proxyGroups.healthCheck.timeout 必须为正整数",
      "defaults.proxyGroups.urlTest.tolerance 必须为非负整数",
      "defaults.ruleSets.ruleProviderInterval 必须为正整数",
      "custom_proxy_group Auto 的 url 必须是 HTTP/HTTPS URL",
      "custom_proxy_group Auto 的 interval 必须为正整数",
      "custom_proxy_group Auto 的 timeout 必须为正整数",
      "custom_proxy_group Auto 的 tolerance 必须为非负整数",
      "RuleSet provider 的 interval 必须为正整数",
    ]);
  });

  it("accepts per-group null timeout and tolerance as explicit empty states", () => {
    expect(
      validateDefaultAwareConfig({
        publishBaseUrl: "https://example.com/publish",
        customProxyGroups: [
          {
            name: "Auto",
            type: "url-test",
            options: [],
            nodeFilters: [".*"],
            timeout: null,
            tolerance: null,
          },
        ],
        ruleSets: [],
      }),
    ).toEqual([]);
  });

  it("exposes default validation as structured diagnostics while keeping legacy messages", () => {
    const config = {
      publishBaseUrl: "https://example.com/publish",
      template: { output: "Custom_Clash.ini" },
      vendorRepos: [],
      defaults: {
        proxyGroups: {
          healthCheck: { url: "ftp://probe.example", interval: 0 },
        },
      },
      customProxyGroups: [
        { name: "Proxy", type: "select" as const, options: ["DIRECT"], timeout: null },
      ],
      ruleSets: [
        { id: "final", policy: "Proxy", source: { type: "final" as const } },
      ],
      ruleProviders: [],
    };

    expect(validateLegacyProjectConfig(config).slice(0, 2)).toEqual([
      {
        code: "defaults.health-check.url",
        severity: "error",
        path: "defaults.proxyGroups.healthCheck.url",
        message: "健康检查 URL 必须是 HTTP/HTTPS URL",
      },
      {
        code: "defaults.health-check.interval",
        severity: "error",
        path: "defaults.proxyGroups.healthCheck.interval",
        message: "健康检查 interval 必须为正整数",
      },
    ]);
    expect(validateDefaultAwareConfig(config)).toEqual([
      "defaults.proxyGroups.healthCheck.url 必须是 HTTP/HTTPS URL",
      "defaults.proxyGroups.healthCheck.interval 必须为正整数",
    ]);
  });
});
