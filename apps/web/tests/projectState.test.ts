import { describe, expect, it } from "vitest";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import {
  setModuleEnabled,
  toggleModuleEnabled,
} from "../src/projectState.js";

describe("project state helpers", () => {
  const config: RouteKitProjectConfig = {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    proxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
    modules: [
      { id: "developer", policy: "Proxy" },
      { id: "streaming", enabled: false, policy: "Proxy" },
    ],
    final: { policy: "Proxy" },
    ruleProviders: [],
  };

  it("sets module enabled state without mutating the original config", () => {
    const next = setModuleEnabled(config, "developer", false);

    expect(next.modules[0]).toEqual({ id: "developer", enabled: false, policy: "Proxy" });
    expect(config.modules[0]).toEqual({ id: "developer", policy: "Proxy" });
  });

  it("toggles missing enabled flags as enabled by default", () => {
    const next = toggleModuleEnabled(config, "developer");

    expect(next.modules[0]).toEqual({ id: "developer", enabled: false, policy: "Proxy" });
  });

  it("toggles explicit disabled modules to enabled", () => {
    const next = toggleModuleEnabled(config, "streaming");

    expect(next.modules[1]).toEqual({ id: "streaming", enabled: true, policy: "Proxy" });
  });
});
