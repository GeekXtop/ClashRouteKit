import { describe, expect, it } from "vitest";
import type { AuthorProjectConfigV2, ProxyGroupV2, TypedMember } from "@clash-route-kit/core";
import {
  addProxyGroup,
  addRoute,
  addRuleProvider,
  createProxyGroup,
  createRuleProvider,
  moveRoute,
  removeMemberSet,
  removeProxyGroup,
  removeRoute,
  removeRuleProvider,
  setRuleProviderEnabled,
  updateProxyGroup,
  updateRoute,
  updateRuleProvider,
  upsertMemberSet,
} from "../../src/v2/mutations.js";

function createV2Config(): AuthorProjectConfigV2 {
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

describe("proxy group mutations", () => {
  it("creates deterministic group drafts with slug ids and display-name suffixes", () => {
    const config = createV2Config();
    const first = createProxyGroup(config);
    expect(first).toMatchObject({ id: "proxygroup", name: "ProxyGroup", type: "select" });
    expect(first.members).toEqual([{ builtin: "DIRECT" }]);

    const second = createProxyGroup(addProxyGroup(config, first), "url-test");
    expect(second).toMatchObject({ id: "proxygroup-2", name: "ProxyGroup-2", type: "url-test" });
    expect(second.members).toEqual([]);
    expect(second.nodeFilters).toEqual([{ match: ".*" }]);
  });

  it("adds proxy groups with deep-cloned entities", () => {
    const config = createV2Config();
    const group: ProxyGroupV2 = {
      id: "solo",
      name: "Solo",
      type: "select",
      members: [{ group: "proxy" }],
    };
    const next = addProxyGroup(config, group);
    group.members.push({ builtin: "REJECT" });
    expect(next.proxyGroups.at(-1)).toEqual({
      id: "solo",
      name: "Solo",
      type: "select",
      members: [{ group: "proxy" }],
    });
    expect(config.proxyGroups).toHaveLength(2);
  });

  it("rejects empty, invalid, and duplicate ids (including cross-collection)", () => {
    const config = createV2Config();
    expect(() => addProxyGroup(config, { id: "  ", name: "X", type: "select", members: [] })).toThrow(
      "ProxyGroup id is required",
    );
    expect(() => addProxyGroup(config, { id: "Bad Id!", name: "X", type: "select", members: [] })).toThrow(
      'id "Bad Id!" 无效',
    );
    expect(() => addProxyGroup(config, { id: "proxy", name: "X", type: "select", members: [] })).toThrow(
      'ID "proxy" already exists',
    );
    // 跨集合撞名同样拒绝：final 已被路由占用。
    expect(() => addProxyGroup(config, { id: "final", name: "X", type: "select", members: [] })).toThrow(
      'ID "final" already exists',
    );
  });

  it("updates fields by id while keeping the stable id and original untouched", () => {
    const config = createV2Config();
    const next = updateProxyGroup(config, "proxy", {
      name: "Renamed",
      id: "hijack",
    } as Partial<ProxyGroupV2>);
    expect(next.proxyGroups.find((group) => group.id === "proxy")?.name).toBe("Renamed");
    expect(next.proxyGroups.find((group) => group.id === "proxy")?.id).toBe("proxy");
    expect(config.proxyGroups.find((group) => group.id === "proxy")?.name).toBe("Proxy");
  });

  it("returns the same reference when updating a missing group id", () => {
    const config = createV2Config();
    expect(updateProxyGroup(config, "ghost", { name: "X" })).toBe(config);
  });

  it("removes unreferenced groups and keeps the original config intact", () => {
    const config = createV2Config();
    const next = removeProxyGroup(addProxyGroup(config, createProxyGroup(config)), "proxygroup");
    expect(next.proxyGroups.map((group) => group.id)).toEqual(["proxy", "auto"]);
    expect(config.proxyGroups).toHaveLength(2);
  });

  it("refuses to remove groups referenced by routes, members, or memberSets", () => {
    const config = createV2Config();
    expect(() => removeProxyGroup(config, "proxy")).toThrow(
      "proxy group is still referenced by route geosite-openai: proxy",
    );
    // set-stream 成员引用了 auto（路由检查未命中时落到 memberSet 检查）。
    expect(() => removeProxyGroup(config, "auto")).toThrow(
      "proxy group is still referenced by memberSet set-stream: auto",
    );
    // 无路由引用时，其他策略组成员的引用同样阻止删除。
    const rerouted = {
      ...config,
      routes: config.routes.map((route) =>
        route.id === "geosite-openai" ? { ...route, policy: { group: "auto" } } : route,
      ),
    };
    const withChild = addProxyGroup(rerouted, {
      id: "child",
      name: "Child",
      type: "select",
      members: [{ group: "proxy" }],
    });
    expect(() => removeProxyGroup(withChild, "proxy")).toThrow(
      "proxy group is still referenced by child: proxy",
    );
  });

  it("returns the same reference when removing a missing group id", () => {
    const config = createV2Config();
    expect(removeProxyGroup(config, "ghost")).toBe(config);
  });
});

describe("route mutations", () => {
  it("adds routes with deterministic slug ids and inserts before FINAL", () => {
    const config = createV2Config();
    const next = addRoute(config, {
      policy: { group: "proxy" },
      source: { type: "geosite", value: "netflix" },
    });
    expect(next.routes.map((route) => route.id)).toEqual([
      "geosite-openai",
      "geosite-netflix",
      "final",
    ]);
  });

  it("suffixes conflicting route ids and appends FINAL routes at the end", () => {
    const config = createV2Config();
    const duplicated = addRoute(config, {
      policy: { group: "proxy" },
      source: { type: "geosite", value: "openai" },
    });
    expect(duplicated.routes[1]?.id).toBe("geosite-openai-2");

    const withFinal = addRoute(duplicated, {
      policy: { builtin: "REJECT" },
      source: { type: "final" },
    });
    expect(withFinal.routes.at(-1)?.id).toBe("final-final");
  });

  it("derives the same id from the same source on separate runs", () => {
    const params = {
      policy: { group: "proxy" } as const,
      source: { type: "geosite", value: "OpenAI Suite!" } as const,
    };
    const first = addRoute(createV2Config(), params).routes.find(
      (route) => route.id === "geosite-openai-suite",
    )?.id;
    const second = addRoute(createV2Config(), params).routes.find(
      (route) => route.id === "geosite-openai-suite",
    )?.id;
    expect(first).toBe(second);
    expect(first).toBe("geosite-openai-suite");
  });

  it("updates route fields by id and ignores id changes", () => {
    const config = createV2Config();
    const next = updateRoute(config, "geosite-openai", {
      policy: { builtin: "REJECT" },
      section: "AI",
      id: "hijack",
    } as Partial<{ policy: { builtin: "REJECT" }; section: string; id: string }>);
    expect(next.routes[0]).toEqual({
      id: "geosite-openai",
      policy: { builtin: "REJECT" },
      source: { type: "geosite", value: "openai" },
      section: "AI",
    });
    expect(updateRoute(config, "ghost", { section: "X" })).toBe(config);
  });

  it("removes routes and no-ops on missing ids", () => {
    const config = createV2Config();
    expect(removeRoute(config, "geosite-openai").routes.map((route) => route.id)).toEqual(["final"]);
    expect(removeRoute(config, "ghost")).toBe(config);
  });

  it("moves routes with index clamping and no-ops on missing ids", () => {
    const config = createV2Config();
    expect(moveRoute(config, "final", 0).routes.map((route) => route.id)).toEqual([
      "final",
      "geosite-openai",
    ]);
    // 越界收紧到末尾：from === to 时返回原引用。
    expect(moveRoute(config, "final", 99)).toBe(config);
    expect(moveRoute(config, "geosite-openai", -5).routes.map((route) => route.id)).toEqual([
      "geosite-openai",
      "final",
    ]);
    expect(moveRoute(config, "ghost", 0)).toBe(config);
  });
});

describe("rule provider mutations", () => {
  it("creates disabled provider drafts with deterministic ids", () => {
    const config = createV2Config();
    const first = createRuleProvider(config);
    expect(first).toMatchObject({
      id: "provider",
      name: "Provider",
      output: "Provider_Domain.yaml",
      behavior: "domain",
      enabled: false,
      sources: [],
    });
    const second = createRuleProvider(addRuleProvider(config, first));
    expect(second).toMatchObject({ id: "provider-2", name: "Provider-2" });
  });

  it("adds providers and rejects duplicate ids, outputs, and missing fields", () => {
    const config = createV2Config();
    const draft = createRuleProvider(config);
    const next = addRuleProvider(config, draft);
    expect(next.ruleProviders).toHaveLength(2);

    expect(() => addRuleProvider(config, { ...draft, id: "ai" })).toThrow('ID "ai" already exists');
    expect(() =>
      addRuleProvider(config, { ...draft, id: "fresh", output: "AI_Domain.yaml" }),
    ).toThrow("Rule provider output already exists: AI_Domain.yaml");
    expect(() => addRuleProvider(config, { ...draft, name: "  " })).toThrow(
      "Rule provider name is required",
    );
    expect(() => addRuleProvider(config, { ...draft, output: " " })).toThrow(
      "Rule provider output is required",
    );
  });

  it("updates providers by id, ignores id changes, and no-ops on missing ids", () => {
    const config = createV2Config();
    const next = updateRuleProvider(config, "ai", {
      behavior: "ipcidr",
      id: "hijack",
    } as Partial<{ behavior: "ipcidr"; id: string }>);
    expect(next.ruleProviders.find((provider) => provider.id === "ai")?.behavior).toBe("ipcidr");
    expect(updateRuleProvider(config, "ghost", { behavior: "classical" })).toBe(config);
  });

  it("removes providers without reference checks (dangling routes surface at save)", () => {
    const config = createV2Config();
    const withRoute = addRoute(config, {
      policy: { group: "proxy" },
      source: { type: "rule-provider", provider: "ai" },
    });
    const next = removeRuleProvider(withRoute, "ai");
    expect(next.ruleProviders).toEqual([]);
    expect(withRoute.routes.find((route) => route.source.type === "rule-provider")).toMatchObject({
      source: { type: "rule-provider", provider: "ai" },
    });
  });

  it("toggles provider enabled state by id", () => {
    const config = createV2Config();
    expect(setRuleProviderEnabled(config, "ai", false).ruleProviders[0]?.enabled).toBe(false);
    expect(setRuleProviderEnabled(config, "ghost", false)).toBe(config);
  });
});

describe("memberSet mutations", () => {
  it("upserts member sets, creating the record when absent", () => {
    const config = createV2Config();
    const added = upsertMemberSet(config, "set-extra", [{ builtin: "REJECT" }]);
    expect(added.memberSets?.["set-extra"]).toEqual({ members: [{ builtin: "REJECT" }] });

    const bare = { ...createV2Config(), memberSets: undefined };
    const created = upsertMemberSet(bare, "set-only", [{ group: "proxy" }]);
    expect(created.memberSets?.["set-only"]).toEqual({ members: [{ group: "proxy" }] });
  });

  it("replaces members of an existing set with deep clones", () => {
    const config = createV2Config();
    const members: TypedMember[] = [{ group: "auto" }];
    const next = upsertMemberSet(config, "set-stream", members);
    members.push({ builtin: "REJECT" });
    expect(next.memberSets?.["set-stream"]?.members).toEqual([{ group: "auto" }]);
    expect(config.memberSets?.["set-stream"]?.members).toHaveLength(2);
  });

  it("rejects invalid or colliding set ids on create", () => {
    const config = createV2Config();
    expect(() => upsertMemberSet(config, "  ", [])).toThrow("memberSet id is required");
    expect(() => upsertMemberSet(config, "Bad Set!", [])).toThrow('id "Bad Set!" 无效');
    expect(() => upsertMemberSet(config, "proxy", [])).toThrow('ID "proxy" already exists');
  });

  it("removes unreferenced sets and clears the record when the last one goes", () => {
    const config = createV2Config();
    const withSolo = upsertMemberSet(config, "set-solo", [{ builtin: "DIRECT" }]);
    const removed = removeMemberSet(withSolo, "set-solo");
    expect(Object.keys(removed.memberSets ?? {})).toEqual(["set-stream"]);

    const bare = upsertMemberSet({ ...createV2Config(), memberSets: undefined }, "set-only", []);
    const cleared = removeMemberSet(bare, "set-only");
    expect(cleared.memberSets).toBeUndefined();
  });

  it("refuses to remove sets referenced by groups or other sets", () => {
    const config = createV2Config();
    expect(() => removeMemberSet(config, "set-stream")).toThrow(
      "memberSet is still referenced by proxy group proxy: set-stream",
    );
    // 无策略组引用时，其他 memberSet 的 preset 引用同样阻止删除。
    const directMembers: TypedMember[] = [{ builtin: "DIRECT" }];
    const noGroupRef = {
      ...config,
      proxyGroups: config.proxyGroups.map((group) =>
        group.id === "proxy" ? { ...group, members: directMembers } : group,
      ),
    };
    const chained = upsertMemberSet(noGroupRef, "set-a", [{ preset: "set-stream" }]);
    expect(() => removeMemberSet(chained, "set-stream")).toThrow(
      "memberSet is still referenced by memberSet set-a: set-stream",
    );
  });

  it("returns the same reference when removing a missing set", () => {
    const config = createV2Config();
    expect(removeMemberSet(config, "ghost")).toBe(config);
  });
});
