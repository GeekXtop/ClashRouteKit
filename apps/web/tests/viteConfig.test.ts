import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createConfigWatchIgnore,
  resolveProjectConfigPath,
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
