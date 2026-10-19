import { describe, expect, it } from "vitest";
import {
  isPlausibleDomain,
  parseDomainEntry,
  parseRuleEntry,
  simulateDomainRoute,
  type DomainRouteInput,
} from "../src/index.js";
import type { MemberSet, ProxyGroupV2, RouteV2 } from "../src/index.js";

function group(
  id: string,
  name: string,
  type: ProxyGroupV2["type"],
  members: ProxyGroupV2["members"],
): ProxyGroupV2 {
  return { id, name, type, members };
}

function route(id: string, policy: RouteV2["policy"], source: RouteV2["source"]): RouteV2 {
  return { id, policy, source };
}

function baseInput(overrides: Partial<DomainRouteInput> = {}): DomainRouteInput {
  return {
    domain: "www.openai.com",
    routes: [],
    proxyGroups: [],
    memberSets: {},
    providerEntries: {},
    geositeEntries: {},
    ...overrides,
  };
}

describe("parseDomainEntry（domain behavior 载荷）", () => {
  it("识别 +.x 后缀与裸精确，值归一小写", () => {
    expect(parseDomainEntry("+.Example.COM")).toEqual({ kind: "suffix", value: "example.com" });
    expect(parseDomainEntry("Example.com")).toEqual({ kind: "exact", value: "example.com" });
  });

  it("空串与非领域形状返回 null", () => {
    expect(parseDomainEntry("")).toBeNull();
    expect(parseDomainEntry("  ")).toBeNull();
    expect(parseDomainEntry("DOMAIN,x.com")).toBeNull();
  });
});

describe("parseRuleEntry（classical 规则串 / geosite 转换串）", () => {
  it("识别 DOMAIN / DOMAIN-SUFFIX / DOMAIN-KEYWORD", () => {
    expect(parseRuleEntry("DOMAIN,b.com")).toEqual({ kind: "exact", value: "b.com" });
    expect(parseRuleEntry("DOMAIN-SUFFIX,A.com")).toEqual({ kind: "suffix", value: "a.com" });
    expect(parseRuleEntry("DOMAIN-KEYWORD,OpenAI")).toEqual({ kind: "keyword", value: "openai" });
  });

  it("非域名规则返回 null", () => {
    expect(parseRuleEntry("IP-CIDR,1.2.3.0/24")).toBeNull();
    expect(parseRuleEntry("GEOIP,CN")).toBeNull();
    expect(parseRuleEntry("no-comma")).toBeNull();
  });
});

describe("isPlausibleDomain", () => {
  it("接受普通域名与纯关键词", () => {
    expect(isPlausibleDomain("www.a.com")).toBe(true);
    expect(isPlausibleDomain("openai")).toBe(true);
  });

  it("拒绝空串、空白、路径、端口、非 ASCII", () => {
    for (const bad of ["", "a b.com", "a/b", "a:b", "中文.cn", ".a.com"]) {
      expect(isPlausibleDomain(bad), bad).toBe(false);
    }
  });
});

describe("simulateDomainRoute 匹配谓词", () => {
  const suffixRoute = route("r-suffix", { builtin: "DIRECT" }, { type: "geosite", value: "tags" });

  it("后缀命中本域与多级子域，不命中公共后缀撞名", () => {
    const input = baseInput({
      geositeEntries: { tags: ["DOMAIN-SUFFIX,example.com"] },
      routes: [suffixRoute],
    });
    expect(simulateDomainRoute({ ...input, domain: "example.com" }).status).toBe("matched");
    expect(simulateDomainRoute({ ...input, domain: "a.b.example.com" }).status).toBe("matched");
    expect(simulateDomainRoute({ ...input, domain: "notexample.com" }).status).toBe("unmatched");
  });

  it("精确只全等；关键词子串", () => {
    const exactInput = baseInput({
      geositeEntries: { tags: ["DOMAIN,example.com"] },
      routes: [suffixRoute],
    });
    expect(simulateDomainRoute({ ...exactInput, domain: "example.com" }).status).toBe("matched");
    expect(simulateDomainRoute({ ...exactInput, domain: "x.example.com" }).status).toBe("unmatched");
    const keywordInput = baseInput({
      geositeEntries: { tags: ["DOMAIN-KEYWORD,openai"] },
      routes: [suffixRoute],
    });
    expect(simulateDomainRoute({ ...keywordInput, domain: "api.openai.com" }).status).toBe("matched");
  });

  it("大小写不敏感（域名与条目两侧）", () => {
    const result = simulateDomainRoute(
      baseInput({
        domain: "WWW.OpenAI.COM",
        geositeEntries: { tags: ["DOMAIN-SUFFIX,OpenAI.com"] },
        routes: [suffixRoute],
      }),
    );
    expect(result.status).toBe("matched");
  });
});

