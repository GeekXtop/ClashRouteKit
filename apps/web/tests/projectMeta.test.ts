import { describe, expect, it } from "vitest";
import YAML from "yaml";
import {
  normalizeAuthorProjectConfig,
  parseAuthorProjectConfig,
  validateNormalizedProject,
} from "@clash-route-kit/core";
import {
  createBlankProjectConfigV2,
  detectSchemaVersion,
  isEmptyProjectConfig,
} from "../src/features/project/projectMeta.js";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";

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
    expect(isEmptyProjectConfig({ ...empty, ruleSets: [{ id: "x", policy: "DIRECT", source: { type: "final" } }] })).toBe(false);
  });

  it("creates a blank v2 project that parses, normalizes, and validates without errors", () => {
    const blank = createBlankProjectConfigV2();
    expect(blank.schemaVersion).toBe(2);
    const parsed = parseAuthorProjectConfig(YAML.stringify(blank));
    expect(parsed.v2).toBeDefined();
    const normalized = normalizeAuthorProjectConfig(parsed.v2!);
    const errors = [
      ...normalized.diagnostics,
      ...validateNormalizedProject(normalized.project),
    ].filter((d) => d.severity === "error");
    expect(errors).toEqual([]);
    expect(detectSchemaVersion(YAML.stringify(blank))).toBe(2);
  });

  it("blank final route targets builtin DIRECT", () => {
    const blank = createBlankProjectConfigV2();
    expect(blank.routes[0]).toEqual({
      id: "final",
      policy: { builtin: "DIRECT" },
      source: { type: "final" },
    });
  });
});
