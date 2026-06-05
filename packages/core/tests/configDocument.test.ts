import { describe, expect, it } from "vitest";
import {
  parseRouteKitConfig,
  serializeRouteKitConfig,
} from "../src/index.js";

describe("config document utilities", () => {
  const yaml = [
    "publishBaseUrl: http://127.0.0.1:8787",
    "",
    "template:",
    "  output: Custom_Clash.ini",
    "",
    "vendorRepos: []",
    "",
    "proxyGroups:",
    "  - name: Proxy",
    "    type: select",
    "    options:",
    "      - DIRECT",
    "",
    "modules:",
    "  - id: developer",
    "    policy: Proxy",
    "    geosite:",
    "      - github",
    "",
    "final:",
    "  policy: Proxy",
    "",
    "ruleProviders: []",
    "",
  ].join("\n");

  it("parses modules.yaml into a project config", () => {
    const config = parseRouteKitConfig(yaml);

    expect(config.template.output).toBe("Custom_Clash.ini");
    expect(config.proxyGroups[0]?.name).toBe("Proxy");
    expect(config.modules[0]?.id).toBe("developer");
    expect(config.final.policy).toBe("Proxy");
  });

  it("serializes project config with a trailing newline", () => {
    const serialized = serializeRouteKitConfig(parseRouteKitConfig(yaml));

    expect(serialized).toContain("publishBaseUrl: http://127.0.0.1:8787");
    expect(serialized).toContain("template:");
    expect(serialized.endsWith("\n")).toBe(true);
  });

  it("rejects documents that are not route kit project configs", () => {
    expect(() => parseRouteKitConfig("modules: nope\n")).toThrow("Invalid RouteKit project config");
  });
});
