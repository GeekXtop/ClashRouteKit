import { describe, expect, it } from "vitest";
import { normalizeAuthorProjectConfig } from "../src/config/schemaV2/normalize.js";
import type {
  AuthorProjectConfigV2,
  ProxyGroupV2,
  RouteV2,
  RuleProviderV2,
} from "../src/config/schemaV2/types.js";
import {
  validateAuthorProjectConfigV2,
  validateNormalizedProject,
} from "../src/config/schemaV2/validate.js";

function group(id: string, overrides: Partial<ProxyGroupV2> = {}): ProxyGroupV2 {
  return {
    id,
    name: id,
    type: "select",
    members: [{ builtin: "DIRECT" }],
    ...overrides,
  };
}

function provider(
  id: string,
  overrides: Partial<RuleProviderV2> = {},
): RuleProviderV2 {
  return {
    id,
    name: id,
    output: `${id}.yaml`,
    behavior: "domain",
    sources: [
      {
        id: `${id}-src`,
        name: `${id} source`,
        type: "domain-list-community",
        entry: "google",
      },
    ],
    ...overrides,
  };
}

function route(id: string, overrides: Partial<RouteV2> = {}): RouteV2 {
  return {
    id,
    policy: { group: "proxy" },
    source: { type: "geosite", value: id },
    ...overrides,
  };
}

/** 全绿基线：memberSets、nodeFilter、builtin / preset 成员与各类路由来源齐备。 */
function validConfig(): AuthorProjectConfigV2 {
  return {
    schemaVersion: 2,
    memberSets: {
      regions: { members: [{ group: "hk" }, { group: "us" }] },
    },
    proxyGroups: [
      group("hk"),
      group("us"),
      group("proxy", {
        members: [{ preset: "regions" }, { builtin: "DIRECT" }],
        nodeFilters: [{ match: "^.*hk.*$" }],
      }),
    ],
    routes: [
      route("telegram"),
      route("ads-block", {
        source: { type: "rule-provider", provider: "ads" },
        policy: { builtin: "REJECT" },
      }),
      route("final", {
        policy: { builtin: "DIRECT" },
        source: { type: "final" },
      }),
    ],
    ruleProviders: [provider("ads")],
  };
}

