import { describe, expect, it } from "vitest";
import { parseAuthorProjectConfigV2 } from "../src/config/schemaV2/parser.js";
import { ConfigDiagnosticError, type Diagnostic } from "../src/config/diagnostics.js";

const validConfig = `
schemaVersion: 2

project:
  template:
    output: Custom_Clash.ini
  defaults:
    proxyGroups:
      healthCheck:
        url: https://cp.cloudflare.com/generate_204
        interval: 300

memberSets:
  region-groups:
    members:
      - group: hk
      - builtin: DIRECT

proxyGroups:
  - id: chat
    name: 即时通讯
    type: select
    members:
      - preset: region-groups
      - group: manual
    nodeFilters:
      - match: .*

routes:
  - id: telegram
    policy:
      group: chat
    source:
      type: geosite
      value: telegram
  - id: custom-direct
    policy:
      builtin: DIRECT
    source:
      type: rule-provider
      provider: custom-direct-domain
  - id: cn-ip
    policy:
      group: chat
    source:
      type: geoip
      value: CN
      noResolve: true

ruleProviders:
  - id: custom-direct-domain
    name: Custom Direct Domain
    output: Custom_Direct_Domain.yaml
    behavior: domain
    enabled: true
    sources:
      - id: local-direct
        name: Local Direct
        type: clash-list
        path: config/rules/Custom_Direct_Domain.list

vendorRepos:
  - id: dlc
    name: domain-list-community
    url: https://github.com/v2fly/domain-list-community
    path: vendor/domain-list-community
    catalog:
      dir: data
      kind: domain-list
`;

function parseFailure(text: string): Diagnostic[] {
  try {
    parseAuthorProjectConfigV2(text);
  } catch (error) {
    if (error instanceof ConfigDiagnosticError) return error.diagnostics;
    throw error;
  }
  throw new Error("expected the config to be rejected but it parsed successfully");
}