describe("simulateDomainRoute 源类型", () => {
  it("domain behavior provider：+.x 命中", () => {
    const result = simulateDomainRoute(
      baseInput({
        domain: "x.a.com",
        routes: [route("r1", { builtin: "DIRECT" }, { type: "rule-provider", provider: "p1" })],
        providerEntries: { p1: { behavior: "domain", entries: ["+.a.com"] } },
      }),
    );
    expect(result.status).toBe("matched");
    expect(result.matched?.label).toBe("provider:p1");
  });

  it("classical provider：DOMAIN-SUFFIX 命中，IP-CIDR 行忽略", () => {
    const result = simulateDomainRoute(
      baseInput({
        routes: [route("r1", { builtin: "DIRECT" }, { type: "rule-provider", provider: "p1" })],
        providerEntries: {
          p1: { behavior: "classical", entries: ["IP-CIDR,1.2.3.0/24", "DOMAIN-SUFFIX,openai.com"] },
        },
      }),
    );
    expect(result.status).toBe("matched");
  });

  it("ipcidr provider 整条 skipped(ip-only)；geoip 路由 skipped", () => {
    const input = baseInput({
      routes: [
        route("r1", { builtin: "DIRECT" }, { type: "rule-provider", provider: "p1" }),
        route("r2", { builtin: "DIRECT" }, { type: "geoip", value: "cn" }),
        route("final", { builtin: "DIRECT" }, { type: "final" }),
      ],
      providerEntries: { p1: { behavior: "ipcidr", entries: ["1.2.3.0/24"] } },
    });
    const result = simulateDomainRoute(input);
    expect(result.status).toBe("matched");
    expect(result.matched?.routeId).toBe("final");
    expect(result.trace[0]).toMatchObject({ routeId: "r1", outcome: { kind: "skipped" } });
    expect(result.trace[1]).toMatchObject({ routeId: "r2", outcome: { kind: "skipped" } });
  });

  it("provider 输出缺失与 geosite tag 缺失分别 skipped，落到后续路由", () => {
    const result = simulateDomainRoute(
      baseInput({
        routes: [
          route("r1", { builtin: "DIRECT" }, { type: "rule-provider", provider: "missing" }),
          route("r2", { builtin: "DIRECT" }, { type: "geosite", value: "nope" }),
          route("final", { builtin: "DIRECT" }, { type: "final" }),
        ],
        providerEntries: { missing: { behavior: "domain", entries: null } },
        geositeEntries: { nope: null },
      }),
    );
    expect(result.matched?.routeId).toBe("final");
    expect(result.trace[0]?.outcome).toEqual({ kind: "skipped", reason: expect.stringContaining("generate") });
    expect(result.trace[1]?.outcome).toEqual({ kind: "skipped", reason: expect.stringContaining("vendor") });
  });
});

