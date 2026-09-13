import type { AuthorProjectConfigV2 } from "@clash-route-kit/core";
import { serializeV2Project } from "../../src/v2/v2Project.js";

/**
 * v2 测试夹具：一个能通过完整装载链（parse → validate → normalize →
 * validateNormalized）的最小作者配置。
 */
export function createV2Config(): AuthorProjectConfigV2 {
  return {
    schemaVersion: 2,
    project: { template: { output: "Custom_Clash.ini" } },
    memberSets: {
      "set-stream": { members: [{ builtin: "DIRECT" }, { group: "auto" }] },
    },
    proxyGroups: [
      { id: "proxy", name: "Proxy", type: "select", members: [{ preset: "set-stream" }] },
      { id: "auto", name: "Auto", type: "url-test", members: [], nodeFilters: [{ match: ".*" }] },
    ],
    routes: [
      {
        id: "geosite-openai",
        policy: { group: "proxy" },
        source: { type: "geosite", value: "openai" },
      },
      { id: "final", policy: { builtin: "DIRECT" }, source: { type: "final" } },
    ],
    ruleProviders: [
      {
        id: "ai",
        name: "AI",
        output: "AI_Domain.yaml",
        behavior: "domain",
        enabled: true,
        sources: [{ id: "list", name: "list", type: "clash-list", path: "ai.list" }],
      },
    ],
  };
}

/** 夹具对应的合法 v2 YAML 文本（schemaVersion: 2 置顶）。 */
export function createV2Yaml(): string {
  return serializeV2Project(createV2Config());
}
