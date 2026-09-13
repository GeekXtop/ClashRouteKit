// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { GroupDrawer } from "../src/components/GroupDrawer.js";

afterEach(cleanup);

it("shows the usage count and filters the route list on demand", () => {
  const onFilterInRouteList = vi.fn();
  render(
    <AppProviders>
      <GroupDrawer
        open
        group={{ name: "Proxy", type: "select", options: ["Direct"] }}
        groups={[{ name: "Proxy", type: "select", options: [] }]}
        inboundCount={1}
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
        onFilterInRouteList={onFilterInRouteList}
      />
    </AppProviders>,
  );
  expect(screen.getByDisplayValue("Proxy")).toBeTruthy();
  expect(screen.getByText("被 1 条路由使用")).toBeTruthy();
  expect(screen.queryByText("geosite-gfw")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "在路由列表中筛选" }));
  expect(onFilterInRouteList).toHaveBeenCalledWith("Proxy");
});

it("shows inherited health-check fields for fallback groups without URLTest tolerance", () => {
  render(
    <AppProviders>
      <GroupDrawer
        open
        group={{ name: "Fallback", type: "fallback", options: [], nodeFilters: [".*"] }}
        groups={[{ name: "Fallback", type: "fallback", options: [], nodeFilters: [".*"] }]}
        defaults={{
          proxyGroups: {
            healthCheck: { url: "https://probe.example/204", interval: 600, timeout: 5 },
            urlTest: { tolerance: 80 },
          },
        }}
        inboundCount={0}
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
        onFilterInRouteList={() => {}}
      />
    </AppProviders>,
  );

  expect(screen.getByText("测速 URL")).toBeTruthy();
  expect(screen.getByText("测速间隔（秒）")).toBeTruthy();
  expect(screen.getByText("测速超时（秒）")).toBeTruthy();
  expect(screen.queryByText("URLTest 容差（毫秒）")).toBeNull();
  expect(screen.getByText("继承项目默认值：600 秒")).toBeTruthy();
});

it("keeps group edits local until Save is clicked", async () => {
  const onSave = vi.fn();
  render(
    <AppProviders>
      <GroupDrawer
        open
        group={{ name: "Auto", type: "url-test", options: [], nodeFilters: [".*"] }}
        groups={[{ name: "Auto", type: "url-test", options: [], nodeFilters: [".*"] }]}
        inboundCount={0}
        onSave={onSave}
        onCancel={() => {}}
        onDelete={() => {}}
        onFilterInRouteList={() => {}}
      />
    </AppProviders>,
  );

  fireEvent.mouseDown(screen.getByRole("combobox", { name: "策略组类型" }));
  fireEvent.click(await screen.findByText("fallback"));
  fireEvent.change(screen.getByLabelText("节点过滤正则"), {
    target: { value: "(港|HK)\nHKG" },
  });
  await new Promise((resolve) => setTimeout(resolve, 650));
  expect(onSave).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    name: "Auto",
    type: "fallback",
    nodeFilters: ["(港|HK)", "HKG"],
  }));
});

it("discards edits when Cancel is clicked", () => {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(
    <AppProviders>
      <GroupDrawer
        open
        group={{ name: "Auto", type: "url-test", options: [], nodeFilters: [".*"] }}
        groups={[{ name: "Auto", type: "url-test", options: [], nodeFilters: [".*"] }]}
        inboundCount={0}
        onSave={onSave}
        onCancel={onCancel}
        onDelete={() => {}}
        onFilterInRouteList={() => {}}
      />
    </AppProviders>,
  );
  fireEvent.change(screen.getByDisplayValue("Auto"), { target: { value: "Changed" } });
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(onSave).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledTimes(1);
});

it("saves a custom blank timeout as null", () => {
  const onSave = vi.fn();
  render(
    <AppProviders>
      <GroupDrawer
        open
        group={{
          name: "Auto",
          type: "url-test",
          options: [],
          nodeFilters: [".*"],
          timeout: 8,
        }}
        groups={[{ name: "Auto", type: "url-test", options: [], nodeFilters: [".*"] }]}
        inboundCount={0}
        onSave={onSave}
        onCancel={() => {}}
        onDelete={() => {}}
        onFilterInRouteList={() => {}}
      />
    </AppProviders>,
  );
  fireEvent.change(screen.getByLabelText("测速超时（秒）"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ timeout: null }));
});

it("keeps duplicate-name validation inside the Drawer", () => {
  const onSave = vi.fn();
  render(
    <AppProviders>
      <GroupDrawer
        open
        group={{ name: "Auto", type: "url-test", options: [], nodeFilters: [".*"] }}
        groups={[
          { name: "Proxy", type: "select", options: ["DIRECT"] },
          { name: "Auto", type: "url-test", options: [], nodeFilters: [".*"] },
        ]}
        inboundCount={0}
        onSave={onSave}
        onCancel={() => {}}
        onDelete={() => {}}
        onFilterInRouteList={() => {}}
      />
    </AppProviders>,
  );
  fireEvent.change(screen.getByDisplayValue("Auto"), { target: { value: "Proxy" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.getByText('custom_proxy_group "Proxy" already exists')).toBeTruthy();
  expect(onSave).not.toHaveBeenCalled();
});
