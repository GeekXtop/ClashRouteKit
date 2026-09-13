// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Dispatch, SetStateAction } from "react";
import { AppProviders } from "../../src/components/AppProviders.js";
import { LibraryPage } from "../../src/components/LibraryPage.js";
import { RoutingPage } from "../../src/components/RoutingPage.js";
import type { ProjectControllerState } from "../../src/projectController.js";
import { createV2ProjectController } from "../../src/projectController.js";
import { renderV2PageConfig } from "../../src/v2/renderProject.js";
import { serializeV2Project } from "../../src/v2/v2Project.js";
import { useV2DraftActions } from "../../src/v2/useV2DraftActions.js";
import type { useProjectDraftActions } from "../../src/useProjectDraftActions.js";
import { createV2Config, createV2Yaml } from "./fixtures.js";

afterEach(() => {
  cleanup();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

/**
 * v2 编辑会话测试挂具：真实 useV2DraftActions + createV2ProjectController，
 * 驱动 RoutingPage / LibraryPage 的 v2 通路；latest 捕获最新快照供断言。
 */
let latest: { state: ProjectControllerState; actions: ReturnType<typeof useV2DraftActions> };

/** v2 动作束满足 v1 动作的结构类型（duck typing），测试里直接复用。 */
function actionsAsV1(actions: ReturnType<typeof useV2DraftActions>) {
  return actions as unknown as ReturnType<typeof useProjectDraftActions>;
}

function useV2Session(yaml: string): ProjectControllerState {
  const [state, setState] = useState<ProjectControllerState>(() =>
    createV2ProjectController(yaml),
  );
  const actions = useV2DraftActions(setState as Dispatch<SetStateAction<ProjectControllerState>>);
  latest = { state, actions };
  return state;
}

function V2RoutingPage({ yaml }: { yaml?: string }) {
  const state = useV2Session(yaml ?? createV2Yaml());
  if (!state.v2) return null;
  return (
    <AppProviders>
      <RoutingPage
        config={renderV2PageConfig(state.v2.config)}
        selectedRuleSetId={state.selectedRuleSetId}
        draftActions={actionsAsV1(latest.actions)}
        v2={{ state: state.v2, actions: latest.actions }}
        fetcher={vi.fn()}
      />
    </AppProviders>
  );
}

function V2LibraryPage() {
  const state = useV2Session(createV2Yaml());
  if (!state.v2) return null;
  return (
    <AppProviders>
      <LibraryPage
        config={renderV2PageConfig(state.v2.config)}
        draftActions={actionsAsV1(latest.actions)}
        v2={{ state: state.v2, actions: latest.actions }}
        onRefreshConfig={() => {}}
        fetcher={vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes("/api/catalog/sources")) {
            return { ok: true, json: async () => ({ sources: [] }) } as unknown as Response;
          }
          if (url.includes("/api/project/rules")) {
            return { ok: true, json: async () => ({ files: [] }) } as unknown as Response;
          }
          return { ok: true, json: async () => ({}) } as unknown as Response;
        })}
      />
    </AppProviders>
  );
}

function v2Config() {
  return latest.state.v2!.config;
}

function brokenYamlWithMissingPreset(): string {
  const broken = createV2Config();
  broken.proxyGroups = broken.proxyGroups.map((group) =>
    group.id === "proxy"
      ? { ...group, members: [{ preset: "set-stream" }, { preset: "ghost" }] }
      : group,
  );
  return serializeV2Project(broken);
}

