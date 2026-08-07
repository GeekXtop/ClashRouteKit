// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { LibrarySidebar } from "../src/components/LibrarySidebar.js";

afterEach(cleanup);

it("edits and syncs a repo, selects a list file", () => {
  const onEditRepo = vi.fn();
  const onSyncRepo = vi.fn();
  const onSelect = vi.fn();
  const onOpenRuleDefaults = vi.fn();
  render(
    <AppProviders>
      <LibrarySidebar
        repos={[{ id: "ACL4SSR", label: "ACL4SSR", kind: "upstream", count: 24, syncedAt: null, browsable: true }]}
        listFiles={["Direct.list"]}
        providers={[]}
        selection={null}
        syncingRepo={null}
        onSelect={onSelect}
        onSyncRepo={onSyncRepo}
        onSyncAll={() => {}}
        onAddRepo={() => {}}
        onEditRepo={onEditRepo}
        onNewList={() => {}}
        onNewProvider={() => {}}
        onOpenRuleDefaults={onOpenRuleDefaults}
      />
    </AppProviders>,
  );
  fireEvent.click(screen.getByLabelText("编辑 ACL4SSR"));
  expect(onEditRepo).toHaveBeenCalledWith("ACL4SSR");
  fireEvent.click(screen.getByLabelText("同步 ACL4SSR"));
  expect(onSyncRepo).toHaveBeenCalledWith("ACL4SSR");
  fireEvent.click(screen.getByText("Direct.list"));
  expect(onSelect).toHaveBeenCalledWith({ kind: "list", file: "Direct.list" });
  fireEvent.click(screen.getByLabelText("规则默认值"));
  expect(onOpenRuleDefaults).toHaveBeenCalled();
});

it("marks empty rule providers as incomplete", () => {
  render(
    <AppProviders>
      <LibrarySidebar
        repos={[]}
        listFiles={[]}
        providers={[
          { name: "CustomDirect", output: "Custom_Direct_Classical_IP.yaml", behavior: "classical", sources: [] },
          {
            name: "AI",
            output: "AI_Domain.yaml",
            behavior: "domain",
            sources: [{ name: "AI", type: "clash-list", path: "config/rules/AI.list" }],
          },
        ]}
        selection={null}
        syncingRepo={null}
        onSelect={() => {}}
        onSyncRepo={() => {}}
        onSyncAll={() => {}}
        onAddRepo={() => {}}
        onEditRepo={() => {}}
        onNewList={() => {}}
        onNewProvider={() => {}}
        onOpenRuleDefaults={() => {}}
      />
    </AppProviders>,
  );

  expect(screen.getByText("待补全")).toBeTruthy();
});
