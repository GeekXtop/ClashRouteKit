import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { validateLegacyWorkspace } from "../src/workspaceValidation.js";

function config(values: string[]): RouteKitProjectConfig {
  return {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
    ruleSets: [
      ...values.map((value) => ({
        id: value,
        policy: "Proxy",
        source: { type: "geosite" as const, value },
      })),
      { id: "final", policy: "Proxy", source: { type: "final" as const } },
    ],
    ruleProviders: [],
  };
}

describe("validateLegacyWorkspace", () => {
  it("accepts tag@attribute when the base GEOSITE file exists", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    const data = path.join(root, "vendor/domain-list-community/data");
    await mkdir(data, { recursive: true });
    await writeFile(path.join(data, "google"), "google.cn @cn\n", "utf8");
    await writeFile(path.join(data, "category-games"), "include:category-games-cn\n", "utf8");

    await expect(validateLegacyWorkspace(
      { root, configFile: "config/routes.yaml" },
      config(["google@cn", "category-games@cn"]),
    )).resolves.toEqual([]);
  });

  it("reports a missing non-authoritative GEOSITE entry as a warning", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    const data = path.join(root, "vendor/domain-list-community/data");
    await mkdir(data, { recursive: true });
    const diagnostics = await validateLegacyWorkspace(
      { root, configFile: "config/routes.yaml" },
      config(["gfw"]),
    );
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "workspace.geosite.missing",
        severity: "warning",
        related: ["gfw"],
      }),
    ]);
  });
});
