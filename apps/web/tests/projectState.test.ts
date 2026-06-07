import { describe, expect, it } from "vitest";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import {
  setRuleSetEnabled,
  toggleRuleSetEnabled,
} from "../src/projectState.js";

describe("project state helpers", () => {
  const config: RouteKitProjectConfig = {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
    ruleSets: [
      { id: "developer", policy: "Proxy", source: { type: "geosite", value: "github" } },
      { id: "streaming", enabled: false, policy: "Proxy", source: { type: "geosite", value: "youtube" } },
      { id: "final", policy: "Proxy", source: { type: "final" } },
    ],
    ruleProviders: [],
  };

  it("sets ruleSet enabled state without mutating the original config", () => {
    const next = setRuleSetEnabled(config, "developer", false);

    expect(next.ruleSets[0]).toEqual({
      id: "developer",
      enabled: false,
      policy: "Proxy",
      source: { type: "geosite", value: "github" },
    });
    expect(config.ruleSets[0]).toEqual({ id: "developer", policy: "Proxy", source: { type: "geosite", value: "github" } });
  });

  it("toggles missing enabled flags as enabled by default", () => {
    const next = toggleRuleSetEnabled(config, "developer");

    expect(next.ruleSets[0]).toEqual({
      id: "developer",
      enabled: false,
      policy: "Proxy",
      source: { type: "geosite", value: "github" },
    });
  });

  it("toggles explicit disabled ruleSets to enabled", () => {
    const next = toggleRuleSetEnabled(config, "streaming");

    expect(next.ruleSets[1]).toEqual({
      id: "streaming",
      enabled: true,
      policy: "Proxy",
      source: { type: "geosite", value: "youtube" },
    });
  });
});
