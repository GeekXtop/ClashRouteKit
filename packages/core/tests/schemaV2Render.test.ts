import { describe, expect, it } from "vitest";
import { renderIni } from "../src/index.js";
import { normalizeAuthorProjectConfig } from "../src/config/schemaV2/normalize.js";
import {
  toRouteKitConfig,
  type RenderRuntimeContext,
} from "../src/config/schemaV2/toRouteKitConfig.js";
import type {
  AuthorProjectConfigV2,
  ProxyGroupV2,
} from "../src/config/schemaV2/types.js";
import type {
  CustomProxyGroup,
  RouteKitConfig,
  RouteKitDefaults,
} from "../src/types.js";

const PUBLISH_BASE_URL = "https://raw.githubusercontent.com/acme/routes/publish";

function baseDefaults(): RouteKitDefaults {
  return {
    proxyGroups: {
      healthCheck: {
        url: "https://probe.example/204",
        interval: 300,
        timeout: 5,
      },
      urlTest: { tolerance: 50 },
    },
    ruleSets: { ruleProviderInterval: 600, geoipNoResolve: false },
  };
}

function baseV2Config(
  leafName = "香港",
  autoOverrides: Partial<ProxyGroupV2> = {},
): AuthorProjectConfigV2 {
  return {
    schemaVersion: 2,
    project: {
      template: { output: "Custom_Clash.ini" },
      defaults: baseDefaults(),
    },
    memberSets: {
      "region-groups": {
        members: [{ group: "hk" }, { group: "us" }],
      },
    },
    proxyGroups: [
      {
        id: "proxy",
        name: "🚀 节点选择",
        type: "select",
        members: [{ preset: "region-groups" }, { builtin: "DIRECT" }],
      },
      {
        id: "auto",
        name: "自动选择",
        type: "url-test",
        members: [{ group: "hk" }, { builtin: "REJECT" }],
        nodeFilters: [{ match: ".*" }],
        ...autoOverrides,
      },
      {
        id: "hk",
        name: leafName,
        type: "select",
        members: [{ builtin: "DIRECT" }],
      },
      {
        id: "us",
        name: "美国",
        type: "select",
        members: [{ builtin: "DIRECT" }],
      },
    ],
    routes: [
      {
        id: "openai",
        policy: { group: "proxy" },
        source: { type: "geosite", value: "openai" },
        section: "海外类目",
      },
      {
        id: "custom-direct",
        policy: { builtin: "DIRECT" },
        source: { type: "rule-provider", provider: "custom-direct-domain" },
      },
      {
        id: "telegram-ip",
        policy: { group: "auto" },
        source: { type: "geoip", value: "telegram", noResolve: true },
      },
      {
        id: "final",
        policy: { group: "proxy" },
        source: { type: "final" },
      },
    ],
    ruleProviders: [
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
    ],
  };
}

function baseLegacyConfig(
  leafName = "香港",
  autoOverrides: Partial<CustomProxyGroup> = {},
): RouteKitConfig {
  return {
    publishBaseUrl: PUBLISH_BASE_URL,
    defaults: baseDefaults(),
    customProxyGroups: [
      { name: "🚀 节点选择", type: "select", options: [leafName, "美国", "DIRECT"] },
      {
        name: "自动选择",
        type: "url-test",
        options: [leafName, "REJECT"],
        nodeFilters: [".*"],
        ...autoOverrides,
      },
      { name: leafName, type: "select", options: ["DIRECT"] },
      { name: "美国", type: "select", options: ["DIRECT"] },
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
          file: "Custom_Direct_Domain.yaml",
        },
      },
      {
        id: "telegram-ip",
        policy: "自动选择",
        source: { type: "geoip", value: "telegram", noResolve: true },
      },
      {
        id: "final",
        policy: "🚀 节点选择",
        source: { type: "final" },
      },
    ],
  };
}

