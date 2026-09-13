import { describe, expect, it } from "vitest";
import type { Dispatch, SetStateAction } from "react";
import type { ProjectControllerState } from "../../src/projectController.js";
import { createV2ProjectController } from "../../src/projectController.js";
import { createV2Config, createV2Yaml } from "./fixtures.js";
import { updateProject } from "../../src/v2/mutations.js";
import { renderV2PageConfig } from "../../src/v2/renderProject.js";
import { useV2DraftActions } from "../../src/v2/useV2DraftActions.js";

/** useV2DraftActions 不含 React hooks，可在测试里直接以同步 dispatcher 驱动。 */
function createHarness() {
  let state: ProjectControllerState = createV2ProjectController(createV2Yaml());
  const setProject: Dispatch<SetStateAction<ProjectControllerState>> = (action) => {
    state =
      typeof action === "function"
        ? (action as (prev: ProjectControllerState) => ProjectControllerState)(state)
        : action;
  };
  const actions = useV2DraftActions(setProject);
  return {
    actions,
    get: (): ProjectControllerState => state,
    config: () => state.v2!.config,
  };
}

describe("useV2DraftActions", () => {
  it("saveProxyGroup updates fields by stable id and marks the snapshot dirty", () => {
    const { actions, get, config } = createHarness();
    actions.saveProxyGroup("proxy", {
      ...config().proxyGroups[0]!,
      name: "Renamed",
      type: "fallback",
    });

    expect(get().dirty).toBe(true);
    expect(config().proxyGroups[0]).toMatchObject({ id: "proxy", name: "Renamed", type: "fallback" });
    // 引用保持稳定：路由仍指向原组 ID。
    expect(config().routes[0]?.policy).toEqual({ group: "proxy" });
  });

  it("saveRoute rewrites policy and source by stable id", () => {
    const { actions, config } = createHarness();
    actions.saveRoute("geosite-openai", {
      id: "geosite-openai",
      policy: { builtin: "REJECT" },
      source: { type: "rule-provider", provider: "ai" },
    });

    expect(config().routes[0]).toMatchObject({
      id: "geosite-openai",
      policy: { builtin: "REJECT" },
      source: { type: "rule-provider", provider: "ai" },
    });
  });

  it("upsertMemberSet adds a set and removeMemberSet refuses referenced sets", () => {
    const { actions, get, config } = createHarness();

    actions.upsertMemberSet("set-new", [{ group: "auto" }]);
    expect(config().memberSets?.["set-new"]).toEqual({ members: [{ group: "auto" }] });

    // set-stream 仍被组 proxy 引用 → 报错不删除。
    actions.removeMemberSet("set-stream");
    expect(get().status).toBe("error");
    expect(get().message).toContain("set-stream");
    expect(config().memberSets?.["set-stream"]).toBeDefined();

    // 未被引用的集合可直接删除；删掉最后一个集合时字段移除。
    actions.removeMemberSet("set-new");
    expect(config().memberSets?.["set-new"]).toBeUndefined();
  });

  it("updateProvider keys by id, preserves source ids and assigns deterministic ids to new sources", () => {
    const { actions, config } = createHarness();

    actions.updateProvider("ai", {
      sources: [
        // 已有来源原样透传（编辑器往返保留 id）。
        { id: "list", name: "list", type: "clash-list", path: "ai.list" } as never,
        { name: "extra", type: "clash-list", path: "extra.list" } as never,
      ],
    });

    const sources = config().ruleProviders[0]!.sources;
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({ id: "list", path: "ai.list" });
    expect(sources[1]).toMatchObject({ id: "extra", path: "extra.list" });

    // 按显示名与按 ID 命中同一实体。
    actions.updateProvider("AI", { enabled: false });
    expect(config().ruleProviders[0]?.enabled).toBe(false);
  });

  it("addRoute resolves policy display names to group ids and builtin targets", () => {
    const { actions, config, get } = createHarness();

    actions.addRoute({ type: "geosite", value: "netflix" }, "Proxy", "流媒体");
    const added = config().routes.find((route) => route.source.type === "geosite" && route.source.value === "netflix");
    expect(added).toMatchObject({ policy: { group: "proxy" }, section: "流媒体" });

    actions.addGeositeRoute("cn", "DIRECT");
    expect(config().routes.find((route) => "builtin" in route.policy)).toMatchObject({
      policy: { builtin: "DIRECT" },
      source: { type: "geosite", value: "cn" },
    });

    actions.addRoute({ type: "geosite", value: "x" }, "Ghost");
    expect(get().status).toBe("error");
    expect(get().message).toContain("Ghost");
  });

  it("addRoute maps provider outputs to provider ids", () => {
    const { actions, config } = createHarness();
    actions.addRoute({ type: "rule-provider", behavior: "domain", file: "AI_Domain.yaml" }, "Proxy");
    const added = config().routes.find((route) => route.source.type === "rule-provider");
    expect(added?.source).toEqual({ type: "rule-provider", provider: "ai" });
  });

  it("reorderRuleSets applies the requested order through moveRoute", () => {
    const { actions, config } = createHarness();
    actions.reorderRuleSets(["final", "geosite-openai"]);
    expect(config().routes.map((route) => route.id)).toEqual(["final", "geosite-openai"]);
  });

  it("toggleRuleSet is a no-op because v2 routes carry no enabled flag", () => {
    const harness = createHarness();
    const before = harness.get();
    harness.actions.toggleRuleSet("geosite-openai");
    expect(harness.get()).toBe(before);
    expect(harness.get().dirty).toBe(false);
  });

  it("deleteCustomProxyGroup refuses referenced groups and removes unreferenced ones", () => {
    const { actions, get, config } = createHarness();

    actions.deleteCustomProxyGroup("proxy");
    expect(get().status).toBe("error");
    expect(get().message).toContain("route");
    expect(config().proxyGroups.some((group) => group.id === "proxy")).toBe(true);

    // auto 被成员集合 set-stream 引用，同样拒绝删除。
    actions.deleteCustomProxyGroup("auto");
    expect(get().status).toBe("error");
    expect(get().message).toContain("set-stream");

    // 新建组无引用，可删除并回到 ready。
    actions.createCustomProxyGroup();
    expect(get().status).toBe("ready");
    actions.deleteCustomProxyGroup("ProxyGroup");
    expect(config().proxyGroups.some((group) => group.name === "ProxyGroup")).toBe(false);
    expect(get().status).toBe("ready");
  });

  it("writes project defaults and template fields through updateProject", () => {
    const { actions, config } = createHarness();

    actions.setProjectDefaults({ ruleSets: { geoipNoResolve: false } });
    expect(config().project?.defaults).toEqual({ ruleSets: { geoipNoResolve: false } });
    expect(config().project?.template).toEqual({ output: "Custom_Clash.ini" });

    actions.setTemplateField({ output: "Renamed.ini" });
    expect(config().project?.template).toEqual({ output: "Renamed.ini" });
  });

  it("createProvider drafts a disabled provider and selects it", () => {
    const { actions, config, get } = createHarness();
    actions.createProvider();
    const created = config().ruleProviders.at(-1);
    expect(created).toMatchObject({ name: "Provider", enabled: false, sources: [] });
    expect(get().selectedProviderName).toBe("Provider");
  });

  it("createCustomProxyGroup creates a select group with DIRECT default member", () => {
    const { actions, config, get } = createHarness();
    actions.createCustomProxyGroup();
    const created = config().proxyGroups.at(-1);
    expect(created).toMatchObject({
      id: "proxygroup",
      name: "ProxyGroup",
      type: "select",
      members: [{ builtin: "DIRECT" }],
    });
    expect(get().selectedCustomProxyGroupName).toBe("ProxyGroup");
  });
});

