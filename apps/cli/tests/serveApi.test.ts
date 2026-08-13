import { describe, expect, it } from "vitest";
import path from "node:path";
import type { RouteKitProjectConfig, VendorRepoConfig } from "@clash-route-kit/core";
import {
  addProjectVendorRepo,
  catalogOriginsFromConfig,
  clearCatalogIndexCache,
  findCatalogPath,
  listCatalogEntries,
  listCatalogEntriesWithMeta,
  listCatalogSources,
  listProjectRuleFiles,
  normalizeVendorRepoInput,
  readCatalogEntry,
  readCatalogEntryDomains,
  readCatalogTemplate,
  readGitRemote,
  readProjectConfigFile,
  readProjectRuleFile,
  deleteProjectRuleFile,
  removeProjectVendorRepo,
  runRouteKitAction,
  searchCatalog,
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

  it("emits an extra ini-template origin for a repo's templateDir", () => {
    const origins = catalogOriginsFromConfig(
      projectConfig({
        vendorRepos: [
          {
            name: "ACL4SSR",
            url: "u",
            path: "p",
            catalog: { dir: "vendor/ACL4SSR/Clash", kind: "list-dir" },
            templateDir: "vendor/ACL4SSR/Clash/config",
          },
        ],
      }),
    );
    expect(origins).toEqual([
      { id: "ACL4SSR", label: "ACL4SSR", kind: "list-dir", dir: "vendor/ACL4SSR/Clash" },
      { id: "ACL4SSR::templates", label: "ACL4SSR · 模板", kind: "ini-template", dir: "vendor/ACL4SSR/Clash/config" },
    ]);
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
              { name: "Local", type: "clash-list", inputRules: 9, outputRules: 6 },
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

  it("rejects project saves with Core errors before writing", async () => {
    const writes: string[] = [];
    await expect(writeProjectConfigFile({
      root: "E:/repo",
      configFile: "config/routes.yaml",
      config: projectConfig({
        customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
        ruleSets: [{ id: "bad", policy: "Missing", source: { type: "final" } }],
      }),
      writeText: async (filePath) => { writes.push(filePath); },
    })).rejects.toMatchObject({ name: "ConfigDiagnosticError" });
    expect(writes).toEqual([]);
  });

  it("saves project configs that only have warnings", async () => {
    const writes: string[] = [];
    const result = await writeProjectConfigFile({
      root: "E:/repo",
      configFile: "config/routes.yaml",
      config: projectConfig({
        customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
        ruleSets: [{ id: "final", policy: "Proxy", source: { type: "final" } }],
        ruleProviders: [{
          name: "Placeholder",
          output: "Placeholder.mrs",
          behavior: "domain",
          enabled: false,
          sources: [],
        }],
      }),
      writeText: async (filePath) => { writes.push(filePath); },
    });

    expect(writes).toEqual([path.resolve("E:/repo", "config/routes.yaml")]);
    expect(result.config.ruleProviders?.[0]?.enabled).toBe(false);
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
      "git add config/routes.yaml config/rules",
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
      "git add config/routes.yaml config/rules",
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

  it("deletes rule files under config/rules", async () => {
    const removed: string[] = [];
    const result = await deleteProjectRuleFile({
      root,
      configFile: "config/routes.yaml",
      file: "AI.list",
      removePath: async (filePath) => {
        removed.push(filePath);
      },
    });

    expect(result).toEqual({ file: "AI.list" });
    expect(removed).toEqual([path.resolve(root, "config/rules/AI.list")]);
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

    await expect(deleteProjectRuleFile({
      root,
      configFile: "config/routes.yaml",
      file: "../routes.yaml",
      removePath: async () => {},
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

describe("catalog search (name + own-domain reverse lookup)", () => {
  const root = path.resolve("fixture-repo");
  const files: Record<string, string> = {
    openai: "openai.com\nfull:api.openai.com\n",
    "category-ai-!cn": "include:openai\nxai.com\n",
    google: "domain:google.com\n",
  };
  const base = {
    root,
    configFile: "config/routes.yaml",
    origin: "domain-list-community",
    readDirectory: async () => Object.keys(files),
    readText: async (filePath: string) => {
      const name = path.basename(filePath);
      if (!(name in files)) throw new Error(`missing ${name}`);
      return files[name]!;
    },
  };

  it("matches an owned domain without expanding includes", async () => {
    const hits = await searchCatalog({ ...base, query: "openai.com", cache: new Map() });
    // category-ai-!cn only `include:openai` — it does not own the domain, so it is not a hit
    expect(hits.map((hit) => hit.name)).toEqual(["openai"]);
    expect(hits[0]?.matchedDomains).toContain("openai.com");
  });

  it("matches by entry name as well as domain", async () => {
    const hits = await searchCatalog({ ...base, query: "google", cache: new Map() });
    expect(hits.map((hit) => hit.name)).toEqual(["google"]);
  });

  it("caps results at the given limit", async () => {
    const hits = await searchCatalog({ ...base, query: ".com", limit: 2, cache: new Map() });
    expect(hits).toHaveLength(2);
  });

  it("caches the index and rebuilds after clearCatalogIndexCache", async () => {
    let reads = 0;
    const opts = {
      root,
      configFile: "config/routes.yaml",
      origin: "search-cache-test",
      origins: [{ id: "search-cache-test", label: "t", kind: "domain-list" as const, dir: "vendor/t/data" }],
      readDirectory: async () => Object.keys(files),
      readText: async (filePath: string) => {
        reads += 1;
        return files[path.basename(filePath)] ?? "";
      },
    };
    clearCatalogIndexCache();
    await searchCatalog({ ...opts, query: "openai" });
    const afterFirst = reads;
    await searchCatalog({ ...opts, query: "google" });
    expect(reads).toBe(afterFirst); // served from the in-memory index, no re-read
    clearCatalogIndexCache();
    await searchCatalog({ ...opts, query: "google" });
    expect(reads).toBeGreaterThan(afterFirst);
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
      "customProxyGroups:",
      "  - name: Proxy",
      "    type: select",
      "    options:",
      "      - DIRECT",
      "ruleSets:",
      "  - id: final",
      "    policy: Proxy",
      "    source:",
      "      type: final",
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

  it("maps templateReldir into a repo-relative templateDir", () => {
    const repo = normalizeVendorRepoInput({
      name: "ACL4SSR",
      url: "https://x.git",
      catalog: { reldir: "Clash", kind: "list-dir" },
      templateReldir: "/Clash/config/",
    });
    expect(repo).toEqual<VendorRepoConfig>({
      name: "ACL4SSR",
      url: "https://x.git",
      path: "vendor/ACL4SSR",
      catalog: { dir: "vendor/ACL4SSR/Clash", kind: "list-dir" },
      templateDir: "vendor/ACL4SSR/Clash/config",
    });
  });

  it("resolves dirs against an explicit folder decoupled from the name", () => {
    const repo = normalizeVendorRepoInput({
      name: "Aethersailor",
      url: "https://github.com/GeekXtop/Custom_OpenClash_Rules.git",
      folder: "Custom_OpenClash_Rules",
      catalog: { reldir: "rule", kind: "list-dir" },
      templateReldir: "cfg",
    });
    expect(repo).toEqual<VendorRepoConfig>({
      name: "Aethersailor",
      url: "https://github.com/GeekXtop/Custom_OpenClash_Rules.git",
      path: "vendor/Custom_OpenClash_Rules",
      catalog: { dir: "vendor/Custom_OpenClash_Rules/rule", kind: "list-dir" },
      templateDir: "vendor/Custom_OpenClash_Rules/cfg",
    });
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

  it("updates an existing repo url and clears the old clone for re-sync", async () => {
    const removed: string[] = [];
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
      removePath: async (p) => {
        removed.push(p);
      },
    });
    expect(result.config.vendorRepos[0]?.url).toBe("https://github.com/GeekXtop/Custom_OpenClash_Rules.git");
    expect(result.config.vendorRepos[0]?.catalog?.dir).toBe("vendor/Custom/rule");
    expect(result.resync).toBe(true);
    expect(removed).toEqual([path.resolve(root, "vendor/Custom")]);
  });

  it("moves the clone and clears the old folder when the folder changes", async () => {
    const removed: string[] = [];
    const result = await updateProjectVendorRepo({
      root,
      configFile,
      name: "Aethersailor",
      input: { name: "Aethersailor", url: "https://x.git", folder: "Custom_OpenClash_Rules", catalog: { reldir: "rule", kind: "list-dir" }, templateReldir: "cfg" },
      readText: async () =>
        yamlWith(["vendorRepos:", "  - name: Aethersailor", "    url: https://x.git", "    path: vendor/Aethersailor"].join("\n")),
      writeText: async () => {},
      removePath: async (p) => {
        removed.push(p);
      },
    });
    expect(result.config.vendorRepos[0]?.path).toBe("vendor/Custom_OpenClash_Rules");
    expect(result.config.vendorRepos[0]?.catalog?.dir).toBe("vendor/Custom_OpenClash_Rules/rule");
    expect(result.config.vendorRepos[0]?.templateDir).toBe("vendor/Custom_OpenClash_Rules/cfg");
    expect(result.resync).toBe(true);
    expect(removed).toEqual([path.resolve(root, "vendor/Aethersailor")]);
  });

  it("does not clear or resync when only the display name or dirs change", async () => {
    const removed: string[] = [];
    const result = await updateProjectVendorRepo({
      root,
      configFile,
      name: "Custom",
      input: { name: "Renamed", url: "https://x.git", folder: "Custom", catalog: { reldir: "Clash", kind: "list-dir" } },
      readText: async () =>
        yamlWith(["vendorRepos:", "  - name: Custom", "    url: https://x.git", "    path: vendor/Custom"].join("\n")),
      writeText: async () => {},
      removePath: async (p) => {
        removed.push(p);
      },
    });
    expect(result.config.vendorRepos[0]?.name).toBe("Renamed");
    expect(result.resync).toBe(false);
    expect(removed).toEqual([]);
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

describe("catalog entries with hasChildren", () => {
  const root = path.resolve("fixture-repo");

  it("computes hasChildren for domain-list entries from include lines", async () => {
    const files: Record<string, string> = {
      "category-acg": "include:acg-cn\nnicovideo.jp\n",
      "acg-cn": "bilibili.com\n",
      openai: "openai.com\n",
    };
    const entries = await listCatalogEntriesWithMeta({
      root,
      configFile: "config/routes.yaml",
      origin: "domain-list-community",
      readDirectory: async () => ["category-acg", "acg-cn", "openai", "README.md"],
      readText: async (filePath: string) => files[path.basename(filePath)] ?? "",
    });
    const byName = Object.fromEntries(entries.map((e) => [e.name, e.hasChildren]));
    expect(byName["category-acg"]).toBe(true);
    expect(byName["acg-cn"]).toBe(false);
    expect(byName["openai"]).toBe(false);
    expect(byName["README.md"]).toBeUndefined();
    // acg-cn is pulled in by category-acg → not a root; the others are roots
    const rootByName = Object.fromEntries(entries.map((e) => [e.name, e.root]));
    expect(rootByName["category-acg"]).toBe(true);
    expect(rootByName["acg-cn"]).toBe(false);
    expect(rootByName["openai"]).toBe(true);
  });

  it("marks list-dir entries hasChildren=false without reading files", async () => {
    const entries = await listCatalogEntriesWithMeta({
      root,
      configFile: "config/routes.yaml",
      origin: "ACL4SSR",
      readDirectory: async () => ["BanAD.list", "Apple.list"],
      readText: async () => {
        throw new Error("should not read list-dir files");
      },
    });
    expect(entries).toEqual([
      { name: "Apple", hasChildren: false, root: true },
      { name: "BanAD", hasChildren: false, root: true },
    ]);
  });
});

describe("findCatalogPath (ancestry from a category root)", () => {
  const root = path.resolve("fixture-repo");
  const files: Record<string, string> = {
    "category-ads-all": "include:category-ads\nadjust.com\n",
    "category-ads": "include:adblock\nads.com\n",
    adblock: "ad.example\n",
    "category-games": "steam.com\n",
  };
  const base = {
    root,
    configFile: "config/routes.yaml",
    origin: "domain-list-community",
    readDirectory: async () => Object.keys(files),
    readText: async (filePath: string) => files[path.basename(filePath)] ?? "",
  };

  it("returns the include path from a category root down to a nested entry", async () => {
    const trail = await findCatalogPath({ ...base, name: "adblock", graphCache: new Map() });
    expect(trail).toEqual(["category-ads-all", "category-ads", "adblock"]);
  });

  it("returns just the entry when it is itself a category root", async () => {
    const trail = await findCatalogPath({ ...base, name: "category-ads-all", graphCache: new Map() });
    expect(trail).toEqual(["category-ads-all"]);
  });

  it("returns empty when the entry is not reachable from any category root", async () => {
    const trail = await findCatalogPath({ ...base, name: "not-in-graph", graphCache: new Map() });
    expect(trail).toEqual([]);
  });
});