describe("RoutingPage under a v2 project", () => {
  it("renders groups and routes from the v2 projection without the read-only notice", () => {
    const { container } = render(<V2RoutingPage />);

    expect(screen.queryByTestId("schema-v2-notice")).toBeNull();
    expect(
      Array.from(container.querySelectorAll(".rk-nav-name"), (node) => node.textContent),
    ).toEqual(["全部规则", "Proxy", "Auto"]);
    expect(screen.getByTestId("route-row-geosite-openai")).toBeTruthy();
    expect(screen.getByTestId("route-row-final")).toBeTruthy();
    // 列表行显示组名；启用开关隐藏（v2 路由无 enabled 语义）。
    expect(screen.getByTestId("route-row-geosite-openai").textContent).toContain("Proxy");
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });

  it("renders the generated INI on demand from the v2 projection", () => {
    render(<V2RoutingPage />);
    fireEvent.click(screen.getByRole("button", { name: "查看生成结果" }));
    expect(screen.getByTestId("ini-result").textContent).toContain("ruleset=Proxy,[]GEOSITE,openai");
  });

  it("keeps v2 group edits local until Save and commits by stable id", async () => {
    const { container } = render(<V2RoutingPage />);
    fireEvent.click(container.querySelector('[data-group-row="Proxy"]')!);

    const dialog = screen.getByRole("dialog", { name: "策略组 · Proxy" });
    expect(dialog.textContent).toContain("集合 · set-stream");

    // 草稿语义：改类型不落库。
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "策略组类型" }));
    fireEvent.click(await screen.findByText("fallback"));
    expect(v2Config().proxyGroups[0]?.type).toBe("select");

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(v2Config().proxyGroups[0]).toMatchObject({ id: "proxy", type: "fallback" });
    expect(latest.state.dirty).toBe(true);
  });

  it("switches the member source between preset sets and inline members", async () => {
    const { container } = render(<V2RoutingPage />);
    fireEvent.click(container.querySelector('[data-group-row="Proxy"]')!);

    // preset 模式 → 内联：展开集合成员（DIRECT + 组 Auto）。
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "成员来源" }));
    fireEvent.click(await screen.findByText("内联成员"));
    expect(screen.getByRole("combobox", { name: "成员 1" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "成员 2" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "添加成员" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(v2Config().proxyGroups[0]?.members).toEqual([
      { builtin: "DIRECT" },
      { group: "auto" },
      { builtin: "DIRECT" },
    ]);
  });

  it("writes a preset member when picking a member set for an inline group", async () => {
    const { container } = render(<V2RoutingPage />);
    fireEvent.click(container.querySelector('[data-group-row="Auto"]')!);

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "成员来源" }));
    fireEvent.click(await screen.findByText("集合 · set-stream"));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(v2Config().proxyGroups[1]?.members).toEqual([{ preset: "set-stream" }]);
  });

  it("discards v2 group edits on cancel", async () => {
    const { container } = render(<V2RoutingPage />);
    fireEvent.click(container.querySelector('[data-group-row="Proxy"]')!);

    fireEvent.change(screen.getByDisplayValue("Proxy"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(v2Config().proxyGroups[0]?.name).toBe("Proxy");
    expect(latest.state.dirty).toBe(false);
  });

  it("creates and edits member sets inline, refusing to delete a referenced set", async () => {
    const { container } = render(<V2RoutingPage />);
    fireEvent.click(container.querySelector('[data-group-row="Proxy"]')!);

    fireEvent.change(screen.getByLabelText("新集合 ID"), { target: { value: "set-new" } });
    fireEvent.click(screen.getByRole("button", { name: "新建集合" }));
    expect(v2Config().memberSets?.["set-new"]).toEqual({ members: [{ builtin: "DIRECT" }] });

    fireEvent.click(screen.getByLabelText("编辑集合 set-new"));
    fireEvent.click(screen.getByRole("button", { name: "添加集合成员" }));
    fireEvent.click(screen.getByRole("button", { name: "保存集合" }));
    expect(v2Config().memberSets?.["set-new"]?.members).toEqual([
      { builtin: "DIRECT" },
      { builtin: "DIRECT" },
    ]);

    // set-stream 仍被组 proxy 引用：mutation 拒绝并写入错误状态。
    fireEvent.click(screen.getByLabelText("删除集合 set-stream"));
    fireEvent.click(await screen.findByText("删除"));
    await waitFor(() => expect(latest.state.status).toBe("error"));
    expect(v2Config().memberSets?.["set-stream"]).toBeDefined();
  });

  it("commits a v2 route with group-id policy only after Save", async () => {
    render(<V2RoutingPage />);

    fireEvent.click(screen.getByLabelText("编辑 geosite-openai"));
    expect(screen.getByRole("dialog", { name: "规则 · geosite-openai" })).toBeTruthy();

    // 下拉显示组名。
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "归属策略组" }));
    fireEvent.click((await screen.findAllByText("Auto")).at(-1)!);
    expect(v2Config().routes[0]?.policy).toEqual({ group: "proxy" });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(v2Config().routes[0]).toMatchObject({ id: "geosite-openai", policy: { group: "auto" } });
  });

  it("maps the rule-provider source to a provider id", async () => {
    render(<V2RoutingPage />);

    fireEvent.click(screen.getByLabelText("编辑 final"));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "来源类型" }));
    fireEvent.click(await screen.findByText("规则源 / 列表"));
    // 下拉列 provider 名，写 provider id（默认已选第一个）。
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "规则提供者" }));
    fireEvent.click((await screen.findAllByText("AI")).at(-1)!);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(v2Config().routes[1]?.source).toEqual({ type: "rule-provider", provider: "ai" });
  });

  it("surfaces v2 diagnostics in the validation bar", () => {
    const { container } = render(<V2RoutingPage yaml={brokenYamlWithMissingPreset()} />);
    // 缺失 preset 同时命中 validate 层与 normalize 层两条 error 诊断。
    expect(screen.getByText(/校验结果：2 错误 · 0 警告 · 0 提示/)).toBeTruthy();
    // 页面仍渲染投影（无效成员剔除，不崩溃）。
    expect(container.querySelector('[data-testid="route-row-geosite-openai"]')).toBeTruthy();
  });
});

describe("LibraryPage under a v2 project", () => {
  it("renders the v2 provider list and toggles enabled with auto-save semantics", async () => {
    render(<V2LibraryPage />);
    await waitFor(() => expect(screen.getByText("AI")).toBeTruthy());
    expect(screen.queryByTestId("schema-v2-notice")).toBeNull();

    fireEvent.click(screen.getByText("AI"));
    const enableSwitch = await screen.findByRole("switch", { name: "启用规则源" });
    expect(enableSwitch.getAttribute("aria-checked")).toBe("true");

    // 普通开关即时保存：无保存按钮，点击即写入 v2 配置。
    fireEvent.click(enableSwitch);
    await waitFor(() => expect(v2Config().ruleProviders[0]?.enabled).toBe(false));
    expect(enableSwitch.getAttribute("aria-checked")).toBe("false");
  });
});
