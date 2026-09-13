/**
 * planLegacyMigration 迁移分析测试（实施计划 Task 4）：
 * - 嵌入式 v1 夹具：重复成员提取、确定性 slug、policy/file 引用转 ID；
 * - INI 往返等价：v1 renderIni 与 draft → normalize → toRouteKitConfig → renderIni 逐字一致；
 * - 真实蓝本 config/routes.yaml.example 的迁移验收（Phase B 核心）；
 * - 同一配置两次分析结果深度相等（确定性）。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { renderIni } from "../src/index.js";
import { parseRouteKitConfig } from "../src/configDocument.js";
import { normalizeAuthorProjectConfig } from "../src/config/schemaV2/normalize.js";
import { parseAuthorProjectConfigV2 } from "../src/config/schemaV2/parser.js";
import { planLegacyMigration } from "../src/config/schemaV2/migrate.js";
import {
  validateAuthorProjectConfigV2,
  validateNormalizedProject,
} from "../src/config/schemaV2/validate.js";
import { toRouteKitConfig } from "../src/config/schemaV2/toRouteKitConfig.js";
import type { RouteKitProjectConfig } from "../src/types.js";

const PUBLISH_BASE_URL = "https://raw.githubusercontent.com/acme/routes/publish";
const HEALTH_CHECK_URL = "https://probe.test/generate_204";

function legacyFixture(): RouteKitProjectConfig {
  return {
    publishBaseUrl: PUBLISH_BASE_URL,
    defaults: {
      proxyGroups: {
        healthCheck: { url: HEALTH_CHECK_URL, interval: 300, timeout: 5 },
        urlTest: { tolerance: 50 },
      },
      ruleSets: { ruleProviderInterval: 86400, geoipNoResolve: true },
    },
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [
      {
        name: "ACL4SSR Repo",
        url: "https://github.com/ACL4SSR/ACL4SSR.git",
        path: "vendor/ACL4SSR",
        catalog: { dir: "vendor/ACL4SSR/Clash", kind: "list-dir" },
      },
    ],
    customProxyGroups: [
      { name: "🚀 节点选择", type: "select", options: ["🇭🇰 HK 节点", "DIRECT"] },
      {
        name: "🇭🇰 HK 节点",
        type: "url-test",
        options: [],
        nodeFilters: [".*"],
        url: HEALTH_CHECK_URL,
        interval: 300,
        timeout: null,
        tolerance: 50,
      },
      {
        name: "美国 US",
        type: "url-test",
        options: [],
        nodeFilters: [".*"],
        url: HEALTH_CHECK_URL,
        interval: 300,
        timeout: null,
        tolerance: 50,
      },
      { name: "重复 组 One", type: "select", options: ["🇭🇰 HK 节点", "美国 US", "DIRECT"] },
      { name: "重复 组 Two", type: "select", options: ["🇭🇰 HK 节点", "美国 US", "DIRECT"] },
      { name: "重复 组 Three", type: "select", options: ["🇭🇰 HK 节点", "美国 US", "DIRECT"] },
      { name: "独有 Unique", type: "select", options: ["🇭🇰 HK 节点", "REJECT"] },
    ],
    ruleSets: [
      {
        id: "openai",
        policy: "🚀 节点选择",
        section: "海外类目",
        source: { type: "geosite", value: "openai" },
      },
      {
        id: "custom-direct",
        policy: "DIRECT",
        source: {
          type: "rule-provider",
          behavior: "domain",
          file: "Custom_Direct.yaml",
          interval: 86400,
        },
      },
      {
        id: "telegram",
        policy: "重复 组 One",
        source: { type: "geoip", value: "telegram", noResolve: true },
      },
      { id: "final", policy: "🚀 节点选择", source: { type: "final" } },
    ],
    ruleProviders: [
      {
        name: "Custom Direct",
        output: "Custom_Direct.yaml",
        behavior: "domain",
        sources: [
          {
            name: "Local List",
            type: "clash-list",
            path: "config/rules/Custom_Direct.list",
          },
        ],
      },
    ],
  };
}

describe("planLegacyMigration", () => {
  it("extracts one memberSet from three identical option lists and keeps unique lists inline", () => {
    const plan = planLegacyMigration(legacyFixture());

    expect(plan.summary.memberSets).toBe(1);
    expect(plan.draft.memberSets?.["set-1"]?.members).toEqual([
      { group: "hk" },
      { group: "us" },
      { builtin: "DIRECT" },
    ]);
    // 三个重复列表的组改为 preset 引用，独有列表与叶子组保持内联。
    expect(plan.draft.proxyGroups[3]?.members).toEqual([{ preset: "set-1" }]);
    expect(plan.draft.proxyGroups[4]?.members).toEqual([{ preset: "set-1" }]);
    expect(plan.draft.proxyGroups[5]?.members).toEqual([{ preset: "set-1" }]);
    expect(plan.draft.proxyGroups[6]?.members).toEqual([
      { group: "hk" },
      { builtin: "REJECT" },
    ]);
    expect(plan.draft.proxyGroups[0]?.members).toEqual([
      { group: "hk" },
      { builtin: "DIRECT" },
    ]);
    expect(plan.draft.proxyGroups[1]?.members).toEqual([]);
  });

  it("generates deterministic slugs from names with emoji, CJK and spaces", () => {
    const plan = planLegacyMigration(legacyFixture());

    // 全 emoji/中文 → 回退 group-1；emoji 剥离 + 空白折叠 + 去首尾 "-"。
    expect(plan.draft.proxyGroups.map((group) => group.id)).toEqual([
      "group-1",
      "hk",
      "us",
      "one",
      "two",
      "three",
      "unique",
    ]);
    expect(plan.draft.ruleProviders[0]?.id).toBe("custom-direct");
    expect(plan.draft.ruleProviders[0]?.sources[0]?.id).toBe("local-list");
    expect(plan.draft.vendorRepos?.[0]?.id).toBe("acl4ssr-repo");
    // 全局唯一分配（proxyGroups → memberSets → ruleProviders → routes）：
    // 路由 "custom-direct" 与 provider "Custom Direct"（id "custom-direct"）
    // 同名，provider 先分配拿到裸 slug，路由顺延 "-2"，不再跨集合撞名。
    expect(plan.draft.routes.map((route) => route.id)).toEqual([
      "openai",
      "custom-direct-2",
      "telegram",
      "final",
    ]);
  });

  it("maps policy display names to group ids, builtins and provider files to provider ids", () => {
    const plan = planLegacyMigration(legacyFixture());

    expect(plan.draft.routes[0]?.policy).toEqual({ group: "group-1" });
    expect(plan.draft.routes[1]?.policy).toEqual({ builtin: "DIRECT" });
    expect(plan.draft.routes[1]?.source).toEqual({
      type: "rule-provider",
      provider: "custom-direct",
    });
    expect(plan.draft.routes[2]?.policy).toEqual({ group: "one" });
    expect(plan.draft.routes[2]?.source).toEqual({
      type: "geoip",
      value: "telegram",
      noResolve: true,
    });
    // per-route interval 与 defaults.ruleSets.ruleProviderInterval 相同，丢弃无损、不报 issue。
    expect(plan.issues.filter((issue) => issue.code === "migrate.interval.dropped")).toEqual([]);
  });

  it("round-trips to byte-identical INI output", () => {
    const fixture = legacyFixture();
    const plan = planLegacyMigration(fixture);
    const { project } = normalizeAuthorProjectConfig(plan.draft);
    const bridged = toRouteKitConfig(project, {
      publishBaseUrl: fixture.publishBaseUrl,
    });

    expect(renderIni(bridged)).toBe(renderIni(fixture));
    expect(plan.summary).toEqual({
      groups: 7,
      routes: 4,
      providers: 1,
      memberSets: 1,
      issues: 1,
    });
    // 唯一 issue 是 publishBaseUrl 的运行时设置提示。
    expect(plan.issues).toEqual([
      {
        code: "migrate.runtime-setting",
        severity: "info",
        path: "publishBaseUrl",
        message: plan.issues[0]?.message,
      },
    ]);
  });

  it("serializes the draft to schemaVersion: 2 YAML that parses back to the draft", () => {
    const plan = planLegacyMigration(legacyFixture());

    expect(plan.yaml.startsWith("schemaVersion: 2\n")).toBe(true);
    expect(YAML.parse(plan.yaml)).toEqual(plan.draft);
  });

  it("flags unresolved option strings as errors and drops them from the draft", () => {
    const fixture = legacyFixture();
    fixture.customProxyGroups[0] = {
      name: "🚀 节点选择",
      type: "select",
      options: ["freenode-01", "DIRECT"],
    };

    const plan = planLegacyMigration(fixture);

    expect(plan.issues).toContainEqual(
      expect.objectContaining({
        code: "migrate.option.unresolved",
        severity: "error",
        path: "customProxyGroups[0].options[0]",
        related: ["freenode-01"],
      }),
    );
    expect(plan.draft.proxyGroups[0]?.members).toEqual([{ builtin: "DIRECT" }]);
  });

  it("flags URL node filters but keeps them verbatim in the draft", () => {
    const fixture = legacyFixture();
    fixture.customProxyGroups[1] = {
      ...fixture.customProxyGroups[1],
      name: "🇭🇰 HK 节点",
      nodeFilters: ["https://health.example/204"],
    };

    const plan = planLegacyMigration(fixture);

    expect(plan.issues).toContainEqual(
      expect.objectContaining({
        code: "migrate.node-filter.url",
        severity: "error",
        path: "customProxyGroups[1].nodeFilters[0]",
      }),
    );
    expect(plan.draft.proxyGroups[1]?.nodeFilters).toEqual([
      { match: "https://health.example/204" },
    ]);
  });

  it("produces deep-equal drafts for repeated analyses of the same config", () => {
    const first = planLegacyMigration(legacyFixture());
    const second = planLegacyMigration(legacyFixture());

    expect(second.draft).toEqual(first.draft);
    expect(second.yaml).toBe(first.yaml);
    expect(second.issues).toEqual(first.issues);
  });

  it("assigns globally unique ids when a group and a route share a name", () => {
    const talkatoneFixture = () => {
      const fixture = legacyFixture();
      fixture.customProxyGroups.push({
        name: "Talkatone",
        type: "select",
        options: ["DIRECT"],
      });
      fixture.ruleSets.unshift({
        id: "Talkatone",
        policy: "Talkatone",
        source: { type: "geosite", value: "talkatone" },
      });
      return fixture;
    };

    const plan = planLegacyMigration(talkatoneFixture());

    // 组先于路由分配拿到裸 slug "talkatone"，同名路由顺延为 "talkatone-2"，
    // 且路由 policy 仍解析到该组。
    expect(plan.draft.proxyGroups.at(-1)?.id).toBe("talkatone");
    expect(plan.draft.routes[0]?.id).toBe("talkatone-2");
    expect(plan.draft.routes[0]?.policy).toEqual({ group: "talkatone" });

    // proxyGroups / memberSets / ruleProviders / routes 四个集合的 id 全局互不相同。
    const allIds = [
      ...plan.draft.proxyGroups.map((group) => group.id),
      ...Object.keys(plan.draft.memberSets ?? {}),
      ...plan.draft.ruleProviders.map((provider) => provider.id),
      ...plan.draft.routes.map((route) => route.id),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);

    // 确定性：两次独立分析结果一致。
    expect(planLegacyMigration(talkatoneFixture()).draft).toEqual(plan.draft);
  });

  it("migrates the real blueprint config/routes.yaml.example with INI equivalence", () => {
    const blueprintPath = path.resolve("config/routes.yaml.example");
    const v1 = parseRouteKitConfig(readFileSync(blueprintPath, "utf8"));
    const plan = planLegacyMigration(v1);

    expect(plan.summary.groups).toBe(v1.customProxyGroups.length);
    expect(plan.issues.some((issue) => issue.code === "migrate.node-filter.url")).toBe(false);
    expect(Object.keys(plan.draft.memberSets ?? {}).length).toBeGreaterThanOrEqual(1);
    // 蓝本迁移不应产生任何阻断错误（数据源、.mrs、悬空引用均已在蓝本修复）。
    expect(
      plan.issues.filter((issue) => issue.severity === "error"),
    ).toEqual([]);

    const { project } = normalizeAuthorProjectConfig(plan.draft);
    const bridged = toRouteKitConfig(project, {
      publishBaseUrl: v1.publishBaseUrl,
    });
    expect(renderIni(bridged)).toBe(renderIni(v1));
  });

  it("passes the full v2 validation chain with zero errors on the real blueprint", () => {
    const blueprintPath = path.resolve("config/routes.yaml.example");
    const v1 = parseRouteKitConfig(readFileSync(blueprintPath, "utf8"));
    const plan = planLegacyMigration(v1);

    // 完整校验链：parse → 作者配置校验 → normalize → 规范化层校验。
    const parsed = parseAuthorProjectConfigV2(plan.yaml);
    const authorDiagnostics = validateAuthorProjectConfigV2(parsed);
    const { project, diagnostics: normalizeDiagnostics } =
      normalizeAuthorProjectConfig(parsed);
    const normalizedDiagnostics = validateNormalizedProject(project);

    const all = [
      ...authorDiagnostics,
      ...normalizeDiagnostics,
      ...normalizedDiagnostics,
    ];
    // 真实蓝本（52 组，含 16+ 个空 options + nodeFilters 的叶子组）迁移后
    // 必须零 error 才能写盘；warning/info 允许保留。
    expect(all.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });
});
