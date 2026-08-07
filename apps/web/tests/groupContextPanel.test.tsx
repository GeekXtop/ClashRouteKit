// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { GroupContextPanel } from "../src/components/GroupContextPanel.js";

afterEach(cleanup);

it("shows parent references, node sources and effective health-check values", () => {
  const onSelectParent = vi.fn();
  render(
    <AppProviders>
      <GroupContextPanel
        group={{
          name: "HK",
          type: "url-test",
          options: [],
          nodeFilters: ["(港|HK)"],
        }}
        details={{
          directRuleSets: [],
          referencedByGroups: [{ name: "Proxy", type: "select" }],
          memberCount: 1,
          healthCheck: {
            url: { value: "https://probe.example/204", source: "project" },
            interval: { value: 600, source: "project" },
            timeout: { value: 5, source: "project" },
            tolerance: { value: 80, source: "project" },
          },
        }}
        onEdit={() => {}}
        onSelectParent={onSelectParent}
      >
        <div>rule stream</div>
      </GroupContextPanel>
    </AppProviders>,
  );

  expect(screen.getByText("被以下策略组引用")).toBeTruthy();
  fireEvent.click(screen.getByText("Proxy"));
  expect(onSelectParent).toHaveBeenCalledWith("Proxy");
  expect(screen.getByText("(港|HK)")).toBeTruthy();
  expect(screen.getByText("600 秒")).toBeTruthy();
  expect(screen.getAllByText("继承项目默认值").length).toBeGreaterThan(0);
  expect(screen.getByText("rule stream")).toBeTruthy();
});
