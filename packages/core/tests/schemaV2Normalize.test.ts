import { describe, expect, it } from "vitest";
import { parseAuthorProjectConfigV2 } from "../src/config/schemaV2/parser.js";
import {
  normalizeAuthorProjectConfig,
  type NormalizedProject,
} from "../src/config/schemaV2/normalize.js";

/** 夹具中作为叶子存在的策略组 id，保证组间 group 引用可解析。 */
const LEAF_GROUP_IDS = [
  "hk",
  "us",
  "jp",
  "sg",
  "manual",
  "auto",
  "residential",
  "low-rate",
] as const;

/** 叶子组之后追加的 chat 组下标。 */
const CHAT_GROUP_INDEX = LEAF_GROUP_IDS.length;

function leafGroupsYaml(): string {
  return LEAF_GROUP_IDS.map((id) =>
    [
      `  - id: ${id}`,
      `    name: ${id}`,
      "    type: url-test",
      "    members:",
      "      - builtin: DIRECT",
    ].join("\n"),
  ).join("\n");
}

function chatGroupYaml(chatMembers: string, chatName = "即时通讯"): string {
  return [
    "  - id: chat",
    `    name: ${chatName}`,
    "    type: select",
    "    members:",
    chatMembers,
  ].join("\n");
}

function normalizeYaml(text: string) {
  return normalizeAuthorProjectConfig(parseAuthorProjectConfigV2(text));
}

function normalizeProjectYaml(text: string): NormalizedProject {
  return normalizeYaml(text).project;
}

/** 剥离展示名，使两个仅组名不同的配置可以整体深度比较。 */
function stripDisplayNames(project: NormalizedProject): NormalizedProject {
  return {
    ...project,
    groups: project.groups.map((group) => ({ ...group, name: "" })),
    groupById: new Map(
      [...project.groupById].map(
        ([id, group]) => [id, { ...group, name: "" }] as const,
      ),
    ),
  };
}

