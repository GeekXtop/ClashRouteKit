// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { CustomProxyGroup } from "@clash-route-kit/core";
import { CustomProxyGroupList } from "../src/components/CustomProxyGroupList.js";

afterEach(cleanup);

describe("CustomProxyGroupList", () => {
  const groups: CustomProxyGroup[] = [{ name: "AI", type: "select", options: ["Proxy"] }];

  it("renders policy dot + name + type badge without raw rulesets/options counts", () => {
    render(
      <CustomProxyGroupList
        customProxyGroups={groups}
        stats={[{ name: "AI", ruleSets: 7, options: 1 }]}
        selectedGroupName="AI"
        onCreateGroup={vi.fn()}
        onSelectGroup={vi.fn()}
      />,
    );
    expect(screen.getByText("AI")).toBeTruthy();
    expect(screen.getByText("select")).toBeTruthy();
    expect(screen.queryByText(/rulesets/)).toBeNull();
    expect(screen.queryByText(/options/)).toBeNull();
  });
});
