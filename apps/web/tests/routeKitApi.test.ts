import { describe, expect, it } from "vitest";
import { runRouteKitAction } from "../dev/routeKitApi.js";

describe("routeKitApi", () => {
  const baseOptions = {
    root: "E:/repo",
    configFile: "config/modules.yaml",
  };

  it("formats a successful check action", async () => {
    const result = await runRouteKitAction("check", {
      ...baseOptions,
      checkConfig: async () => [],
    });

    expect(result).toEqual({
      action: "check",
      ok: true,
      output: "[check] ok",
    });
  });

  it("returns diagnostics for a failed check action", async () => {
    const result = await runRouteKitAction("check", {
      ...baseOptions,
      checkConfig: async () => ["Module ai references missing policy group: AI"],
    });

    expect(result).toEqual({
      action: "check",
      ok: false,
      output: "[check] Module ai references missing policy group: AI",
    });
  });

  it("summarizes generated output paths and report counts", async () => {
    const result = await runRouteKitAction("generate", {
      ...baseOptions,
      generateOutputs: async () => ({
        templatePath: "E:/repo/output/templates/Custom_Clash.ini",
        rulePaths: ["E:/repo/output/rules/AI_Domain.yaml"],
        reportPath: "E:/repo/output/reports/rule-report.json",
        providers: [
          {
            name: "AI",
            output: "AI_Domain.yaml",
            path: "E:/repo/output/rules/AI_Domain.yaml",
            source: "AI",
            inputRules: 9,
            domainRules: 7,
            outputRules: 6,
            excludedRules: 1,
            sources: [],
          },
        ],
        duplicates: [{ provider: "AI", rules: [{ rule: "DOMAIN,example.com", sources: ["a", "b"] }] }],
        overlaps: [{ rule: "DOMAIN-SUFFIX,example.org", providers: ["AI", "Developer"] }],
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.output).toContain("[generate] template: E:/repo/output/templates/Custom_Clash.ini");
    expect(result.output).toContain("[generate] rules: E:/repo/output/rules/AI_Domain.yaml");
    expect(result.output).toContain("[generate] summary: AI output=6 domain=7 excluded=1");
    expect(result.output).toContain("[generate] duplicates: providers=1 rules=1");
    expect(result.output).toContain("[generate] overlaps: rules=1");
    expect(result.output).toContain("[generate] report: E:/repo/output/reports/rule-report.json");
  });
});
