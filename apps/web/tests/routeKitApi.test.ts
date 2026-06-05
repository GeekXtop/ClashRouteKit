import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  readProjectConfigFile,
  runRouteKitAction,
  writeProjectConfigFile,
} from "../dev/routeKitApi.js";

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

describe("project config file helpers", () => {
  const root = path.resolve("fixture-repo");
  const configFile = "config/modules.yaml";
  const configPath = path.resolve(root, configFile);
  const configYaml = [
    "publishBaseUrl: http://127.0.0.1:8787",
    "template:",
    "  output: Custom_Clash.ini",
    "vendorRepos: []",
    "proxyGroups:",
    "  - name: Proxy",
    "    type: select",
    "    options:",
    "      - DIRECT",
    "modules:",
    "  - id: ai",
    "    policy: Proxy",
    "final:",
    "  policy: Proxy",
    "ruleProviders: []",
    "",
  ].join("\n");

  it("reads and parses config/modules.yaml", async () => {
    const result = await readProjectConfigFile({
      root,
      configFile,
      readText: async (filePath) => {
        expect(filePath).toBe(configPath);
        return configYaml;
      },
    });

    expect(result.yaml).toBe(configYaml);
    expect(result.config.modules[0]?.id).toBe("ai");
  });

  it("serializes and writes config/modules.yaml", async () => {
    const writes: Array<{ filePath: string; text: string }> = [];
    const result = await writeProjectConfigFile({
      root,
      configFile,
      config: {
        publishBaseUrl: "http://127.0.0.1:8787",
        template: { output: "Custom_Clash.ini" },
        vendorRepos: [],
        proxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
        modules: [{ id: "ai", policy: "Proxy" }],
        final: { policy: "Proxy" },
        ruleProviders: [],
      },
      writeText: async (filePath, text) => {
        writes.push({ filePath, text });
      },
    });

    expect(writes[0]?.filePath).toBe(configPath);
    expect(writes[0]?.text).toContain("modules:");
    expect(result.config.modules[0]?.id).toBe("ai");
  });
});

describe("git route kit actions", () => {
  const baseOptions = {
    root: "E:/repo",
    configFile: "config/modules.yaml",
  };

  it("runs git status through injected command runner", async () => {
    const result = await runRouteKitAction("git-status", {
      ...baseOptions,
      runCommand: async (command, args, cwd) => {
        expect(command).toBe("git");
        expect(args).toEqual(["status", "--short"]);
        expect(cwd).toBe("E:/repo");
        return " M config/modules.yaml\n";
      },
    });

    expect(result).toEqual({
      action: "git-status",
      ok: true,
      output: " M config/modules.yaml\n",
    });
  });

  it("commits config changes through injected command runner", async () => {
    const commands: string[] = [];
    const result = await runRouteKitAction("git-commit", {
      ...baseOptions,
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
  });
});
