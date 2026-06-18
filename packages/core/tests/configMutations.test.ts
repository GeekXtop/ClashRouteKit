import { describe, expect, it } from "vitest";
import { addVendorRepo, removeVendorRepo, updateVendorRepo } from "../src/configMutations.js";
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

describe("updateVendorRepo", () => {
  it("replaces fields of an existing repo by name", () => {
    const start = addVendorRepo(base, { name: "Custom", url: "https://old.git", path: "vendor/Custom" });
    const next = updateVendorRepo(start, "Custom", {
      name: "Custom",
      url: "https://github.com/GeekXtop/Custom_OpenClash_Rules.git",
      path: "vendor/Custom",
      branch: "main",
    });
    expect(next.vendorRepos.find((r) => r.name === "Custom")?.url).toBe(
      "https://github.com/GeekXtop/Custom_OpenClash_Rules.git",
    );
    expect(next.vendorRepos.find((r) => r.name === "Custom")?.branch).toBe("main");
  });
  it("throws when the repo name is not found", () => {
    expect(() => updateVendorRepo(base, "missing", { name: "missing", url: "x", path: "p" })).toThrow(/not found/);
  });
  it("rejects renaming onto another existing repo", () => {
    const start = addVendorRepo(base, { name: "Custom", url: "x", path: "vendor/Custom" });
    expect(() => updateVendorRepo(start, "Custom", { name: "dler-io", url: "x", path: "vendor/Custom" })).toThrow(/exists/);
  });
});

describe("removeVendorRepo", () => {
  it("removes a repo by name immutably", () => {
    const next = removeVendorRepo(base, "dler-io");
    expect(next.vendorRepos).toHaveLength(0);
    expect(base.vendorRepos).toHaveLength(1);
  });
  it("throws when the repo name is not found", () => {
    expect(() => removeVendorRepo(base, "missing")).toThrow(/not found/);
  });
});
