import { describe, expect, it } from "vitest";
import type { RouteKitProjectConfig, RuleProviderConfig } from "@clash-route-kit/core";
import {
  findStaleProviderSources,
  providerHasUsableSource,
  providerMustStayDisabled,
} from "../src/libraryHealth.js";

function makeProvider(
  overrides: Partial<RuleProviderConfig> & { name: string },
): RuleProviderConfig {
  return {
    output: `${overrides.name}.yaml`,
    behavior: "domain",
    sources: [],
    ...overrides,
  };
}

const baseConfig: RouteKitProjectConfig = {
  publishBaseUrl: "http://127.0.0.1:8787",
  template: { output: "Custom_Clash.ini" },
  vendorRepos: [{ name: "ACL4SSR", url: "https://x.git", path: "vendor/ACL4SSR" }],
  customProxyGroups: [],
  ruleSets: [],
  ruleProviders: [],
};

describe("provider health predicates", () => {
  it("treats missing, empty-list and blank-path sources as pending", () => {
    expect(providerHasUsableSource(makeProvider({ name: "A" }))).toBe(false);
    expect(
      providerHasUsableSource(
        makeProvider({ name: "B", sources: [{ name: "s", type: "clash-list", path: "  " }] }),
      ),
    ).toBe(false);
    expect(
      providerHasUsableSource(
        makeProvider({
          name: "C",
          sources: [{ name: "s", type: "domain-list-community", entry: "google" }],
        }),
      ),
    ).toBe(true);
  });

  it("forces .mrs output and empty sources into disabled drafts", () => {
    expect(providerMustStayDisabled(makeProvider({ name: "A" }))).toBe(true);
    expect(
      providerMustStayDisabled(
        makeProvider({ name: "B", output: "Thing.MRS", sources: [{ name: "s", type: "clash-list", path: "config/rules/A.list" }] }),
      ),
    ).toBe(true);
    expect(
      providerMustStayDisabled(
        makeProvider({ name: "C", sources: [{ name: "s", type: "clash-list", path: "config/rules/A.list" }] }),
      ),
    ).toBe(false);
  });
});

describe("findStaleProviderSources", () => {
  const config: RouteKitProjectConfig = {
    ...baseConfig,
    ruleProviders: [
      makeProvider({
        name: "LocalMissing",
        sources: [{ name: "s", type: "clash-list", path: "config/rules\\Gone.list" }],
      }),
      makeProvider({
        name: "LocalOk",
        sources: [{ name: "s", type: "clash-list", path: "config/rules/Here.list" }],
      }),
      makeProvider({
        name: "VendorMissing",
        sources: [
          { name: "s", type: "clash-list", basePath: "vendor/GoneRepo", path: "Clash/Rules/x.list" },
        ],
      }),
      makeProvider({
        name: "VendorOk",
        sources: [
          { name: "s", type: "clash-list", basePath: "vendor/ACL4SSR/", path: "Clash/Rules/y.list" },
        ],
      }),
      makeProvider({
        name: "Dlc",
        sources: [{ name: "s", type: "domain-list-community", entry: "google" }],
      }),
    ],
  };

  it("reports only locally verifiable stale sources", () => {
    expect(
      findStaleProviderSources(config, ["Here.list"]).map((stale) => [
        stale.providerName,
        stale.reason,
      ]),
    ).toEqual([
      ["LocalMissing", "local-file-missing"],
      ["VendorMissing", "vendor-repo-missing"],
    ]);
  });

  it("clears stale entries once the local list file exists", () => {
    expect(
      findStaleProviderSources(config, ["Here.list", "Gone.list"]).map(
        (stale) => stale.providerName,
      ),
    ).toEqual(["VendorMissing"]);
  });
});