describe("updateProject", () => {
  it("merges project fields and creates the project segment when absent", () => {
    const config = createV2Config();
    delete config.project;
    const next = updateProject(config, { defaults: { ruleSets: { geoipNoResolve: true } } });
    expect(next.project).toEqual({ defaults: { ruleSets: { geoipNoResolve: true } } });
  });
});

describe("renderV2PageConfig", () => {
  it("projects v2 entities to display names and keeps provider/vendor data", () => {
    const projection = renderV2PageConfig(createV2Config());

    expect(projection.customProxyGroups.map((group) => group.name)).toEqual(["Proxy", "Auto"]);
    // preset 成员展开为具体引用；组引用解析为显示名。
    expect(projection.customProxyGroups[0]?.options).toEqual(["DIRECT", "Auto"]);
    expect(projection.ruleSets.map((ruleSet) => ruleSet.id)).toEqual(["geosite-openai", "final"]);
    expect(projection.ruleSets[0]).toMatchObject({ policy: "Proxy", source: { type: "geosite", value: "openai" } });
    expect(projection.ruleProviders?.map((provider) => provider.name)).toEqual(["AI"]);
  });

  it("drops dangling references instead of throwing so pages keep rendering", () => {
    const broken = createV2Config();
    broken.routes = [
      ...broken.routes,
      {
        id: "geosite-ghost",
        policy: { group: "ghost" },
        source: { type: "geosite", value: "ghost" },
      },
      {
        id: "provider-ghost",
        policy: { group: "proxy" },
        source: { type: "rule-provider", provider: "ghost" },
      },
    ];
    const projection = renderV2PageConfig(broken);
    expect(projection.ruleSets.map((ruleSet) => ruleSet.id)).toEqual(["geosite-openai", "final"]);
  });
});
