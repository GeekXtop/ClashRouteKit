// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CustomProxyGroup } from "@clash-route-kit/core";
import { AppProviders } from "../src/components/AppProviders.js";
import { GroupNav, type GroupLocate } from "../src/components/GroupNav.js";

afterEach(() => {
  cleanup();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

const groups: CustomProxyGroup[] = [
  { name: "Proxy", type: "select", options: [] },
  { name: "HK", type: "url-test", options: [], nodeFilters: ["(港|HK)"] },
];

const stats = [
  {
    name: "Proxy",
    type: "select" as const,
    directRuleSetCount: 3,
    referencedByGroupCount: 1,
    memberCount: 0,
  },
  {
    name: "HK",
    type: "url-test" as const,
    directRuleSetCount: 0,
    referencedByGroupCount: 25,
    memberCount: 1,
  },
];

function renderNav(locate: GroupLocate | null = null) {
  const onSelectGroup = vi.fn();
  const onEditGroup = vi.fn();
  const onCreateGroup = vi.fn();
  const onOpenDefaults = vi.fn();
  const view = render(
    <AppProviders>
      <GroupNav
        groups={groups}
        stats={stats}
        totalRules={3}
        selectedGroup={null}
        locate={locate}
        onSelectGroup={onSelectGroup}
        onEditGroup={onEditGroup}
        onCreateGroup={onCreateGroup}
        onOpenDefaults={onOpenDefaults}
      />
    </AppProviders>,
  );
  return { view, onSelectGroup, onEditGroup, onCreateGroup, onOpenDefaults };
}

describe("GroupNav", () => {
  it("renders a compact list where clicking a group opens its drawer", async () => {
    const { onSelectGroup, onEditGroup, onCreateGroup, onOpenDefaults } = renderNav();
    expect(screen.getByText("全部规则")).toBeTruthy();
    expect(screen.getByText("被 3 条路由使用")).toBeTruthy();
    expect(screen.getByText("被 0 条路由使用")).toBeTruthy();
    expect(screen.getByText("select")).toBeTruthy();
    expect(screen.getByText("url-test")).toBeTruthy();

    fireEvent.click(screen.getByText("Proxy"));
    expect(onEditGroup).toHaveBeenCalledWith("Proxy");
    expect(onSelectGroup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("全部规则"));
    expect(onSelectGroup).toHaveBeenCalledWith(null);

    const proxy = screen.getByText("Proxy");
    const hk = screen.getByText("HK");
    expect(proxy.compareDocumentPosition(hk) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByLabelText("项目默认值"));
    expect(onOpenDefaults).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("新建策略组"));
    fireEvent.click(await screen.findByText("fallback"));
    expect(onCreateGroup).toHaveBeenCalledWith("fallback");
  });

  it("marks group entries with inline issue counts", () => {
    render(
      <AppProviders>
        <GroupNav
          groups={groups}
          stats={stats}
          diagnosticsByGroup={
            new Map([
              ["HK", [{ code: "group.members.empty", severity: "error", path: "customProxyGroups[1]", message: "custom_proxy_group HK 至少需要一个 option 或 node filter" }]],
            ])
          }
          totalRules={3}
          selectedGroup={null}
          onSelectGroup={() => {}}
          onEditGroup={() => {}}
          onCreateGroup={() => {}}
          onOpenDefaults={() => {}}
        />
      </AppProviders>,
    );
    const issue = screen.getByText("1");
    expect(issue.className).toContain("rk-nav-issue");
    const hkRow = screen.getByText("HK").closest("button")!;
    expect(hkRow.className).toContain("has-issues");
    expect(hkRow.getAttribute("title")).toContain("至少需要一个 option");
  });

  it("highlights and focuses a group row when asked to locate", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      value: scrollIntoView,
      configurable: true,
    });
    const { view } = renderNav();
    view.rerender(
      <AppProviders>
        <GroupNav
          groups={groups}
          stats={stats}
          totalRules={3}
          selectedGroup={null}
          locate={{ groupName: "HK", nonce: 1 }}
          onSelectGroup={() => {}}
          onEditGroup={() => {}}
          onCreateGroup={() => {}}
          onOpenDefaults={() => {}}
        />
      </AppProviders>,
    );
    const row = screen.getByText("HK").closest("button")!;
    expect(row.className).toContain("hit");
    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(row);
  });
});
