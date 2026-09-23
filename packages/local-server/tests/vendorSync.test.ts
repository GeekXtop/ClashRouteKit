import { describe, expect, it } from "vitest";
import path from "node:path";
import type { VendorRepoConfig } from "@clash-route-kit/core";
import {
  addProjectVendorRepo,
  normalizeVendorRepoInput,
  removeProjectVendorRepo,
  updateProjectVendorRepo,
} from "../src/index.js";

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

  describe("over a schema v2 author config", () => {
    const v2YamlWith = (repos: string) =>
      [
        "schemaVersion: 2",
        "project:",
        "  template:",
        "    output: Custom_Clash.ini",
        "memberSets:",
        "  standard:",
        "    members:",
        "      - builtin: DIRECT",
        repos,
        "proxyGroups:",
        "  - id: proxy",
        "    name: Proxy",
        "    type: select",
        "    members:",
        "      - preset: standard",
        "ruleProviders: []",
        "routes:",
        "  - id: final",
        "    policy:",
        "      builtin: DIRECT",
        "    source:",
        "      type: final",
        "",
      ].join("\n");

    it("adds a repo with a deterministic stable id and preserves v2 structure", async () => {
      let written = "";
      const result = await addProjectVendorRepo({
        root,
        configFile,
        input: { name: "GeekX", url: "https://x.git", catalog: { reldir: "rule", kind: "list-dir" } },
        readText: async () => v2YamlWith("vendorRepos: []"),
        writeText: async (_p, text) => {
          written = text;
        },
      });
      expect(result).toMatchObject({ ok: true, schemaVersion: 2 });
      expect(written.startsWith("schemaVersion: 2")).toBe(true);
      expect(written).toContain("memberSets:");
      expect(written).toContain("id: geekx");
      expect(written).toContain("path: vendor/GeekX");
    });

    it("removes a repo and keeps memberSets and proxy groups intact", async () => {
      let written = "";
      await removeProjectVendorRepo({
        root,
        configFile,
        name: "Custom",
        readText: async () =>
          v2YamlWith([
            "vendorRepos:",
            "  - id: custom",
            "    name: Custom",
            "    url: x",
            "    path: vendor/Custom",
          ].join("\n")),
        writeText: async (_p, text) => {
          written = text;
        },
      });
      expect(written.startsWith("schemaVersion: 2")).toBe(true);
      expect(written).not.toContain("name: Custom");
      expect(written).not.toContain("vendor/Custom");
      expect(written).toContain("memberSets:");
      expect(written).toContain("proxyGroups:");
      expect(written).toContain("preset: standard");
    });

    it("rejects a mutation that would break v2 validation", async () => {
      await expect(
        addProjectVendorRepo({
          root,
          configFile,
          input: { name: "Custom", url: "https://x.git", catalog: { reldir: "rule", kind: "list-dir" } },
          readText: async () =>
            v2YamlWith(["vendorRepos:", "  - id: custom", "    name: Custom", "    url: x", "    path: vendor/Custom"].join("\n")),
          writeText: async () => {},
        }),
      ).rejects.toThrow(/already exists/);
    });
  });
});
