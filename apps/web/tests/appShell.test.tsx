// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { AppShell } from "../src/components/AppShell.js";

afterEach(cleanup);

function renderShell(overrides: Partial<Parameters<typeof AppShell>[0]> = {}) {
  const onSelectView = vi.fn();
  render(
    <AppProviders>
      <AppShell
        selectedView="routing"
        dirty={false}
        onSelectView={onSelectView}
        onImport={() => {}}
        onExport={() => {}}
        {...overrides}
      >
        <div>page-body</div>
      </AppShell>
    </AppProviders>,
  );
  return { onSelectView };
}

describe("AppShell", () => {
  it("renders the three nav items and body", () => {
    renderShell();
    expect(screen.getByText("路由")).toBeTruthy();
    expect(screen.getByText("规则库")).toBeTruthy();
    expect(screen.getByText("发布")).toBeTruthy();
    expect(screen.getByText("page-body")).toBeTruthy();
  });

  it("fires onSelectView when a nav item is clicked", () => {
    const { onSelectView } = renderShell();
    fireEvent.click(screen.getByText("规则库"));
    expect(onSelectView).toHaveBeenCalledWith("library");
  });
});
