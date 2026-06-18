import { describe, expect, it } from "vitest";
import { addVendorRepo } from "../src/configMutations.js";
import type { RouteKitProjectConfig, VendorRepoConfig } from "../src/types.js";

const base = {
  publishBaseUrl: "http://127.0.0.1:8787",
  template: { output: "Custom_Clash.ini" },
  vendorRepos: [{ name: "dler-io", url: "x", path: "vendor/Rules" }] as VendorRepoConfig[],
  customProxyGroups: [],
  ruleSets: [],
} as unknown as RouteKitProjectConfig;

describe("addVendorRepo", () => {
  it("appends a vendor repo", () => {
    const next = addVendorRepo(base, { name: "MyRules", url: "https://x/y.git", path: "vendor/y" });
    expect(next.vendorRepos.at(-1)?.name).toBe("MyRules");
    expect(base.vendorRepos).toHaveLength(1); // 不可变
  });
  it("rejects duplicate name", () => {
    expect(() => addVendorRepo(base, { name: "dler-io", url: "x", path: "p" })).toThrow(/exists/);
  });
  it("rejects duplicate path", () => {
    expect(() => addVendorRepo(base, { name: "New", url: "x", path: "vendor/Rules" })).toThrow(/path/);
  });
});
