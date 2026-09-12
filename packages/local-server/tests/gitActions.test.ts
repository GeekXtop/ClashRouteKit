import { describe, expect, it } from "vitest";
import {
  readGitRemote,
  runRouteKitAction,
} from "../src/index.js";

describe("routeKitAction (check/generate)", () => {
  const baseOptions = {
    root: "E:/repo",
    configFile: "config/routes.yaml",
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
      diagnostics: [],
    });
  });

  it("returns structured diagnostics from check actions", async () => {
    const diagnostic = {
      code: "workspace.geosite.missing",
      severity: "warning" as const,
      message: "Catalog 中未找到 gfw",
    };
    const result = await runRouteKitAction("check", {
      ...baseOptions,
      checkConfig: async () => [diagnostic],
    });
    expect(result).toMatchObject({ ok: true, diagnostics: [diagnostic] });
    expect(result.output).toContain("[workspace.geosite.missing]");
  });

  it("returns diagnostics for a failed check action", async () => {
    const diagnostic = {
      code: "route.policy.missing",
      severity: "error" as const,
      path: "ruleSets[0].policy",
      message: "RuleSet ai 引用了不存在的 custom_proxy_group：AI",
      related: ["AI"],
    };
    const result = await runRouteKitAction("check", {
      ...baseOptions,
      checkConfig: async () => [diagnostic],
    });

    expect(result).toEqual({
      action: "check",
      ok: false,
      output: "[check] [route.policy.missing] ruleSets[0].policy: RuleSet ai 引用了不存在的 custom_proxy_group：AI",
      diagnostics: [diagnostic],
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
            inputRules: 9,
            outputRules: 6,
            excludedRules: 1,
            sources: [
              { name: "Local", type: "clash-list" as const, inputRules: 9, outputRules: 6 },
            ],
          },
        ],
        duplicates: [{ provider: "AI", rules: [{ rule: "DOMAIN,example.com", sources: ["a", "b"] }] }],
        overlaps: [{ rule: "DOMAIN-SUFFIX,example.org", providers: ["AI", "Developer"] }],
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.output).toContain("[generate] template: E:/repo/output/templates/Custom_Clash.ini");
    expect(result.output).toContain("[generate] rules: E:/repo/output/rules/AI_Domain.yaml");
    expect(result.output).toContain("[generate] summary: AI output=6 excluded=1 sources=[Local:6/9]");
    expect(result.output).toContain("[generate] duplicates: providers=1 rules=1");
    expect(result.output).toContain("[generate] overlaps: rules=1");
    expect(result.output).toContain("[generate] report: E:/repo/output/reports/rule-report.json");
  });
});

describe("git route kit actions", () => {
  const baseOptions = {
    root: "E:/repo",
    configFile: "config/routes.yaml",
  };

  it("runs git status through injected command runner", async () => {
    const result = await runRouteKitAction("git-status", {
      ...baseOptions,
      runCommand: async (command, args, cwd) => {
        expect(command).toBe("git");
        expect(args).toEqual(["status", "--short"]);
        expect(cwd).toBe("E:/repo");
        return " M config/routes.yaml\n";
      },
    });

    expect(result).toEqual({
      action: "git-status",
      ok: true,
      output: " M config/routes.yaml\n",
    });
  });

  it("commits config changes through injected command runner", async () => {
    const commands: string[] = [];
    const result = await runRouteKitAction("git-commit", {
      ...baseOptions,
      checkConfig: async () => [],
      runCommand: async (command, args) => {
        commands.push([command, ...args].join(" "));
        return "";
      },
    });

    expect(commands).toEqual([
      "git add config/modules.yaml config/rules",
      "git commit -m chore: update route config",
    ]);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("[git] committed route config");
    expect(result.diagnostics).toEqual([]);
  });

  it("blocks an independent git commit when check diagnostics contain errors", async () => {
    const commands: string[] = [];
    const diagnostic = {
      code: "route.final.missing",
      severity: "error" as const,
      path: "ruleSets",
      message: "ruleSets 需要包含一条 FINAL 兜底规则",
    };
    const result = await runRouteKitAction("git-commit", {
      ...baseOptions,
      checkConfig: async () => [diagnostic],
      runCommand: async (command, args) => {
        commands.push([command, ...args].join(" "));
        return "committed";
      },
    });

    expect(result).toMatchObject({ action: "git-commit", ok: false, diagnostics: [diagnostic] });
    expect(commands).toEqual([]);
  });

  it("allows an independent git commit when check diagnostics only contain warnings", async () => {
    const commands: string[] = [];
    const diagnostic = {
      code: "workspace.geosite.missing",
      severity: "warning" as const,
      message: "Catalog 中未找到 gfw",
    };
    const result = await runRouteKitAction("git-commit", {
      ...baseOptions,
      checkConfig: async () => [diagnostic],
      runCommand: async (command, args) => {
        commands.push([command, ...args].join(" "));
        return "committed";
      },
    });

    expect(commands).toEqual([
      "git add config/modules.yaml config/rules",
      "git commit -m chore: update route config",
    ]);
    expect(result).toMatchObject({
      action: "git-commit",
      ok: true,
      output: "committed",
      diagnostics: [diagnostic],
    });
  });

  it("blocks an independent git push when check diagnostics contain errors", async () => {
    const commands: string[] = [];
    const diagnostic = {
      code: "route.final.missing",
      severity: "error" as const,
      path: "ruleSets",
      message: "ruleSets 需要包含一条 FINAL 兜底规则",
    };
    const result = await runRouteKitAction("git-push", {
      ...baseOptions,
      checkConfig: async () => [diagnostic],
      runCommand: async (command, args) => {
        commands.push([command, ...args].join(" "));
        return "pushed";
      },
    });

    expect(result).toMatchObject({ action: "git-push", ok: false, diagnostics: [diagnostic] });
    expect(commands).toEqual([]);
  });

  it("allows an independent git push when check diagnostics only contain warnings", async () => {
    const commands: string[] = [];
    const diagnostic = {
      code: "workspace.geosite.missing",
      severity: "warning" as const,
      message: "Catalog 中未找到 gfw",
    };
    const result = await runRouteKitAction("git-push", {
      ...baseOptions,
      checkConfig: async () => [diagnostic],
      runCommand: async (command, args) => {
        commands.push([command, ...args].join(" "));
        return "pushed";
      },
    });

    expect(commands).toEqual(["git push"]);
    expect(result).toMatchObject({
      action: "git-push",
      ok: true,
      output: "pushed",
      diagnostics: [diagnostic],
    });
  });

  it("reads the origin git remote url with a trimmed output", async () => {
    const url = await readGitRemote({
      ...baseOptions,
      runCommand: async (command, args) => {
        expect(command).toBe("git");
        expect(args).toEqual(["remote", "get-url", "origin"]);
        return "git@github.com:acme/routes.git\n";
      },
    });
    expect(url).toBe("git@github.com:acme/routes.git");
  });
});