function bridge(
  config: AuthorProjectConfigV2,
  context: RenderRuntimeContext = { publishBaseUrl: PUBLISH_BASE_URL },
): RouteKitConfig {
  return toRouteKitConfig(normalizeAuthorProjectConfig(config).project, context);
}

describe("toRouteKitConfig", () => {
  it("renders INI identical to a handwritten equivalent v1 config", () => {
    const v2Ini = renderIni(bridge(baseV2Config()));
    const v1Ini = renderIni(baseLegacyConfig());

    expect(v2Ini).toBe(v1Ini);
    // 抽样断言关键行，让失败信息可读：memberSets 展开顺序、builtin 成员、
    // rule-provider 经 providerById 解析出 defaults 注入的 interval。
    expect(v2Ini).toContain(
      "ruleset=DIRECT,clash-domain:" +
        PUBLISH_BASE_URL +
        "/rules/Custom_Direct_Domain.yaml,600",
    );
    expect(v2Ini).toContain(
      "custom_proxy_group=自动选择`url-test`[]香港`[]REJECT`.*" +
        "`https://probe.example/204`300,5,50",
    );
  });

  it("maps group references to display names so renames flow through", () => {
    const bridged = bridge(baseV2Config("🇭🇰 香港"));

    expect(bridged.customProxyGroups[0]?.options).toEqual([
      "🇭🇰 香港",
      "美国",
      "DIRECT",
    ]);
    expect(bridged.ruleSets[0]?.policy).toBe("🚀 节点选择");
    expect(bridged.ruleSets[2]?.policy).toBe("自动选择");
    expect(renderIni(bridged)).toBe(renderIni(baseLegacyConfig("🇭🇰 香港")));
  });

  it("maps nodeFilters from { match } objects to v1 string arrays", () => {
    const bridged = bridge(baseV2Config());

    expect(bridged.customProxyGroups[1]?.nodeFilters).toEqual([".*"]);
    expect(bridged.customProxyGroups[0]?.nodeFilters).toEqual([]);
  });

  it("passes health-check overrides through unchanged", () => {
    const overrides = {
      url: "https://custom.example/204",
      interval: 120,
      timeout: null,
      tolerance: null,
    };
    const v2Ini = renderIni(bridge(baseV2Config("香港", overrides)));
    const v1Ini = renderIni(baseLegacyConfig("香港", overrides));

    expect(v2Ini).toBe(v1Ini);
    // timeout/tolerance 的显式置空（null）与继承 defaults 的组渲染一致。
    expect(v2Ini).toContain(
      "custom_proxy_group=自动选择`url-test`[]香港`[]REJECT`.*" +
        "`https://custom.example/204`120",
    );
  });

  it("throws a clear error for a route policy referencing a missing group", () => {
    const config = baseV2Config();
    config.routes = config.routes.filter((route) => route.source.type !== "final");
    config.routes.push({
      id: "final",
      policy: { group: "ghost" },
      source: { type: "final" },
    });

    const { project } = normalizeAuthorProjectConfig(config);
    expect(project.routes[3]?.policy).toEqual({
      group: "ghost",
      groupExists: false,
    });
    expect(() => bridge(config)).toThrowError(/final[\s\S]*ghost/);
  });

  it("throws a clear error for a route referencing a missing rule provider", () => {
    const config = baseV2Config();
    config.routes[1] = {
      id: "custom-direct",
      policy: { builtin: "DIRECT" },
      source: { type: "rule-provider", provider: "ghost-provider" },
    };

    expect(() => bridge(config)).toThrowError(
      /custom-direct[\s\S]*ghost-provider/,
    );
  });

  it("injects publishBaseUrl from the runtime context and defaults to an empty string", () => {
    const bridged = bridge(baseV2Config(), {});
    expect(bridged.publishBaseUrl).toBe("");
    const ini = renderIni(bridged);
    expect(ini).toContain(
      "ruleset=DIRECT,clash-domain:/rules/Custom_Direct_Domain.yaml,600",
    );
  });
});
