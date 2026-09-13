import { describe, expect, it } from "vitest";
import { validateLegacyProjectConfig } from "@clash-route-kit/core";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import {
  createBlankProjectConfig,
  detectSchemaVersion,
  isEmptyProjectConfig,
} from "../src/features/project/projectMeta.js";

describe("projectMeta", () => {
  it("detects schema version from the document top-level key", () => {
    expect(detectSchemaVersion("publishBaseUrl: http://127.0.0.1:8787\n")).toBe(1);
    expect(detectSchemaVersion("schemaVersion: 2\nproject:\n  template:\n    output: a.ini\n")).toBe(2);
    expect(detectSchemaVersion("schemaVersion: 1\n")).toBe(1);
  });

  it("treats a config without routes, groups, and providers as empty", () => {
    const empty: RouteKitProjectConfig = {
      publishBaseUrl: "http://127.0.0.1:8787",
      template: { output: "Custom_Clash.ini" },
      vendorRepos: [],
      customProxyGroups: [],
      ruleSets: [],
      ruleProviders: [],
    };
    expect(isEmptyProjectConfig(empty)).toBe(true);
    expect(isEmptyProjectConfig(createBlankProjectConfig())).toBe(false);
  });

  it("creates a blank project config that passes legacy validation without errors", () => {
    const blank = createBlankProjectConfig();
    const errors = validateLegacyProjectConfig(blank).filter((d) => d.severity === "error");
    expect(errors).toEqual([]);
  });
});