describe("normalizeAuthorProjectConfig", () => {
  it("recursively expands nested member sets while preserving order", () => {
    const { project, diagnostics } = normalizeYaml(`
schemaVersion: 2

memberSets:
  region-groups:
    members:
      - group: hk
      - group: us
      - group: jp
      - group: sg
  standard-proxy:
    members:
      - group: manual
      - group: auto
      - preset: region-groups
      - group: residential
      - group: low-rate

proxyGroups:
${leafGroupsYaml()}
${chatGroupYaml("      - preset: standard-proxy")}

routes:
  - id: telegram
    policy:
      group: chat
    source:
      type: geosite
      value: telegram

ruleProviders: []
`);

    expect(diagnostics).toEqual([]);
    const chat = project.groupById.get("chat");
    expect(chat?.members).toEqual([
      { group: "manual" },
      { group: "auto" },
      { group: "hk" },
      { group: "us" },
      { group: "jp" },
      { group: "sg" },
      { group: "residential" },
      { group: "low-rate" },
    ]);
    expect(project.memberSetCache["region-groups"]).toEqual([
      { group: "hk" },
      { group: "us" },
      { group: "jp" },
      { group: "sg" },
    ]);
    expect(project.memberSetCache["standard-proxy"]).toEqual([
      { group: "manual" },
      { group: "auto" },
      { group: "hk" },
      { group: "us" },
      { group: "jp" },
      { group: "sg" },
      { group: "residential" },
      { group: "low-rate" },
    ]);
    // 组与映射保持作者配置原序。
    expect(project.groups.map((group) => group.id)).toEqual([
      ...LEAF_GROUP_IDS,
      "chat",
    ]);
    expect([...project.groupById.keys()]).toEqual([...LEAF_GROUP_IDS, "chat"]);
    // 路由 policy 的 group 引用被解析并标注存在性。
    expect(project.routes[0]?.policy).toEqual({
      group: "chat",
      groupExists: true,
    });
  });

  it("reusing one member set across groups keeps members independent", () => {
    const { project, diagnostics } = normalizeYaml(`
schemaVersion: 2

memberSets:
  region-groups:
    members:
      - group: hk
      - group: us

proxyGroups:
${leafGroupsYaml()}
  - id: direct
    name: 直连
    type: select
    members:
      - preset: region-groups
  - id: relay
    name: 中转
    type: select
    members:
      - preset: region-groups

routes: []
ruleProviders: []
`);

    expect(diagnostics).toEqual([]);
    const direct = project.groupById.get("direct");
    const relay = project.groupById.get("relay");
    const cached = project.memberSetCache["region-groups"];
    expect(direct?.members).toEqual([{ group: "hk" }, { group: "us" }]);
    expect(direct?.members).toEqual(relay?.members);
    // 各自持有独立数组与独立成员对象，与展开缓存互不共享。
    expect(direct?.members).not.toBe(relay?.members);
    expect(direct?.members[0]).not.toBe(relay?.members[0]);
    expect(direct?.members).not.toBe(cached);
    // 修改一组的成员不影响另一组与缓存。
    direct?.members.push({ group: "jp" });
    expect(relay?.members).toHaveLength(2);
    expect(cached).toHaveLength(2);
  });

  it("reports self-referencing presets as a cycle and leaves members empty", () => {
    const { project, diagnostics } = normalizeYaml(`
schemaVersion: 2

memberSets:
  loop:
    members:
      - preset: loop

proxyGroups:
${leafGroupsYaml()}
${chatGroupYaml("      - preset: loop")}

routes: []
ruleProviders: []
`);

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "normalize.preset.cycle",
        severity: "error",
        path: "memberSets.loop",
        related: ["loop"],
      }),
    ]);
    expect(project.memberSetCache.loop).toEqual([]);
    expect(project.groupById.get("chat")?.members).toEqual([]);
  });

  it("reports mutually referencing presets as a single canonical cycle", () => {
    const { project, diagnostics } = normalizeYaml(`
schemaVersion: 2

memberSets:
  a:
    members:
      - group: hk
      - preset: b
  b:
    members:
      - preset: a

proxyGroups:
${leafGroupsYaml()}
${chatGroupYaml("      - preset: a")}

routes: []
ruleProviders: []
`);

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "normalize.preset.cycle",
        severity: "error",
        path: "memberSets.a",
        related: ["a", "b"],
      }),
    ]);
    // 环内递归段留空，环外成员仍保留，整体结构不中断。
    expect(project.memberSetCache.b).toEqual([]);
    expect(project.memberSetCache.a).toEqual([{ group: "hk" }]);
    expect(project.groupById.get("chat")?.members).toEqual([
      { group: "hk" },
    ]);
  });

  it("reports a missing preset reference at the referencing member", () => {
    const { project, diagnostics } = normalizeYaml(`
schemaVersion: 2

proxyGroups:
${leafGroupsYaml()}
${chatGroupYaml("      - preset: ghost\n      - group: manual")}

routes: []
ruleProviders: []
`);

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "normalize.preset.missing",
        severity: "error",
        path: `proxyGroups[${CHAT_GROUP_INDEX}].members[0]`,
        related: ["ghost"],
      }),
    ]);
    // 缺失 preset 位置留空，其余成员照常展开。
    expect(project.groupById.get("chat")?.members).toEqual([
      { group: "manual" },
    ]);
  });

  it("reports a missing preset inside member sets once at its definition", () => {
    const { project, diagnostics } = normalizeYaml(`
schemaVersion: 2

memberSets:
  inner:
    members:
      - preset: ghost
  outer:
    members:
      - preset: inner

proxyGroups:
${leafGroupsYaml()}
${chatGroupYaml("      - preset: outer")}

routes: []
ruleProviders: []
`);

    // 定义处报一次，复用方不再重复报。
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "normalize.preset.missing",
        severity: "error",
        path: "memberSets.inner.members[0]",
        related: ["ghost"],
      }),
    ]);
    expect(project.memberSetCache.inner).toEqual([]);
    expect(project.memberSetCache.outer).toEqual([]);
    expect(project.groupById.get("chat")?.members).toEqual([]);
  });

  it("reports unknown group members and drops them", () => {
    const { project, diagnostics } = normalizeYaml(`
schemaVersion: 2

proxyGroups:
${leafGroupsYaml()}
${chatGroupYaml("      - group: nope\n      - builtin: DIRECT")}

routes: []
ruleProviders: []
`);

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "normalize.group.missing",
        severity: "error",
        path: `proxyGroups[${CHAT_GROUP_INDEX}].members[0]`,
        related: ["nope"],
      }),
    ]);
    expect(project.groupById.get("chat")?.members).toEqual([
      { builtin: "DIRECT" },
    ]);
  });

  it("attributes expanded preset members to the preset reference position", () => {
    const { project, diagnostics } = normalizeYaml(`
schemaVersion: 2

memberSets:
  region-groups:
    members:
      - group: hk
      - group: missing

proxyGroups:
${leafGroupsYaml()}
${chatGroupYaml("      - preset: region-groups")}

routes: []
ruleProviders: []
`);

    // preset 展开产物中的未知组归因到引用 preset 的原始成员位置。
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "normalize.group.missing",
        severity: "error",
        path: `proxyGroups[${CHAT_GROUP_INDEX}].members[0]`,
        related: ["missing"],
      }),
    ]);
    expect(project.groupById.get("chat")?.members).toEqual([
      { group: "hk" },
    ]);
  });

  it("annotates route policy targets with group existence", () => {
    const { project, diagnostics } = normalizeYaml(`
schemaVersion: 2

proxyGroups:
${leafGroupsYaml()}
${chatGroupYaml("      - group: hk")}

routes:
  - id: via-chat
    policy:
      group: chat
    source:
      type: geosite
      value: telegram
  - id: via-ghost
    policy:
      group: ghost
    source:
      type: final
  - id: direct
    policy:
      builtin: DIRECT
    source:
      type: geoip
      value: CN

ruleProviders: []
`);

    // 路由引用完整性属 validate 层：normalize 只标注存在性，不生成诊断。
    expect(diagnostics).toEqual([]);
    expect(project.routes.map((route) => route.policy)).toEqual([
      { group: "chat", groupExists: true },
      { group: "ghost", groupExists: false },
      { builtin: "DIRECT" },
    ]);
  });

  it("keeps resolved members and references stable when display names change", () => {
    const build = (chatName: string): string => `
schemaVersion: 2

memberSets:
  region-groups:
    members:
      - group: hk
      - group: us

proxyGroups:
${leafGroupsYaml()}
${chatGroupYaml("      - preset: region-groups", chatName)}

routes:
  - id: telegram
    policy:
      group: chat
    source:
      type: geosite
      value: telegram

ruleProviders: []
`;

    const renamed = normalizeProjectYaml(build("💬 即时通讯"));
    const renamedAgain = normalizeProjectYaml(build("聊天"));

    // 组 name 改变不影响成员展开、引用解析与映射（name 本身除外）。
    expect(stripDisplayNames(renamed)).toEqual(stripDisplayNames(renamedAgain));
    expect(renamed.groups.map((group) => group.name)).toEqual([
      ...LEAF_GROUP_IDS,
      "💬 即时通讯",
    ]);
  });
});
