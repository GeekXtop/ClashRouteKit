// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { AppProviders } from "../src/components/AppProviders.js";
import { RoutingPage } from "../src/components/RoutingPage.js";
import type { useProjectDraftActions } from "../src/useProjectDraftActions.js";

afterEach(cleanup);

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

it("renders one ordered proxy-group list and the complete rule stream", () => {
  const { container } = render(
    <AppProviders>
      <RoutingPage config={config} selectedRuleSetId="geosite-gfw" draftActions={draftActions} fetcher={vi.fn()} />
    </AppProviders>,
  );
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

it("shows parent references and explains an empty direct-rule stream", () => {
  render(
    <AppProviders>
      <RoutingPage config={config} selectedRuleSetId="geosite-gfw" draftActions={draftActions} fetcher={vi.fn()} />
    </AppProviders>,
  );

  fireEvent.click(screen.getByText("HK"));

  expect(screen.getAllByText("Proxy").length).toBeGreaterThan(1);
  expect(screen.getByText("(港|HK)")).toBeTruthy();
  expect(screen.getByText("当前没有 RuleSet 直接指向此组。")).toBeTruthy();
  expect(screen.getByText("该组仍可作为下游策略组被其他组引用。")).toBeTruthy();
});

it("opens project defaults on the proxy-group section", () => {
  render(
    <AppProviders>
      <RoutingPage config={config} selectedRuleSetId="geosite-gfw" draftActions={draftActions} fetcher={vi.fn()} />
    </AppProviders>,
  );

  fireEvent.click(screen.getByLabelText("项目默认值"));

  expect(screen.getByRole("dialog", { name: "项目默认值" })).toBeTruthy();
  expect(
    screen.getByRole("tab", { name: "策略组健康检查" }).getAttribute("aria-selected"),
  ).toBe("true");
});

it("commits a complete strategy group only after Drawer Save", async () => {
  const saveCustomProxyGroup = vi.fn();
  render(
    <AppProviders>
      <RoutingPage
        config={config}
        selectedRuleSetId="geosite-gfw"
        draftActions={makeDraftActions({ saveCustomProxyGroup })}
        fetcher={vi.fn()}
      />
    </AppProviders>,
  );
  fireEvent.click(screen.getByLabelText("编辑 HK"));
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
  render(
    <AppProviders>
      <RoutingPage
        config={config}
        selectedRuleSetId="geosite-gfw"
        draftActions={makeDraftActions({ saveRuleSet })}
        fetcher={vi.fn()}
      />
    </AppProviders>,
  );
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
  render(
    <AppProviders>
      <RoutingPage
        config={config}
        selectedRuleSetId="geosite-gfw"
        draftActions={makeDraftActions({ setProjectDefaults })}
        fetcher={vi.fn()}
      />
    </AppProviders>,
  );
  fireEvent.click(screen.getByLabelText("项目默认值"));
  fireEvent.change(screen.getByLabelText("项目测速超时（秒）"), { target: { value: "5" } });
  expect(setProjectDefaults).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(setProjectDefaults).toHaveBeenCalledWith({
    proxyGroups: { healthCheck: { timeout: 5 } },
    ruleSets: { geoipNoResolve: true },
  });
});