describe("validateAuthorProjectConfigV2", () => {
  it("returns zero diagnostics for a fully valid config on both layers", () => {
    const config = validConfig();
    expect(validateAuthorProjectConfigV2(config)).toEqual([]);

    const { project, diagnostics } = normalizeAuthorProjectConfig(config);
    expect(diagnostics).toEqual([]);
    expect(validateNormalizedProject(project)).toEqual([]);
  });

  it("reports a route policy pointing at a missing group", () => {
    const config = validConfig();
    config.routes[0]!.policy = { group: "ghost" };

    expect(validateAuthorProjectConfigV2(config)).toEqual([
      expect.objectContaining({
        code: "validate.reference.missing",
        severity: "error",
        path: "routes[0].policy.group",
        message: "路由 telegram 引用的策略组 \"ghost\" 不存在",
        related: ["ghost"],
      }),
    ]);
  });

  it("reports a route rule-provider source pointing at a missing provider", () => {
    const config = validConfig();
    config.routes[1]!.source = { type: "rule-provider", provider: "ghost" };

    expect(validateAuthorProjectConfigV2(config)).toEqual([
      expect.objectContaining({
        code: "validate.reference.missing",
        severity: "error",
        path: "routes[1].source.provider",
        related: ["ghost"],
      }),
    ]);
  });

  it("reports typed members referencing missing groups or member sets", () => {
    const config = validConfig();
    config.proxyGroups[2]!.members = [{ group: "ghost" }];
    config.memberSets!.regions = { members: [{ preset: "ghost" }] };

    expect(validateAuthorProjectConfigV2(config)).toEqual([
      expect.objectContaining({
        code: "validate.reference.missing",
        severity: "error",
        path: "proxyGroups[2].members[0]",
        related: ["ghost"],
      }),
      expect.objectContaining({
        code: "validate.reference.missing",
        severity: "error",
        path: "memberSets.regions.members[0]",
        message: `引用的 memberSet "ghost" 不存在`,
        related: ["ghost"],
      }),
    ]);
  });

  it("reports duplicate provider ids inside one collection", () => {
    const config = validConfig();
    config.ruleProviders.push(provider("ads"));

    expect(validateAuthorProjectConfigV2(config)).toEqual([
      expect.objectContaining({
        code: "validate.id.duplicate",
        severity: "error",
        path: "ruleProviders[1].id",
        related: ["ads"],
      }),
    ]);
  });

  it("reports an id reused across collections", () => {
    const config = validConfig();
    config.proxyGroups.push(group("ads"));

    expect(validateAuthorProjectConfigV2(config)).toEqual([
      expect.objectContaining({
        code: "validate.id.duplicate",
        severity: "error",
        path: "ruleProviders[0].id",
        message: `ID "ads" 同时被 proxyGroups 与 ruleProviders 使用`,
        related: ["ads"],
      }),
    ]);
  });

  it("requires at least one source for enabled providers only", () => {
    const config = validConfig();
    config.ruleProviders = [provider("ads", { sources: [] })];

    expect(validateAuthorProjectConfigV2(config)).toEqual([
      expect.objectContaining({
        code: "validate.provider.empty-sources",
        severity: "error",
        path: "ruleProviders[0].sources",
      }),
    ]);

    // 禁用的不完整 provider 允许作为草稿保留。
    config.ruleProviders = [
      provider("ads"),
      provider("draft", { sources: [], enabled: false }),
    ];
    expect(validateAuthorProjectConfigV2(config)).toEqual([]);
  });

  it("rejects non-yaml provider output such as .mrs", () => {
    const config = validConfig();
    config.ruleProviders = [provider("ads", { output: "ads.mrs" })];

    expect(validateAuthorProjectConfigV2(config)).toEqual([
      expect.objectContaining({
        code: "validate.provider.output-extension",
        severity: "error",
        path: "ruleProviders[0].output",
        message: "当前只支持 .yaml provider 输出：ads.mrs",
      }),
    ]);
  });

  it("accepts domain providers fed by all three source kinds (v1 keeps only DOMAIN rules)", () => {
    const config = validConfig();
    config.ruleProviders = [
      provider("ads", {
        sources: [
          {
            id: "ads-list",
            name: "ads list",
            type: "clash-list",
            path: "rules/ads.list",
          },
          {
            id: "ads-provider",
            name: "ads provider",
            type: "clash-provider",
            path: "rules/ads.yaml",
          },
          {
            id: "ads-dlc",
            name: "ads dlc",
            type: "domain-list-community",
            entry: "google",
          },
        ],
      }),
    ];

    // v1 生成链（rules.ts normalizeDomainRule）对任意来源只保留
    // DOMAIN-SUFFIX / DOMAIN，domain provider 接受三类 source 语义无损。
    expect(validateAuthorProjectConfigV2(config)).toEqual([]);
  });

  it("rejects ipcidr providers fed by domain-list-community sources", () => {
    const config = validConfig();
    config.ruleProviders = [
      ...config.ruleProviders,
      provider("ips", {
        behavior: "ipcidr",
        sources: [
          {
            id: "ips-dlc",
            name: "ips dlc",
            type: "domain-list-community",
            entry: "google",
          },
        ],
      }),
    ];

    expect(validateAuthorProjectConfigV2(config)).toEqual([
      expect.objectContaining({
        code: "validate.provider.behavior-mismatch",
        severity: "error",
        path: "ruleProviders[1].sources[0]",
        related: ["ips-dlc"],
      }),
    ]);
  });

  it("rejects empty, URL and invalid-regex node filters", () => {
    const config = validConfig();
    config.proxyGroups[2]!.nodeFilters = [
      { match: "  " },
      { match: "https://example.com/list" },
      { match: "(?i)unterminated" },
    ];

    expect(validateAuthorProjectConfigV2(config)).toEqual([
      expect.objectContaining({
        code: "group.node-filter.empty",
        severity: "error",
        path: "proxyGroups[2].nodeFilters[0].match",
      }),
      expect.objectContaining({
        code: "group.node-filter.url",
        severity: "error",
        path: "proxyGroups[2].nodeFilters[1].match",
        related: ["https://example.com/list"],
      }),
      expect.objectContaining({
        code: "group.node-filter.regex",
        severity: "error",
        path: "proxyGroups[2].nodeFilters[2].match",
      }),
    ]);
  });

  it("allows at most one FINAL route", () => {
    const config = validConfig();
    config.routes.push(
      route("final-2", { policy: { builtin: "DIRECT" }, source: { type: "final" } }),
    );

    expect(validateAuthorProjectConfigV2(config)).toEqual([
      expect.objectContaining({
        code: "validate.route.final-count",
        severity: "error",
        path: "routes",
        related: ["final", "final-2"],
      }),
    ]);
  });
});

describe("validateNormalizedProject", () => {
  it("reports circular group references as a single canonical cycle", () => {
    const config = validConfig();
    config.proxyGroups = [
      group("a", { members: [{ group: "b" }] }),
      group("b", { members: [{ group: "a" }] }),
    ];

    const { project } = normalizeAuthorProjectConfig(config);
    expect(validateNormalizedProject(project)).toEqual([
      expect.objectContaining({
        code: "validate.group.cycle",
        severity: "error",
        path: "proxyGroups.a",
        message: "策略组存在循环引用：a -> b",
        related: ["a", "b"],
      }),
    ]);
  });

  it("reports groups whose members expand to nothing without node filters", () => {
    const config = validConfig();
    config.proxyGroups = [
      ...config.proxyGroups,
      group("lonely", { members: [{ group: "ghost" }] }),
    ];

    const { project } = normalizeAuthorProjectConfig(config);
    expect(validateNormalizedProject(project)).toEqual([
      expect.objectContaining({
        code: "validate.group.empty-members",
        severity: "error",
        path: "proxyGroups.lonely",
        message: "策略组 lonely 展开后没有任何成员，且未配置节点过滤器",
      }),
    ]);
  });

  it("allows filter-only groups with no members (v1 subscription node filter)", () => {
    const config = validConfig();
    config.proxyGroups = [
      ...config.proxyGroups,
      // v1 常态：空 options + nodeFilters 的 url-test 叶子组，按过滤器选订阅节点。
      group("filtered-hk", {
        type: "url-test",
        members: [],
        nodeFilters: [{ match: ".*" }],
      }),
    ];

    const { project, diagnostics } = normalizeAuthorProjectConfig(config);
    // normalize 层对空成员 + 过滤器的组不报任何诊断。
    expect(diagnostics).toEqual([]);
    expect(validateNormalizedProject(project)).toEqual([]);
  });

  it("treats builtin-only groups as non-empty", () => {
    const config = validConfig();
    config.proxyGroups = [group("direct", { members: [{ builtin: "DIRECT" }] })];

    const { project } = normalizeAuthorProjectConfig(config);
    expect(validateNormalizedProject(project)).toEqual([]);
  });
});
