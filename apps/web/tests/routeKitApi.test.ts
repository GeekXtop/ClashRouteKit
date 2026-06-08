import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  listCatalogEntries,
  listProjectRuleFiles,
  readCatalogEntry,
  readProjectConfigFile,
  readProjectRuleFile,
  runRouteKitAction,
  writeProjectConfigFile,
  writeProjectRuleFile,
} from "../dev/routeKitApi.js";

describe("routeKitApi", () => {
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
    });
  });

  it("returns diagnostics for a failed check action", async () => {
    const result = await runRouteKitAction("check", {
      ...baseOptions,
      checkConfig: async () => ["RuleSet ai references missing custom_proxy_group: AI"],
    });

    expect(result).toEqual({
      action: "check",
      ok: false,
      output: "[check] RuleSet ai references missing custom_proxy_group: AI",
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
  const configFile = "config/routes.yaml";
  const configPath = path.resolve(root, configFile);
  const configYaml = [
    "publishBaseUrl: http://127.0.0.1:8787",
    "template:",
    "  output: Custom_Clash.ini",
    "vendorRepos: []",
    "customProxyGroups:",
    "  - name: Proxy",
    "    type: select",
    "    options:",
    "      - DIRECT",
    "ruleSets:",
    "  - id: ai-geosite-openai",
    "    policy: Proxy",
    "    source:",
    "      type: geosite",
    "      value: openai",
    "  - id: final",
    "    policy: Proxy",
    "    source:",
    "      type: final",
    "ruleProviders: []",
    "",
  ].join("\n");

  it("reads and parses config/routes.yaml", async () => {
    const result = await readProjectConfigFile({
      root,
      configFile,
      readText: async (filePath) => {
        expect(filePath).toBe(configPath);
        return configYaml;
      },
    });

    expect(result.yaml).toBe(configYaml);
    expect(result.config.ruleSets[0]?.id).toBe("ai-geosite-openai");
  });

  it("serializes and writes config/routes.yaml", async () => {
    const writes: Array<{ filePath: string; text: string }> = [];
    const result = await writeProjectConfigFile({
      root,
      configFile,
      config: {
        publishBaseUrl: "http://127.0.0.1:8787",
        template: { output: "Custom_Clash.ini" },
        vendorRepos: [],
        customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
        ruleSets: [
          { id: "ai-geosite-openai", policy: "Proxy", source: { type: "geosite", value: "openai" } },
          { id: "final", policy: "Proxy", source: { type: "final" } },
        ],
        ruleProviders: [],
      },
      writeText: async (filePath, text) => {
        writes.push({ filePath, text });
      },
    });

    expect(writes[0]?.filePath).toBe(configPath);
    expect(writes[0]?.text).toContain("ruleSets:");
    expect(result.config.ruleSets[0]?.id).toBe("ai-geosite-openai");
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
      runCommand: async (command, args) => {
        commands.push([command, ...args].join(" "));
        return "";
      },
    });

    expect(commands).toEqual([
      "git add config/routes.yaml config/rules",
      "git commit -m chore: update route config",
    ]);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("[git] committed route config");
  });
});

describe("project rule file helpers", () => {
  const root = path.resolve("fixture-repo");

  it("lists only .list files under config/rules", async () => {
    const files = await listProjectRuleFiles({
      root,
      configFile: "config/routes.yaml",
      readDirectory: async (directory) => {
        expect(directory).toBe(path.resolve(root, "config/rules"));
        return ["AI.list", "README.md", "Custom.list"];
      },
    });

    expect(files).toEqual(["AI.list", "Custom.list"]);
  });

  it("reads and writes rule files under config/rules", async () => {
    const reads: string[] = [];
    const writes: Array<{ filePath: string; text: string }> = [];
    const read = await readProjectRuleFile({
      root,
      configFile: "config/routes.yaml",
      file: "AI.list",
      readText: async (filePath) => {
        reads.push(filePath);
        return "DOMAIN,openai.com\n";
      },
    });
    const write = await writeProjectRuleFile({
      root,
      configFile: "config/routes.yaml",
      file: "AI.list",
      text: "DOMAIN,openai.com\n",
      writeText: async (filePath, text) => {
        writes.push({ filePath, text });
      },
    });

    expect(read).toEqual({ file: "AI.list", text: "DOMAIN,openai.com\n" });
    expect(write).toEqual({ file: "AI.list", text: "DOMAIN,openai.com\n" });
    expect(reads[0]).toBe(path.resolve(root, "config/rules/AI.list"));
    expect(writes[0]).toEqual({
      filePath: path.resolve(root, "config/rules/AI.list"),
      text: "DOMAIN,openai.com\n",
    });
  });

  it("rejects path traversal and non-list rule files", async () => {
    await expect(readProjectRuleFile({
      root,
      configFile: "config/routes.yaml",
      file: "../routes.yaml",
      readText: async () => "",
    })).rejects.toThrow("Invalid rule file");

    await expect(writeProjectRuleFile({
      root,
      configFile: "config/routes.yaml",
      file: "AI.yaml",
      text: "",
      writeText: async () => {},
    })).rejects.toThrow("Invalid rule file");
  });
});

describe("catalog browse helpers", () => {
  const root = path.resolve("fixture-repo");

  it("lists geosite catalog entries from a data directory", async () => {
    const entries = await listCatalogEntries({
      root,
      configFile: "config/routes.yaml",
      origin: "domain-list-community",
      readDirectory: async (directory) => {
        expect(directory).toBe(path.resolve(root, "vendor/domain-list-community/data"));
        return ["openai", "category-ai-!cn", "README.md"];
      },
    });

    expect(entries).toContain("openai");
    expect(entries).toContain("category-ai-!cn");
    expect(entries).not.toContain("README.md");
  });

  it("reads a geosite entry includes and rule count", async () => {
    const detail = await readCatalogEntry({
      root,
      configFile: "config/routes.yaml",
      origin: "domain-list-community",
      name: "category-ai-!cn",
      readText: async () => "include:openai\ninclude:anthropic\nxai.com\n",
    });

    expect(detail.name).toBe("category-ai-!cn");
    expect(detail.includes).toEqual(["openai", "anthropic"]);
    expect(detail.ruleCount).toBe(1);
  });
});
