// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { RouteWorkspace } from "../src/components/RouteWorkspace.js";

afterEach(cleanup);

const config: RouteKitProjectConfig = {
  publishBaseUrl: "http://127.0.0.1:8787",
  template: { output: "Custom_Clash.ini" },
  vendorRepos: [],
  customProxyGroups: [
    { name: "Proxy", type: "select", options: ["DIRECT"] },
    { name: "Direct", type: "select", options: ["DIRECT"] },
  ],
  ruleSets: [
    { id: "rs-openai", policy: "Proxy", section: "AI", source: { type: "geosite", value: "openai" } },
    { id: "rs-cn", policy: "Direct", section: "AI", source: { type: "geosite", value: "cn" } },
    { id: "rs-netflix", policy: "Proxy", section: "Stream", source: { type: "geosite", value: "netflix" } },
    { id: "rs-final", policy: "Proxy", source: { type: "final" } },
  ],
  ruleProviders: [],
};

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

function renderWorkspace(overrides: Partial<Parameters<typeof RouteWorkspace>[0]> = {}) {
  const props = {
    config,
    selectedRuleSet: config.ruleSets[0],
    search: "",
    iniPreview: "[custom]\n",
    previewMode: "rules" as const,
    routeRows: [],
    customProxyGroupFilter: "全部",
    stats: [
      { name: "Proxy", ruleSets: 2, options: 1 },
      { name: "Direct", ruleSets: 1, options: 1 },
    ],
    fetcher: vi.fn(async () => jsonResponse({ entries: ["openai"] })),
    onSearchChange: vi.fn(),
    onSelectRuleSet: vi.fn(),
    onToggleRuleSet: vi.fn(),
    onDeleteRuleSet: vi.fn(),
    onUpdateRuleSet: vi.fn(),
    onReorderRuleSets: vi.fn(),
    onAddGeositeRoute: vi.fn(),
    onImportIni: vi.fn(),
    onCreateCustomProxyGroup: vi.fn(),
    onPreviewModeChange: vi.fn(),
    onCustomProxyGroupFilterChange: vi.fn(),
    ...overrides,
  };
  render(<RouteWorkspace {...props} />);
  return props;
}

describe("RouteWorkspace", () => {
  it("groups rule sets by section", () => {
    renderWorkspace();
    expect(screen.getByText("AI")).toBeTruthy();
    expect(screen.getByText("Stream")).toBeTruthy();
    expect(screen.getByTestId("route-row-rs-openai")).toBeTruthy();
    expect(screen.getByTestId("route-row-rs-netflix")).toBeTruthy();
  });

  it("reorders rule sets by dragging one row onto another", () => {
    const { onReorderRuleSets } = renderWorkspace();
    fireEvent.dragStart(screen.getByTestId("route-row-rs-netflix"));
    fireEvent.drop(screen.getByTestId("route-row-rs-openai"));
    expect(onReorderRuleSets).toHaveBeenCalledWith(["rs-netflix", "rs-openai", "rs-cn", "rs-final"]);
  });

  it("filters the list down to a single policy", () => {
    renderWorkspace();
    fireEvent.click(screen.getByLabelText("筛选 Direct"));
    expect(screen.getByTestId("route-row-rs-cn")).toBeTruthy();
    expect(screen.queryByTestId("route-row-rs-openai")).toBeNull();
    expect(screen.queryByTestId("route-row-rs-netflix")).toBeNull();
  });

  it("imports pasted INI text", () => {
    const { onImportIni } = renderWorkspace();
    fireEvent.click(screen.getByText("导入 INI"));
    fireEvent.change(screen.getByLabelText("INI 文本"), {
      target: { value: "[custom]\nruleset=Proxy,[]FINAL\n" },
    });
    fireEvent.click(screen.getByText("导入"));
    expect(onImportIni).toHaveBeenCalledWith("[custom]\nruleset=Proxy,[]FINAL\n");
  });

  it("opens the route picker dialog", () => {
    renderWorkspace();
    fireEvent.click(screen.getByText("添加规则"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("docks the live INI preview and collapses it", () => {
    renderWorkspace({ previewMode: "ini", iniPreview: "[custom]\nruleset=Proxy,[]FINAL\n" });
    expect(screen.getByText(/ruleset=Proxy,\[\]FINAL/)).toBeTruthy();
    fireEvent.click(screen.getByText(/收起预览/));
    expect(screen.queryByText(/ruleset=Proxy,\[\]FINAL/)).toBeNull();
    expect(screen.getByText(/展开 INI 预览/)).toBeTruthy();
  });
});
