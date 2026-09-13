// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { AppProviders } from "../src/components/AppProviders.js";
import { RoutingPage } from "../src/components/RoutingPage.js";
import type { useProjectDraftActions } from "../src/useProjectDraftActions.js";

afterEach(() => {
  cleanup();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

const config: RouteKitProjectConfig = {
  publishBaseUrl: "http://127.0.0.1:8787",
  template: { output: "Custom_Clash.ini" },
  vendorRepos: [],
  customProxyGroups: [
    { name: "Proxy", type: "select", options: ["HK", "DIRECT"] },
    { name: "HK", type: "url-test", options: [], nodeFilters: ["(港|HK)"] },
  ],
  ruleSets: [
    { id: "geosite-gfw", policy: "Proxy", section: "代理", source: { type: "geosite", value: "gfw" } },
    { id: "final", policy: "Proxy", source: { type: "final" } },
  ],
  ruleProviders: [],
};

function makeDraftActions(overrides: Record<string, unknown> = {}) {
  const fallback = vi.fn();
  return new Proxy(overrides, {
    get(target, key) {
      return Reflect.has(target, key) ? Reflect.get(target, key) : fallback;
    },
  }) as ReturnType<typeof useProjectDraftActions>;
}

const draftActions = makeDraftActions();

function renderRoutingPage(
  overrides: Partial<Parameters<typeof RoutingPage>[0]> = {},
  actions: ReturnType<typeof useProjectDraftActions> = draftActions,
) {
  return render(
    <AppProviders>
      <RoutingPage
        config={config}
        selectedRuleSetId="geosite-gfw"
        draftActions={actions}
        fetcher={vi.fn()}
        {...overrides}
      />
    </AppProviders>,
  );
}

describe("RoutingPage", () => {
  it("renders one ordered proxy-group list and the complete rule stream", () => {
    const { container } = renderRoutingPage();
    expect(screen.queryByText("服务组")).toBeNull();
    expect(screen.queryByText("地区组")).toBeNull();
    expect(
      Array.from(container.querySelectorAll(".rk-nav-name"), (node) => node.textContent),
    ).toEqual(["全部规则", "Proxy", "HK"]);
    expect(screen.getAllByText("Proxy").length).toBeGreaterThan(0);
    expect(screen.getByText("全部规则")).toBeTruthy();
    expect(screen.getByTestId("route-row-geosite-gfw")).toBeTruthy();
    expect(screen.getByTestId("route-row-final")).toBeTruthy();
  });

  it("keeps the routing page free of the read-only context panel and persistent INI preview", () => {
    renderRoutingPage();
    expect(screen.queryByText("被以下策略组引用")).toBeNull();
    expect(screen.queryByTestId("ini-preview")).toBeNull();
  });

  it("opens the group drawer from the compact list and filters the route list on demand", () => {
    const { container } = renderRoutingPage();

    fireEvent.click(container.querySelector('[data-group-row="HK"]')!);
    const drawer = screen.getByRole("dialog", { name: "策略组 · HK" });
    expect(drawer.textContent).toContain("被 0 条路由使用");

    fireEvent.click(screen.getByRole("button", { name: "在路由列表中筛选" }));
    expect(screen.queryByRole("dialog", { name: "策略组 · HK" })).toBeNull();
    expect(screen.getByText("当前没有 RuleSet 直接指向此组。")).toBeTruthy();
    expect(screen.getByText("该组仍可作为下游策略组被其他组引用。")).toBeTruthy();

    fireEvent.click(screen.getByText("全部规则"));
    expect(screen.getByTestId("route-row-geosite-gfw")).toBeTruthy();
  });

  it("locates the first matching rule when filtering from the drawer", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      value: scrollIntoView,
      configurable: true,
    });
    const { container } = renderRoutingPage();

    fireEvent.click(container.querySelector('[data-group-row="Proxy"]')!);
    fireEvent.click(screen.getByRole("button", { name: "在路由列表中筛选" }));

    expect(screen.getByText("路由规则 · Proxy")).toBeTruthy();
    expect(screen.getByTestId("route-row-geosite-gfw").className).toContain("hit");
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("summarizes validation issues and locates the offending rule row on click", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      value: scrollIntoView,
      configurable: true,
    });
    const invalidConfig: RouteKitProjectConfig = {
      ...config,
      ruleSets: [
        { id: "geosite-gfw", policy: "Missing", section: "代理", source: { type: "geosite", value: "gfw" } },
        { id: "final", policy: "Proxy", source: { type: "final" } },
      ],
    };
    const { container } = renderRoutingPage({ config: invalidConfig });

    expect(screen.getByText(/校验结果：1 错误 · 0 警告 · 0 提示/)).toBeTruthy();
    // 行内就近显示相关诊断
    expect(
      container.querySelector('[data-testid="route-row-geosite-gfw"] .rk-diag')?.textContent,
    ).toContain("引用了不存在的 custom_proxy_group：Missing");

    fireEvent.click(screen.getByRole("button", { name: /route\.policy\.missing/ }));
    expect(scrollIntoView).toHaveBeenCalled();
    expect(screen.getByTestId("route-row-geosite-gfw").className).toContain("hit");
    expect(document.activeElement).toBe(screen.getByTestId("route-row-geosite-gfw"));
  });

  it("opens the generated INI on demand instead of a persistent preview", () => {
    renderRoutingPage();

    expect(screen.queryByTestId("ini-result")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "查看生成结果" }));
    expect(screen.getByTestId("ini-result").textContent).toContain("ruleset=Proxy");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("ini-result")).toBeNull();
  });

  it("opens project defaults on the proxy-group section", () => {
    renderRoutingPage();

    fireEvent.click(screen.getByLabelText("项目默认值"));

    expect(screen.getByRole("dialog", { name: "项目默认值" })).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "策略组健康检查" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("commits a complete strategy group only after Drawer Save", async () => {
    const saveCustomProxyGroup = vi.fn();
    renderRoutingPage({}, makeDraftActions({ saveCustomProxyGroup }));

    fireEvent.click(screen.getByText("HK"));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "策略组类型" }));
    fireEvent.click(await screen.findByText("fallback"));
    expect(saveCustomProxyGroup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(saveCustomProxyGroup).toHaveBeenCalledWith(
      "HK",
      expect.objectContaining({ type: "fallback" }),
    );
  });

  it("commits a complete RuleSet only after Drawer Save", async () => {
    const saveRuleSet = vi.fn();
    renderRoutingPage({}, makeDraftActions({ saveRuleSet }));

    fireEvent.click(screen.getByLabelText("编辑 geosite-gfw"));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "归属策略组" }));
    fireEvent.click((await screen.findAllByText("HK")).at(-1)!);
    expect(saveRuleSet).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(saveRuleSet).toHaveBeenCalledWith(
      "geosite-gfw",
      expect.objectContaining({ policy: "HK" }),
    );
  });

  it("commits project defaults only after Save", () => {
    const setProjectDefaults = vi.fn();
    renderRoutingPage({}, makeDraftActions({ setProjectDefaults }));

    fireEvent.click(screen.getByLabelText("项目默认值"));
    fireEvent.change(screen.getByLabelText("项目测速超时（秒）"), { target: { value: "5" } });
    expect(setProjectDefaults).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(setProjectDefaults).toHaveBeenCalledWith({
      proxyGroups: { healthCheck: { timeout: 5 } },
      ruleSets: { geoipNoResolve: true },
    });
  });
});