describe("parseAuthorProjectConfigV2", () => {
  it("parses a valid minimal v2 config into typed structures", () => {
    const config = parseAuthorProjectConfigV2(validConfig);

    expect(config.schemaVersion).toBe(2);
    expect(config.project).toEqual({
      template: { output: "Custom_Clash.ini" },
      defaults: {
        proxyGroups: {
          healthCheck: {
            url: "https://cp.cloudflare.com/generate_204",
            interval: 300,
          },
        },
      },
    });
    expect(config.memberSets).toEqual({
      "region-groups": {
        members: [{ group: "hk" }, { builtin: "DIRECT" }],
      },
    });
    expect(config.proxyGroups).toEqual([
      {
        id: "chat",
        name: "即时通讯",
        type: "select",
        members: [{ preset: "region-groups" }, { group: "manual" }],
        nodeFilters: [{ match: ".*" }],
      },
    ]);
    expect(config.routes).toEqual([
      {
        id: "telegram",
        policy: { group: "chat" },
        source: { type: "geosite", value: "telegram" },
      },
      {
        id: "custom-direct",
        policy: { builtin: "DIRECT" },
        source: { type: "rule-provider", provider: "custom-direct-domain" },
      },
      {
        id: "cn-ip",
        policy: { group: "chat" },
        source: { type: "geoip", value: "CN", noResolve: true },
      },
    ]);
    expect(config.ruleProviders).toEqual([
      {
        id: "custom-direct-domain",
        name: "Custom Direct Domain",
        output: "Custom_Direct_Domain.yaml",
        behavior: "domain",
        enabled: true,
        sources: [
          {
            id: "local-direct",
            name: "Local Direct",
            type: "clash-list",
            path: "config/rules/Custom_Direct_Domain.list",
          },
        ],
      },
    ]);
    expect(config.vendorRepos).toEqual([
      {
        id: "dlc",
        name: "domain-list-community",
        url: "https://github.com/v2fly/domain-list-community",
        path: "vendor/domain-list-community",
        catalog: { dir: "data", kind: "domain-list" },
      },
    ]);
  });

  it("rejects unknown top-level keys", () => {
    const diagnostics = parseFailure(`${validConfig}\nunknownTop: true\n`);

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "config.field.invalid",
        severity: "error",
        path: "config.unknownTop",
        message: "未知字段",
      }),
    ]);
  });

  it("rejects a missing schemaVersion with schema.version.unsupported", () => {
    const diagnostics = parseFailure(
      validConfig.replace("schemaVersion: 2\n", ""),
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "schema.version.unsupported",
        severity: "error",
        path: "config.schemaVersion",
      }),
    ]);
  });

  it("rejects schemaVersion values other than 2", () => {
    for (const version of ["1", "3", '"2"']) {
      const diagnostics = parseFailure(
        validConfig.replace("schemaVersion: 2", `schemaVersion: ${version}`),
      );
      expect(diagnostics).toEqual([
        expect.objectContaining({
          code: "schema.version.unsupported",
          severity: "error",
          path: "config.schemaVersion",
        }),
      ]);
    }
  });

  it("rejects a non-object proxyGroups entry", () => {
    const diagnostics = parseFailure(
      validConfig.replace("  - id: chat", "  - 42\n  - id: chat"),
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "config.field.invalid",
        severity: "error",
        path: "proxyGroups[0]",
        message: "期望对象",
      }),
    ]);
  });

  it("rejects a proxy group without id", () => {
    const diagnostics = parseFailure(
      validConfig.replace("  - id: chat\n    name: 即时通讯", "  - name: 即时通讯"),
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "config.field.invalid",
        severity: "error",
        path: "proxyGroups[0].id",
        message: "期望字符串",
      }),
    ]);
  });

  it("rejects proxy group ids that violate the stable id pattern", () => {
    const diagnostics = parseFailure(
      validConfig.replace("  - id: chat\n", '  - id: "Chat Group"\n'),
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "config.id.invalid",
        severity: "error",
        path: "proxyGroups[0].id",
      }),
    ]);
  });

  it("rejects duplicate proxy group ids inside the same collection", () => {
    const text = validConfig.replace(
      "routes:",
      [
        "  - id: chat",
        "    name: 重复分组",
        "    type: select",
        "    members:",
        "      - builtin: REJECT",
        "",
        "routes:",
      ].join("\n"),
    );
    const diagnostics = parseFailure(text);

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "config.id.duplicate",
        severity: "error",
        path: "proxyGroups[1].id",
        related: ["chat"],
      }),
    ]);
  });

  it("rejects typed members written as plain strings or with several keys", () => {
    const plainString = parseFailure(
      validConfig.replace(
        "    members:\n      - preset: region-groups\n      - group: manual",
        "    members:\n      - Proxy",
      ),
    );
    expect(plainString).toEqual([
      expect.objectContaining({
        code: "config.field.invalid",
        severity: "error",
        path: "proxyGroups[0].members[0]",
        message: "期望对象",
      }),
    ]);

    const mixedKeys = parseFailure(
      validConfig.replace(
        "      - preset: region-groups",
        "      - preset: region-groups\n        group: manual",
      ),
    );
    expect(mixedKeys).toEqual([
      expect.objectContaining({
        code: "member.keys.invalid",
        severity: "error",
        path: "proxyGroups[0].members[0]",
      }),
    ]);

    const unknownKey = parseFailure(
      validConfig.replace(
        "      - preset: region-groups",
        "      - name: region-groups",
      ),
    );
    expect(unknownKey).toEqual([
      expect.objectContaining({
        code: "config.field.invalid",
        severity: "error",
        path: "proxyGroups[0].members[0].name",
        message: "未知字段",
      }),
    ]);
  });

  it("rejects a policy target written as a plain string", () => {
    const diagnostics = parseFailure(
      validConfig.replace("    policy:\n      group: chat", "    policy: chat"),
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "config.field.invalid",
        severity: "error",
        path: "routes[0].policy",
        message: "期望对象",
      }),
    ]);
  });

  it("rejects node filter entries without match", () => {
    const diagnostics = parseFailure(
      validConfig.replace(
        "    nodeFilters:\n      - match: .*",
        "    nodeFilters:\n      - {}",
      ),
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "config.field.invalid",
        severity: "error",
        path: "proxyGroups[0].nodeFilters[0].match",
        message: "期望字符串",
      }),
    ]);
  });

  it("rejects rule-provider route sources without provider", () => {
    const diagnostics = parseFailure(
      validConfig.replace("      provider: custom-direct-domain\n", ""),
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "config.field.invalid",
        severity: "error",
        path: "routes[1].source.provider",
        message: "期望字符串",
      }),
    ]);
  });

  it("rejects memberSets keys with invalid id characters", () => {
    const diagnostics = parseFailure(
      validConfig.replace("  region-groups:", '  "Region Group!":'),
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "config.id.invalid",
        severity: "error",
        path: "memberSets.Region Group!",
      }),
    ]);
  });

  it("rejects rule provider sources without a stable id", () => {
    const diagnostics = parseFailure(
      validConfig.replace(
        "      - id: local-direct\n        name: Local Direct",
        "      - name: Local Direct",
      ),
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "config.field.invalid",
        severity: "error",
        path: "ruleProviders[0].sources[0].id",
        message: "期望字符串",
      }),
    ]);
  });

  it("reports invalid YAML as a diagnostic error", () => {
    const diagnostics = parseFailure("schemaVersion: 2\n  bad: [indent");

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "config.yaml.invalid",
        severity: "error",
        path: "config",
      }),
    ]);
  });
});