describe("simulateDomainRoute 顺序与即停", () => {
  it("第 2 条命中：trace = [miss, hit, not-evaluated]", () => {
    const result = simulateDomainRoute(
      baseInput({
        domain: "b.com",
        routes: [
          route("r1", { builtin: "DIRECT" }, { type: "geosite", value: "tags-a" }),
          route("r2", { builtin: "DIRECT" }, { type: "geosite", value: "tags-b" }),
          route("r3", { builtin: "DIRECT" }, { type: "final" }),
        ],
        geositeEntries: {
          "tags-a": ["DOMAIN-SUFFIX,a.com"],
          "tags-b": ["DOMAIN-SUFFIX,b.com"],
        },
      }),
    );
    expect(result.status).toBe("matched");
    expect(result.matched?.index).toBe(1);
    expect(result.trace.map((row) => row.outcome.kind)).toEqual(["miss", "hit", "not-evaluated"]);
  });

  it("无 final 且全 miss → unmatched", () => {
    const result = simulateDomainRoute(
      baseInput({
        routes: [route("r1", { builtin: "DIRECT" }, { type: "geosite", value: "tags" })],
        geositeEntries: { tags: ["DOMAIN-SUFFIX,other.com"] },
      }),
    );
    expect(result.status).toBe("unmatched");
    expect(result.matched).toBeUndefined();
    expect(result.trace[0]?.outcome.kind).toBe("miss");
  });
});

describe("simulateDomainRoute 策略链", () => {
  const memberSets: Record<string, MemberSet> = {
    s1: { members: [{ builtin: "DIRECT" }] },
  };

  it("builtin DIRECT → policyLabel DIRECT、terminals [direct]", () => {
    const result = simulateDomainRoute(
      baseInput({
        routes: [route("r1", { builtin: "DIRECT" }, { type: "final" })],
      }),
    );
    expect(result.matched?.policyLabel).toBe("DIRECT");
    expect(result.matched?.possibleTerminals).toEqual(["direct"]);
    expect(result.matched?.chain).toEqual([]);
  });

  it("组链经 id 解析、显示名输出、preset 递归、终点去重", () => {
    const proxyGroups = [
      group("g1", "AI 策略", "select", [{ group: "g2" }, { builtin: "REJECT" }, { preset: "s1" }]),
      group("g2", "自动出口", "url-test", [{ builtin: "DIRECT" }]),
    ];
    const result = simulateDomainRoute(
      baseInput({
        routes: [route("r1", { group: "g1" }, { type: "final" })],
        proxyGroups,
        memberSets,
      }),
    );
    expect(result.matched?.policyLabel).toBe("AI 策略");
    expect(result.matched?.chain).toEqual([
      { id: "g1", name: "AI 策略", type: "select" },
      { id: "g2", name: "自动出口", type: "url-test" },
    ]);
    // 依 spec §3：任何策略组都是运行时决定（含 url-test），成员递归收集钉死终点
    expect(result.matched?.possibleTerminals).toEqual([
      "runtime-select:AI 策略",
      "runtime-select:自动出口",
      "direct",
      "reject",
    ]);
  });

  it("组互引不死循环", () => {
    const proxyGroups = [
      group("g1", "A", "select", [{ group: "g2" }]),
      group("g2", "B", "select", [{ group: "g1" }]),
    ];
    const result = simulateDomainRoute(
      baseInput({
        routes: [route("r1", { group: "g1" }, { type: "final" })],
        proxyGroups,
        memberSets,
      }),
    );
    expect(result.matched?.possibleTerminals).toEqual(["runtime-select:A", "runtime-select:B"]);
  });

  it("memberSet 自引用与互引不死循环", () => {
    const result = simulateDomainRoute(
      baseInput({
        routes: [route("r1", { group: "g1" }, { type: "final" })],
        proxyGroups: [group("g1", "A", "select", [{ preset: "s1" }])],
        memberSets: {
          s1: { members: [{ preset: "s2" }, { builtin: "DIRECT" }] },
          s2: { members: [{ preset: "s1" }, { builtin: "REJECT" }] },
        },
      }),
    );
    // 遍历序：g1 标签 → s1 → s2（REJECT 先收）→ 回到 s1 的 DIRECT
    expect(result.matched?.possibleTerminals).toEqual(["runtime-select:A", "reject", "direct"]);
  });

  it("policy 引用不存在的组按 unmatched 组名兜底不抛异常", () => {
    const result = simulateDomainRoute(
      baseInput({
        routes: [route("r1", { group: "ghost" }, { type: "final" })],
      }),
    );
    expect(result.matched?.policyLabel).toBe("ghost");
    expect(result.matched?.possibleTerminals).toEqual(["runtime-select:ghost"]);
  });
});
