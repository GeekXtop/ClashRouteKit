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
      <AppShell selectedView="project" onSelectView={onSelectView} {...overrides}>
        <div>page-body</div>
      </AppShell>
    </AppProviders>,
  );
  return { onSelectView };
}

describe("AppShell", () => {
  it("renders the four primary nav items and body", () => {
    renderShell();
    expect(screen.getByText("项目")).toBeTruthy();
    expect(screen.getByText("规则库")).toBeTruthy();
    expect(screen.getByText("路由")).toBeTruthy();
    expect(screen.getByText("输出")).toBeTruthy();
    expect(screen.getByText("page-body")).toBeTruthy();
  });

  it("no longer renders the global import button in the top bar", () => {
    renderShell();
    expect(screen.queryByText("导入模板")).toBeNull();
    expect(screen.queryByRole("button", { name: "导入模板" })).toBeNull();
  });

  it("fires onSelectView when a nav item is clicked", () => {
    const { onSelectView } = renderShell();
    fireEvent.click(screen.getByText("路由"));
    expect(onSelectView).toHaveBeenCalledWith("routing");
    fireEvent.click(screen.getByText("输出"));
    expect(onSelectView).toHaveBeenCalledWith("output");
    fireEvent.click(screen.getByText("项目"));
    expect(onSelectView).toHaveBeenCalledWith("project");
  });
});
