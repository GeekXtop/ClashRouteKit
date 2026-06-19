import { describe, expect, it } from "vitest";
import path from "node:path";
import type { RouteKitProjectConfig, VendorRepoConfig } from "@clash-route-kit/core";
import {
  addProjectVendorRepo,
  catalogOriginsFromConfig,
  listCatalogEntries,
  listCatalogSources,
  listProjectRuleFiles,
  normalizeVendorRepoInput,
  readCatalogEntry,
  readCatalogEntryDomains,
  readCatalogTemplate,
  readGitRemote,
  readProjectConfigFile,
  readProjectRuleFile,
  removeProjectVendorRepo,
  runRouteKitAction,
  updateProjectVendorRepo,
  writeProjectConfigFile,
  writeProjectRuleFile,
} from "../src/serveApi.js";

function projectConfig(overrides: Partial<RouteKitProjectConfig> = {}): RouteKitProjectConfig {
  return {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    customProxyGroups: [],
    ruleSets: [],
    ...overrides,
  };
}

describe("catalogOriginsFromConfig", () => {
  it("derives catalog origins from vendorRepos catalog meta", () => {
    const origins = catalogOriginsFromConfig(
      projectConfig({
        vendorRepos: [
          { name: "dlc", url: "u", path: "p", catalog: { dir: "vendor/dlc/data", kind: "domain-list" } },
          { name: "Custom", url: "u2", path: "p2", catalog: { dir: "vendor/c/rules", kind: "list-dir" } },
          { name: "NoBrowse", url: "u3", path: "p3" },
        ],
      }),
    );
    expect(origins.map((origin) => origin.id)).toEqual(["dlc", "Custom"]);
    expect(origins[1]).toEqual({ id: "Custom", label: "Custom", kind: "list-dir", dir: "vendor/c/rules" });
  });

  it("falls back to builtin origins when no vendorRepo declares catalog meta", () => {
    expect(catalogOriginsFromConfig(projectConfig()).map((origin) => origin.id)).toContain("dler-io");
  });
});

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

  it("expands a catalog entry's includes into a domain rule list", async () => {
    const files: Record<string, string> = {
      "category-ai-!cn": "include:openai\nxai.com\n",
      openai: "openai.com\nfull:chatgpt.com\n",
    };
    const domains = await readCatalogEntryDomains({
      ...baseOptions,
      origin: "domain-list-community",
      name: "category-ai-!cn",
      readText: async (filePath: string) => {
        const name = filePath.split(/[\\/]/).pop() ?? "";
        const content = files[name];
        if (content === undefined) throw new Error(`missing ${name}`);
        return content;
      },
    });
    expect(domains).toContain("DOMAIN-SUFFIX,xai.com");
    expect(domains).toContain("DOMAIN-SUFFIX,openai.com");
    expect(domains).toContain("DOMAIN,chatgpt.com");
  });

  it("lists list-dir entries by stripping the .list suffix", async () => {
    const entries = await listCatalogEntries({
      ...baseOptions,
      origin: "ACL4SSR",
      readDirectory: async () => ["BanAD.list", "Apple.list", "README.md", "Providers"],
    });
    expect(entries).toEqual(["Apple", "BanAD"]);
  });

  it("lists and reads provider-yaml entries with spaces from the payload", async () => {
    const entries = await listCatalogEntries({
      ...baseOptions,
      origin: "dler-io",
      readDirectory: async () => ["AI Suite.yaml", "Crypto.yaml", "README.md"],
    });
    expect(entries).toEqual(["AI Suite", "Crypto"]);

    const domains = await readCatalogEntryDomains({
      ...baseOptions,
      origin: "dler-io",
      name: "AI Suite",
      readText: async () => "payload:\n  - DOMAIN-SUFFIX,openai.com\n  - DOMAIN,chatgpt.com\n  # comment\n",
    });
    expect(domains).toEqual(["DOMAIN-SUFFIX,openai.com", "DOMAIN,chatgpt.com"]);
  });

  it("lists catalog sources with counts, kinds and sync time", async () => {
    const sources = await listCatalogSources({
      ...baseOptions,
      readDirectory: async (dir: string) => {
        if (dir.includes("domain-list-community")) return ["openai", "steam", "README.md"];
        if (dir.includes("ACL4SSR")) return ["BanAD.list", "x.list"];
        if (dir.includes("rules")) return ["AI.list"];
        return [];
      },
      statMtime: async () => 1_700_000_000_000,
    });
    const byId = Object.fromEntries(sources.map((source) => [source.id, source]));
    expect(byId["domain-list-community"]!.count).toBe(2);
    expect(byId["domain-list-community"]!.kind).toBe("upstream");
    expect(byId["domain-list-community"]!.syncedAt).toBe(1_700_000_000_000);
    expect(byId["ACL4SSR"]!.count).toBe(2);
    expect(byId["local"]!.kind).toBe("local");
    expect(byId["local"]!.count).toBe(1);
  });

  it("lists and reads ini-template entries", async () => {
    const origins = [{ id: "tpl", label: "tpl", kind: "ini-template" as const, dir: "vendor/tpl" }];
    const entries = await listCatalogEntries({
      ...baseOptions,
      origin: "tpl",
      origins,
      readDirectory: async () => ["ACL4SSR_Online.ini", "README.md"],
    });
    expect(entries).toEqual(["ACL4SSR_Online"]);

    const template = await readCatalogTemplate({
      ...baseOptions,
      origin: "tpl",
      name: "ACL4SSR_Online",
      origins,
      readText: async () => "[custom]\nruleset=DIRECT,[]GEOSITE,private\n",
    });
    expect(template.name).toBe("ACL4SSR_Online");
    expect(template.ini).toContain("[custom]");
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
    expect(typeof result.mtime).toBe("number");
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

describe("vendor repo mutations over project config", () => {
  const root = path.resolve("fixture-repo");
  const configFile = "config/routes.yaml";
  const yamlWith = (repos: string) =>
    [
      "publishBaseUrl: http://127.0.0.1:8787",
      "template:",
      "  output: Custom_Clash.ini",
      repos,
      "customProxyGroups: []",
      "ruleSets: []",
      "",
    ].join("\n");

  it("normalizes input into a full repo with derived path and catalog dir", () => {
    const repo = normalizeVendorRepoInput({
      name: "GeekX",
      url: "https://x.git",
      branch: "main",
      catalog: { reldir: "rule", kind: "list-dir" },
    });
    expect(repo).toEqual<VendorRepoConfig>({
      name: "GeekX",
      url: "https://x.git",
      path: "vendor/GeekX",
      branch: "main",
      catalog: { dir: "vendor/GeekX/rule", kind: "list-dir" },
    });
  });

  it("omits branch and catalog when not provided", () => {
    const repo = normalizeVendorRepoInput({ name: "Bare", url: "https://x.git" });
    expect(repo).toEqual<VendorRepoConfig>({ name: "Bare", url: "https://x.git", path: "vendor/Bare" });
  });

  it("adds a repo by writing the serialized config", async () => {
    let written = "";
    const result = await addProjectVendorRepo({
      root,
      configFile,
      input: { name: "GeekX", url: "https://x.git", catalog: { reldir: "rule", kind: "list-dir" } },
      readText: async () => yamlWith("vendorRepos: []"),
      writeText: async (_p, text) => {
        written = text;
      },
    });
    expect(result.config.vendorRepos.at(-1)?.name).toBe("GeekX");
    expect(result.config.vendorRepos.at(-1)?.catalog?.dir).toBe("vendor/GeekX/rule");
    expect(written).toContain("GeekX");
  });

  it("updates an existing repo url", async () => {
    const result = await updateProjectVendorRepo({
      root,
      configFile,
      name: "Custom",
      input: { name: "Custom", url: "https://github.com/GeekXtop/Custom_OpenClash_Rules.git", branch: "main", catalog: { reldir: "rule", kind: "list-dir" } },
      readText: async () =>
        yamlWith(
          ["vendorRepos:", "  - name: Custom", "    url: https://old.git", "    path: vendor/Custom"].join("\n"),
        ),
      writeText: async () => {},
    });
    expect(result.config.vendorRepos[0]?.url).toBe("https://github.com/GeekXtop/Custom_OpenClash_Rules.git");
    expect(result.config.vendorRepos[0]?.catalog?.dir).toBe("vendor/Custom/rule");
  });

  it("removes a repo by name", async () => {
    const result = await removeProjectVendorRepo({
      root,
      configFile,
      name: "Custom",
      readText: async () =>
        yamlWith(["vendorRepos:", "  - name: Custom", "    url: x", "    path: vendor/Custom"].join("\n")),
      writeText: async () => {},
    });
    expect(result.config.vendorRepos).toHaveLength(0);
  });
});
