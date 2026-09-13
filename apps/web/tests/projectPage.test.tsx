// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { AppProviders } from "../src/components/AppProviders.js";
import { ProjectPage } from "../src/features/project/ProjectPage.js";

afterEach(cleanup);

const blankConfig: RouteKitProjectConfig = {
  publishBaseUrl: "http://127.0.0.1:8787",
  template: { output: "Custom_Clash.ini" },
  vendorRepos: [],
  customProxyGroups: [],
  ruleSets: [],
  ruleProviders: [],
};

const projectConfig: RouteKitProjectConfig = {
  publishBaseUrl: "http://127.0.0.1:8787",
  template: { output: "Custom_Clash.ini" },
  vendorRepos: [],
  customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
  ruleSets: [
    { id: "openai", policy: "Proxy", source: { type: "geosite", value: "openai" } },
    { id: "final", policy: "DIRECT", source: { type: "final" } },
  ],
  ruleProviders: [
    {
      name: "Custom Direct Domain",
      output: "Custom_Direct_Domain.yaml",
      behavior: "domain",
      enabled: true,
      sources: [],
    },
  ],
};

function renderPage(overrides: Partial<Parameters<typeof ProjectPage>[0]> = {}) {
  const props: Parameters<typeof ProjectPage>[0] = {
    config: projectConfig,
    originalYaml: "publishBaseUrl: http://127.0.0.1:8787\n",
    status: "ready",
    message: "已读取本地 config/routes.yaml",
    dirty: false,
    validation: { status: "idle", output: "尚未运行检查" },
    lastWorkView: "routing",
    onNavigate: vi.fn(),
    onOpenImport: vi.fn(),
    onRunCheck: vi.fn(),
    onCreateBlankProject: vi.fn(),
    ...overrides,
  };
  render(
    <AppProviders>
      <ProjectPage {...props} />
    </AppProviders>,
  );
  return props;
}

describe("ProjectPage empty state", () => {
  it("offers import as the primary action and blank creation as the secondary action", () => {
    const props = renderPage({ config: blankConfig });
    const importButton = screen.getByRole("button", { name: "导入现有模板" });
    const blankButton = screen.getByRole("button", { name: "创建空白项目" });
    expect(importButton.getAttribute("class")).toContain("ant-btn-primary");
    fireEvent.click(importButton);
    expect(props.onOpenImport).toHaveBeenCalledTimes(1);
    fireEvent.click(blankButton);
    expect(props.onCreateBlankProject).toHaveBeenCalledTimes(1);
  });
});

describe("ProjectPage existing project state", () => {
  it("shows schema v1 with a migration notice and a disabled learn-more button", () => {
    renderPage();
    expect(screen.getByText("Schema v1")).toBeTruthy();
    expect(screen.getByText(/可迁移到 v2/)).toBeTruthy();
    const learnMore = screen.getByRole("button", { name: "了解迁移" });
    expect(learnMore.hasAttribute("disabled")).toBe(true);
  });

  it("shows schema v2 without the migration notice", () => {
    renderPage({ originalYaml: "schemaVersion: 2\nproject:\n  template:\n    output: Custom_Clash.ini\n" });
    expect(screen.getByText("Schema v2")).toBeTruthy();
    expect(screen.queryByText(/可迁移到 v2/)).toBeNull();
  });

  it("renders the four task domain cards with the project marked as current", () => {
    renderPage();
    expect(screen.getByText("当前所在")).toBeTruthy();
    expect(screen.getByText("1 个规则源")).toBeTruthy();
    expect(screen.getByText("2 条路由 · 1 个策略组")).toBeTruthy();
    expect(screen.getByText("Custom_Clash.ini")).toBeTruthy();
  });

  it("continues editing on the last visited work view", () => {
    const props = renderPage({ lastWorkView: "output" });
    fireEvent.click(screen.getByRole("button", { name: "继续编辑（输出）" }));
    expect(props.onNavigate).toHaveBeenCalledWith("output");
  });

  it("re-import is a secondary action that opens the import flow", () => {
    const props = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "重新导入" }));
    expect(props.onOpenImport).toHaveBeenCalledTimes(1);
  });

  it("shows an unvalidated summary with a run-check action", () => {
    const props = renderPage({ validation: { status: "idle", output: "尚未运行检查" } });
    expect(screen.getByText("未校验")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "运行检查" }));
    expect(props.onRunCheck).toHaveBeenCalledTimes(1);
  });

  it("reflects a failed validation summary", () => {
    renderPage({ validation: { status: "error", output: "ruleSets 需要包含一条 FINAL 兜底规则" } });
    expect(screen.getByText("校验未通过")).toBeTruthy();
    expect(screen.getByText(/FINAL 兜底规则/)).toBeTruthy();
  });
});
