import { describe, expect, it } from "vitest";
import {
  ConfigDiagnosticError,
  formatDiagnostic,
  hasDiagnosticErrors,
  type Diagnostic,
} from "../src/index.js";

const diagnostics: Diagnostic[] = [
  {
    code: "provider.empty",
    severity: "warning",
    path: "ruleProviders[0].sources",
    message: "规则源待补全",
  },
  {
    code: "route.policy.missing",
    severity: "error",
    path: "ruleSets[1].policy",
    message: "目标策略组不存在",
    related: ["missing-group"],
  },
];

describe("diagnostics", () => {
  it("treats only error severity as blocking", () => {
    expect(hasDiagnosticErrors(diagnostics.slice(0, 1))).toBe(false);
    expect(hasDiagnosticErrors(diagnostics)).toBe(true);
  });

  it("formats a stable path-aware message", () => {
    expect(formatDiagnostic(diagnostics[1]!)).toBe(
      "[route.policy.missing] ruleSets[1].policy: 目标策略组不存在",
    );
  });

  it("keeps diagnostics on the blocking error", () => {
    const error = new ConfigDiagnosticError(diagnostics);
    expect(error.message).toContain("目标策略组不存在");
    expect(error.diagnostics).toEqual([diagnostics[1]]);
  });
});
