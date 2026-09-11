import path from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  createConfigWatchIgnore,
  resolveProjectConfigPath,
  resolveRoutesConfigSourcePath,
} from "../vite.config.js";

describe("Vite project config watch ignore", () => {
  it("resolves relative config files against the configured project root", () => {
    const projectRoot = path.resolve("fixture-project");
    expect(resolveProjectConfigPath(projectRoot, "config/routes.yaml")).toBe(
      path.resolve(projectRoot, "config/routes.yaml"),
    );
  });

  it("ignores only the resolved project config file", () => {
    const projectRoot = path.resolve("fixture-project");
    const ignore = createConfigWatchIgnore(projectRoot, "config/routes.yaml");
    expect(ignore(path.resolve(projectRoot, "config/routes.yaml"))).toBe(true);
    expect(ignore(path.resolve(projectRoot, "config/modules.yaml"))).toBe(false);
    expect(ignore(path.resolve(projectRoot, "apps/web/src/App.tsx"))).toBe(false);
  });

  it("honors an absolute CLASH_ROUTE_KIT_CONFIG path", () => {
    const absolute = path.resolve("fixture-config/routes.yaml");
    expect(resolveProjectConfigPath(path.resolve("other-root"), absolute)).toBe(absolute);
  });
});

describe("Routes config inline source resolution", () => {
  it("prefers the local project config file when present", () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), "routekit-config-"));
    writeFileSync(path.join(projectRoot, "routes.yaml"), "schemaVersion: 1\n", "utf8");
    expect(resolveRoutesConfigSourcePath(projectRoot, "routes.yaml")).toBe(
      path.resolve(projectRoot, "routes.yaml"),
    );
  });

  it("falls back to routes.yaml.example when the local config is absent", () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), "routekit-config-"));
    writeFileSync(
      path.join(projectRoot, "routes.yaml.example"),
      "schemaVersion: 1\n",
      "utf8",
    );
    expect(resolveRoutesConfigSourcePath(projectRoot, "routes.yaml")).toBe(
      path.resolve(projectRoot, "routes.yaml.example"),
    );
  });
});
