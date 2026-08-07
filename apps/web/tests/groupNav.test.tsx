// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { GroupNav } from "../src/components/GroupNav.js";
import type { CustomProxyGroup } from "@clash-route-kit/core";

afterEach(cleanup);

const groups: CustomProxyGroup[] = [
  { name: "Proxy", type: "select", options: [] },
  { name: "HK", type: "url-test", options: [], nodeFilters: ["(港|HK)"] },
];

it("renders every group in order and exposes one type-aware create entry", async () => {
  const onSelectGroup = vi.fn();
  const onEditGroup = vi.fn();
  const onCreateGroup = vi.fn();
  const onOpenDefaults = vi.fn();
  render(
    <AppProviders>
      <GroupNav
        groups={groups}
        stats={[
          {
            name: "Proxy",
            type: "select",
            directRuleSetCount: 3,
            referencedByGroupCount: 1,
            memberCount: 0,
          },
          {
            name: "HK",
            type: "url-test",
            directRuleSetCount: 0,
            referencedByGroupCount: 25,
            memberCount: 1,
          },
        ]}
        totalRules={3}
        selectedGroup={null}
        onSelectGroup={onSelectGroup}
        onEditGroup={onEditGroup}
        onCreateGroup={onCreateGroup}
        onOpenDefaults={onOpenDefaults}
      />
    </AppProviders>,
  );
  fireEvent.click(screen.getByText("Proxy"));
  expect(onSelectGroup).toHaveBeenCalledWith("Proxy");
  fireEvent.click(screen.getByLabelText("编辑 Proxy"));
  expect(onEditGroup).toHaveBeenCalledWith("Proxy");
  expect(screen.queryByText("服务组")).toBeNull();
  expect(screen.queryByText("地区组")).toBeNull();
  expect(screen.getByText("select")).toBeTruthy();
  expect(screen.getByText("url-test")).toBeTruthy();
  expect(screen.getByText("规则 3 · 引用 1")).toBeTruthy();
  expect(screen.getByText("规则 0 · 引用 25")).toBeTruthy();

  const proxy = screen.getByText("Proxy");
  const hk = screen.getByText("HK");
  expect(proxy.compareDocumentPosition(hk) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  fireEvent.click(screen.getByLabelText("项目默认值"));
  expect(onOpenDefaults).toHaveBeenCalled();

  fireEvent.click(screen.getByLabelText("新建策略组"));
  fireEvent.click(await screen.findByText("fallback"));
  expect(onCreateGroup).toHaveBeenCalledWith("fallback");
});
