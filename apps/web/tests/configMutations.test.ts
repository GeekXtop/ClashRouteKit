import { describe, expect, it } from "vitest";
import type {
  CustomProxyGroup,
  ImportedConfig,
  RouteKitProjectConfig,
  RuleProviderConfig,
  RuleProviderSource,
} from "@clash-route-kit/core";
import {
  addCustomProxyGroup,
  addRuleProvider,
  addRuleSet,
  addVendorRepo,
  createCustomProxyGroup,
  createRuleProvider,
  createRuleSet,
  deleteCustomProxyGroup,
  deleteRuleProvider,
  deleteRuleSet,
  mergeImportedConfig,
  renameCustomProxyGroup,
  reorderRuleSets,
  replaceCustomProxyGroup,
  replaceImportedConfig,
  replaceRuleSet,
  setCustomProxyGroupListField,
  setGlobalRemove,
  setProjectDefaults,
  setRuleProviderListField,
  setRuleProviderSources,
  setTemplateField,
  toggleRuleSet,
  updateCustomProxyGroup,
  updateRuleProvider,
  updateRuleSet,
} from "../src/configMutations.js";

function createConfig(): RouteKitProjectConfig {
  return {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
    ruleSets: [
      { id: "ai-geosite-openai", policy: "Proxy", source: { type: "geosite", value: "openai" } },
      { id: "final", policy: "Proxy", source: { type: "final" } },
    ],
    ruleProviders: [],
  };
}

describe("mergeImportedConfig", () => {
  it("adds new groups and rule sets while skipping duplicates and inserting before FINAL", () => {
    const config = createConfig();
    const imported: ImportedConfig = {
      customProxyGroups: [
        { name: "Proxy", type: "select", options: ["DIRECT"] },
        { name: "Stream", type: "select", options: ["DIRECT"] },
      ],
      ruleSets: [
        { id: "ai-geosite-openai", policy: "Proxy", source: { type: "geosite", value: "openai" } },
        { id: "stream-geosite-netflix", policy: "Stream", source: { type: "geosite", value: "netflix" } },
        { id: "imported-final", policy: "Proxy", source: { type: "final" } },
      ],
      warnings: [],
    };

    const merged = mergeImportedConfig(config, imported);

    expect(merged.customProxyGroups.map((group) => group.name)).toEqual(["Proxy", "Stream"]);
    expect(merged.ruleSets.map((ruleSet) => ruleSet.id)).toEqual([
      "ai-geosite-openai",
      "stream-geosite-netflix",
      "final",
    ]);
  });
});

