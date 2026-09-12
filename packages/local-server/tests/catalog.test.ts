import { describe, expect, it } from "vitest";
import path from "node:path";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import {
  catalogOriginsFromConfig,
  clearCatalogIndexCache,
  findCatalogPath,
  listCatalogEntries,
  listCatalogEntriesWithMeta,
  listCatalogSources,
  readCatalogEntry,
  readCatalogEntryDomains,
  readCatalogTemplate,
  searchCatalog,
} from "../src/index.js";

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

describe("catalog entries and domains", () => {
  const baseOptions = {
    root: "E:/repo",
    configFile: "config/routes.yaml",
  };

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
