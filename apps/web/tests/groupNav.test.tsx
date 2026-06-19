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

it("click name filters, pencil edits", () => {
  const onSelectGroup = vi.fn();
  const onEditGroup = vi.fn();
  render(
    <AppProviders>
      <GroupNav
        groups={groups}
        stats={[
          { name: "Proxy", ruleSets: 3, options: 0 },
          { name: "HK", ruleSets: 0, options: 1 },
        ]}
        totalRules={3}
        selectedGroup={null}
        onSelectGroup={onSelectGroup}
        onEditGroup={onEditGroup}
        onCreateGroup={() => {}}
      />
    </AppProviders>,
  );
  fireEvent.click(screen.getByText("Proxy"));
  expect(onSelectGroup).toHaveBeenCalledWith("Proxy");
  fireEvent.click(screen.getByLabelText("编辑 Proxy"));
  expect(onEditGroup).toHaveBeenCalledWith("Proxy");
});