describe("config mutation helpers", () => {
  it("creates and updates ruleSet entries immutably", () => {
    const config = createConfig();
    const created = createRuleSet(config, { sourceType: "geosite" });
    const added = addRuleSet(config, created);
    const updated = updateRuleSet(added, created.id, {
      policy: "Proxy",
      source: { type: "geosite", value: "anthropic" },
    });

    expect(created).toEqual({
      id: "ruleset",
      policy: "Proxy",
      source: { type: "geosite", value: "" },
    });
    expect(updated.ruleSets.map((ruleSet) => ruleSet.id)).toEqual([
      "ai-geosite-openai",
      "ruleset",
      "final",
    ]);
    expect(updated.ruleSets[1]).toEqual({
      id: "ruleset",
      policy: "Proxy",
      source: { type: "geosite", value: "anthropic" },
    });
    expect(config.ruleSets).toHaveLength(2);
  });

  it("creates default source shapes for each ruleSet source type", () => {
    const config = createConfig();

    expect(createRuleSet(config, { sourceType: "rule-provider" }).source).toEqual({
      type: "rule-provider",
      behavior: "domain",
      file: "",
    });
    expect(createRuleSet(config, { sourceType: "geoip" }).source).toEqual({
      type: "geoip",
      value: "",
      noResolve: true,
    });
    expect(createRuleSet(config, { sourceType: "final" }).source).toEqual({ type: "final" });
  });

  it("toggles and deletes ruleSet entries without mutating the original config", () => {
    const config = createConfig();
    const toggled = toggleRuleSet(config, "ai-geosite-openai");
    const deleted = deleteRuleSet(toggled, "ai-geosite-openai");

    expect(toggled.ruleSets[0]?.enabled).toBe(false);
    expect(deleted.ruleSets.map((ruleSet) => ruleSet.id)).toEqual(["final"]);
    expect(config.ruleSets[0]?.enabled).toBeUndefined();
  });

  it("creates and updates custom proxy groups immutably", () => {
    const config = createConfig();
    const created = createCustomProxyGroup(config);
    const added = addCustomProxyGroup(config, created);
    const updated = updateCustomProxyGroup(added, created.name, {
      type: "url-test",
      url: "http://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 50,
    });

    expect(created).toEqual({
      name: "ProxyGroup",
      type: "select",
      options: ["DIRECT"],
    });
    expect(updated.customProxyGroups.at(-1)).toEqual({
      name: "ProxyGroup",
      type: "url-test",
      options: ["DIRECT"],
      url: "http://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 50,
    });
    expect(config.customProxyGroups).toHaveLength(1);
  });

  it("creates a region (url-test) group with shared probe defaults", () => {
    const config = createConfig();
    const created = createCustomProxyGroup(config, "url-test");

    expect(created).toEqual({
      name: "ProxyGroup",
      type: "url-test",
      options: [],
      nodeFilters: [".*"],
    });
  });

  it.each(["fallback", "load-balance"] as const)(
    "creates a %s group without baking project defaults into the item",
    (type) => {
      expect(createCustomProxyGroup(createConfig(), type)).toEqual({
        name: "ProxyGroup",
        type,
        options: [],
        nodeFilters: [".*"],
      });
    },
  );

  it("sets, clones and clears project defaults immutably", () => {
    const config = createConfig();
    const defaults = {
      proxyGroups: { healthCheck: { interval: 300, timeout: 5 } },
      ruleSets: { geoipNoResolve: false },
    };
    const next = setProjectDefaults(config, defaults);

    defaults.proxyGroups.healthCheck.interval = 600;
    expect(next.defaults).toEqual({
      proxyGroups: { healthCheck: { interval: 300, timeout: 5 } },
      ruleSets: { geoipNoResolve: false },
    });
    expect(config.defaults).toBeUndefined();
    expect(setProjectDefaults(next, undefined).defaults).toBeUndefined();
  });

  it("renames custom proxy groups and updates ruleSet policy references", () => {
    const config = {
      ...createConfig(),
      customProxyGroups: [
        { name: "Proxy", type: "select", options: ["DIRECT"] },
        { name: "Parent", type: "select", options: ["Proxy", "DIRECT"] },
      ] satisfies CustomProxyGroup[],
    };
    const renamed = renameCustomProxyGroup(config, "Proxy", "Main");

    expect(renamed.customProxyGroups[0]?.name).toBe("Main");
    expect(renamed.customProxyGroups[1]?.options).toEqual(["Main", "DIRECT"]);
    expect(renamed.ruleSets[0]?.policy).toBe("Main");
    expect(renamed.ruleSets[1]?.policy).toBe("Main");
    expect(config.customProxyGroups[0]?.name).toBe("Proxy");
  });

  it("atomically replaces and renames a custom proxy group without moving it", () => {
    const config = {
      ...createConfig(),
      customProxyGroups: [
        { name: "Proxy", type: "select", options: ["HK", "DIRECT"] },
        { name: "HK", type: "url-test", options: [], nodeFilters: ["(港|HK)"] },
      ],
      ruleSets: [
        { id: "hk", policy: "HK", source: { type: "geosite", value: "hk" } },
        { id: "final", policy: "Proxy", source: { type: "final" } },
      ],
    } satisfies RouteKitProjectConfig;

    const next = replaceCustomProxyGroup(config, "HK", {
      name: "Hong Kong",
      type: "fallback",
      options: [],
      nodeFilters: ["(港|HK)", "HKG"],
      timeout: 8,
    });

    expect(next.customProxyGroups.map((group) => group.name)).toEqual(["Proxy", "Hong Kong"]);
    expect(next.customProxyGroups[0]?.options).toEqual(["Hong Kong", "DIRECT"]);
    expect(next.ruleSets[0]?.policy).toBe("Hong Kong");
    expect(next.customProxyGroups[1]).toEqual({
      name: "Hong Kong",
      type: "fallback",
      options: [],
      nodeFilters: ["(港|HK)", "HKG"],
      timeout: 8,
    });
    expect(config.customProxyGroups[1]?.name).toBe("HK");
  });

  it("atomically replaces a RuleSet and keeps its index", () => {
    const config = createConfig();
    const next = replaceRuleSet(config, "ai-geosite-openai", {
      id: "ai-geosite-anthropic",
      policy: "Proxy",
      section: "AI",
      source: { type: "geosite", value: "anthropic" },
    });

    expect(next.ruleSets.map((ruleSet) => ruleSet.id)).toEqual([
      "ai-geosite-anthropic",
      "final",
    ]);
    expect(next.ruleSets[0]).toEqual({
      id: "ai-geosite-anthropic",
      policy: "Proxy",
      section: "AI",
      source: { type: "geosite", value: "anthropic" },
    });
    expect(config.ruleSets[0]?.id).toBe("ai-geosite-openai");
  });

  it("rejects duplicate custom proxy group names and protects referenced deletes", () => {
    const config = {
      ...createConfig(),
      customProxyGroups: [
        { name: "Proxy", type: "select", options: ["DIRECT"] },
        { name: "Unused", type: "select", options: ["Proxy"] },
      ] satisfies CustomProxyGroup[],
    };

    expect(() => addCustomProxyGroup(config, { name: "Proxy", type: "select", options: ["DIRECT"] })).toThrow(
      "already exists",
    );
    expect(() => deleteCustomProxyGroup(config, "Proxy")).toThrow("custom_proxy_group is still referenced: Proxy");
    expect(deleteCustomProxyGroup(config, "Unused").customProxyGroups.map((group) => group.name)).toEqual(["Proxy"]);
  });

  it("protects custom proxy groups referenced by parent group options", () => {
    const config = {
      ...createConfig(),
      ruleSets: [{ id: "final", policy: "Parent", source: { type: "final" } }] satisfies RouteKitProjectConfig["ruleSets"],
      customProxyGroups: [
        { name: "Parent", type: "select", options: ["Child"] },
        { name: "Child", type: "url-test", options: [], nodeFilters: [".*"] },
      ] satisfies CustomProxyGroup[],
    };

    expect(() => deleteCustomProxyGroup(config, "Child")).toThrow("Parent");
  });

  it("normalizes custom proxy group option and node filter lists", () => {
    const config = createConfig();
    const options = setCustomProxyGroupListField(config, "Proxy", "options", [" DIRECT ", "", "DIRECT", "Auto"]);
    const filters = setCustomProxyGroupListField(options, "Proxy", "nodeFilters", [" 香港", "香港 ", ""]);

    expect(filters.customProxyGroups[0]?.options).toEqual(["DIRECT", "Auto"]);
    expect(filters.customProxyGroups[0]?.nodeFilters).toEqual(["香港"]);
  });

  it("creates and updates rule providers immutably", () => {
    const config = createConfig();
    const created = createRuleProvider(config);
    const added = addRuleProvider(config, created);
    const sources: RuleProviderSource[] = [
      { name: "Custom", type: "clash-list", path: "config/rules/Custom.list" },
    ];
    const updated = setRuleProviderSources(
      updateRuleProvider(added, created.name, { output: "Policy_Domain.yaml" }),
      created.name,
      sources,
    );

    expect(created).toEqual({
      name: "Provider",
      output: "Provider_Domain.yaml",
      behavior: "domain",
      sources: [],
    });
    expect(updated.ruleProviders?.at(-1)).toEqual({
      name: "Provider",
      output: "Policy_Domain.yaml",
      behavior: "domain",
      sources,
    });
    expect(config.ruleProviders).toEqual([]);
  });

  it("rejects duplicate rule provider names and outputs", () => {
    const config = {
      ...createConfig(),
      ruleProviders: [
        { name: "AI", output: "AI_Domain.yaml", behavior: "domain", sources: [] },
      ] satisfies RuleProviderConfig[],
    };

    expect(() =>
      addRuleProvider(config, { name: "AI", output: "Other.yaml", behavior: "domain", sources: [] }),
    ).toThrow("already exists");
    expect(() =>
      addRuleProvider(config, { name: "Tech", output: "AI_Domain.yaml", behavior: "domain", sources: [] }),
    ).toThrow("output already exists");
  });

  it("normalizes rule provider exclude and remove lists", () => {
    const config = {
      ...createConfig(),
      ruleProviders: [
        { name: "AI", output: "AI_Domain.yaml", behavior: "domain", sources: [] },
      ] satisfies RuleProviderConfig[],
    };

    const excluded = setRuleProviderListField(config, "AI", "exclude", [
      " DOMAIN,example.com ",
      "",
      "DOMAIN,example.com",
    ]);
    const removed = setRuleProviderListField(excluded, "AI", "remove", ["DOMAIN-SUFFIX,old.example"]);

    expect(removed.ruleProviders?.[0]?.exclude).toEqual(["DOMAIN,example.com"]);
    expect(removed.ruleProviders?.[0]?.remove).toEqual(["DOMAIN-SUFFIX,old.example"]);
  });

  it("deletes rule providers without mutating the original config", () => {
    const config = {
      ...createConfig(),
      ruleProviders: [
        { name: "AI", output: "AI_Domain.yaml", behavior: "domain", sources: [] },
      ] satisfies RuleProviderConfig[],
    };

    expect(deleteRuleProvider(config, "AI").ruleProviders).toEqual([]);
    expect(config.ruleProviders).toHaveLength(1);
  });

  it("reorders ruleSets to match the given id order", () => {
    const config = createConfig();
    const next = reorderRuleSets(config, ["final", "ai-geosite-openai"]);
    expect(next.ruleSets.map((ruleSet) => ruleSet.id)).toEqual(["final", "ai-geosite-openai"]);
  });

  it("ignores unknown ids and appends remaining ruleSets in original order", () => {
    const config = createConfig();
    const next = reorderRuleSets(config, ["final"]);
    expect(next.ruleSets.map((ruleSet) => ruleSet.id)).toEqual(["final", "ai-geosite-openai"]);
  });

  it("sets a normalized globalRemove list", () => {
    const config = createConfig();
    const next = setGlobalRemove(config, [" ban.example ", "ban.example", ""]);
    expect(next.globalRemove).toEqual(["ban.example"]);
  });

  it("patches template fields without dropping output", () => {
    const config = createConfig();
    const next = setTemplateField(config, { clashRuleBase: "https://x/Base.yml" });
    expect(next.template).toEqual({ output: "Custom_Clash.ini", clashRuleBase: "https://x/Base.yml" });
  });

  it("appends a vendor repo with catalog meta", () => {
    const config = createConfig();
    const next = addVendorRepo(config, {
      name: "MyRules",
      url: "https://example.com/my.git",
      path: "vendor/my",
      branch: "main",
      catalog: { dir: "vendor/my/rules", kind: "list-dir" },
    });
    expect(next.vendorRepos.at(-1)).toEqual({
      name: "MyRules",
      url: "https://example.com/my.git",
      path: "vendor/my",
      branch: "main",
      catalog: { dir: "vendor/my/rules", kind: "list-dir" },
    });
  });

  it("rejects a vendor repo with a duplicate path", () => {
    const config = { ...createConfig(), vendorRepos: [{ name: "a", url: "u", path: "vendor/x" }] };
    expect(() => addVendorRepo(config, { name: "b", url: "u2", path: "vendor/x" })).toThrow(/path already exists/);
  });

  it("replaces groups and ruleSets but keeps infra fields", () => {
    const config = {
      ...createConfig(),
      publishBaseUrl: "http://keep",
      globalRemove: ["x"],
      defaults: {
        proxyGroups: { healthCheck: { timeout: 5 } },
      },
    };
    const imported: ImportedConfig = {
      customProxyGroups: [
        {
          name: "New",
          type: "url-test",
          options: [],
          nodeFilters: [".*"],
          timeout: null,
          tolerance: null,
        },
      ],
      ruleSets: [{ id: "n1", policy: "New", source: { type: "final" } }],
      warnings: [],
    };
    const next = replaceImportedConfig(config, imported);
    expect(next.customProxyGroups.map((group) => group.name)).toEqual(["New"]);
    expect(next.ruleSets.map((ruleSet) => ruleSet.id)).toEqual(["n1"]);
    expect(next.publishBaseUrl).toBe("http://keep");
    expect(next.vendorRepos).toBe(config.vendorRepos);
    expect(next.template).toEqual(config.template);
    expect(next.globalRemove).toEqual(["x"]);
    expect(next.defaults).toEqual(config.defaults);
    expect(next.customProxyGroups[0]).toMatchObject({ timeout: null, tolerance: null });
  });

  it("replaces imported templates and creates placeholder rule providers for missing outputs", () => {
    const config = {
      ...createConfig(),
      ruleProviders: [
        {
          name: "ExistingAI",
          output: "AI_Domain.yaml",
          behavior: "domain",
          sources: [{ name: "AI", type: "clash-list", path: "config/rules/AI.list" }],
        },
        {
          name: "KeepEvenUnused",
          output: "Unused_Domain.yaml",
          behavior: "domain",
          sources: [],
        },
      ] satisfies RuleProviderConfig[],
    };
    const imported: ImportedConfig = {
      customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
      ruleSets: [
        {
          id: "ai",
          policy: "Proxy",
          source: { type: "rule-provider", behavior: "domain", file: "AI_Domain.yaml" },
        },
        {
          id: "custom-classical-ip",
          policy: "Proxy",
          source: { type: "rule-provider", behavior: "classical", file: "Custom_Direct_Classical_IP.yaml" },
        },
        {
          id: "custom-ipcidr",
          policy: "Proxy",
          source: { type: "rule-provider", behavior: "ipcidr", file: "Custom_IP.yaml" },
        },
        { id: "final", policy: "Proxy", source: { type: "final" } },
      ],
      warnings: [],
    };

    const next = replaceImportedConfig(config, imported);

    expect(next.ruleProviders?.map((provider) => provider.output)).toEqual([
      "AI_Domain.yaml",
      "Unused_Domain.yaml",
      "Custom_Direct_Classical_IP.yaml",
      "Custom_IP.yaml",
    ]);
    expect(next.ruleProviders?.find((provider) => provider.output === "AI_Domain.yaml")?.name).toBe("ExistingAI");
    expect(next.ruleProviders?.find((provider) => provider.output === "Custom_Direct_Classical_IP.yaml")).toEqual({
      name: "Custom_Direct_Classical_IP",
      output: "Custom_Direct_Classical_IP.yaml",
      behavior: "classical",
      sources: [],
    });
    expect(next.ruleProviders?.find((provider) => provider.output === "Custom_IP.yaml")?.behavior).toBe("ipcidr");
  });
});

import { addRoute } from "../src/configMutations.js";

describe("addRoute", () => {
  const cfg = {
    publishBaseUrl: "x",
    template: { output: "o.ini" },
    vendorRepos: [],
    customProxyGroups: [{ name: "Proxy", type: "select", options: [] }],
    ruleSets: [],
  } as unknown as RouteKitProjectConfig;

  it("appends a ruleSet with a unique id and given policy/section", () => {
    const next = addRoute(cfg, { source: { type: "geosite", value: "openai" }, policy: "Proxy", section: "代理" });
    expect(next.ruleSets).toHaveLength(1);
    expect(next.ruleSets[0]).toMatchObject({ policy: "Proxy", section: "代理", source: { type: "geosite", value: "openai" } });
    expect(next.ruleSets[0]!.id).toMatch(/openai/);
  });

  it("dedupes id on collision", () => {
    const once = addRoute(cfg, { source: { type: "geosite", value: "ai" }, policy: "Proxy" });
    const twice = addRoute(once, { source: { type: "geosite", value: "ai" }, policy: "Proxy" });
    expect(twice.ruleSets[1]!.id).not.toBe(twice.ruleSets[0]!.id);
  });
});
