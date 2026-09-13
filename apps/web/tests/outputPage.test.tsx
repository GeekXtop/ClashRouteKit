// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { AppProviders } from "../src/components/AppProviders.js";
import { OutputPage } from "../src/features/output/OutputPage.js";

afterEach(cleanup);

const config: RouteKitProjectConfig = {
  publishBaseUrl: "http://127.0.0.1:8787",
  template: { output: "Custom_Clash.ini" },
  vendorRepos: [],
  customProxyGroups: [],
  ruleSets: [{ id: "final", policy: "DIRECT", source: { type: "final" } }],
  ruleProviders: [],
};

function renderOutput(overrides: Partial<Parameters<typeof OutputPage>[0]> = {}) {
  const props: Parameters<typeof OutputPage>[0] = {
    config,
    originalYaml: "publishBaseUrl: http://127.0.0.1:8787\n",
    validation: { status: "idle", output: "尚未运行检查" },
    onRunCheck: vi.fn(),
    fetcher: vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response),
    ...overrides,
  };
  render(
    <AppProviders>
      <OutputPage {...props} />
    </AppProviders>,
  );
  return props;
}

describe("OutputPage", () => {
  it("opens the device-config tab by default with local template and config export", () => {
    const props = renderOutput();
    expect(screen.getByText("本机 · 实时")).toBeTruthy();
    expect(screen.getByText("生成 config.yaml")).toBeTruthy();
    expect(screen.queryByText("提交并推送 main")).toBeNull();
    expect(props.onRunCheck).toHaveBeenCalledTimes(1);
  });

  it("shows the shared header with schema version, validation state, and local template url", () => {
    renderOutput({ validation: { status: "success", output: "ok" } });
    expect(screen.getByText("Schema v1")).toBeTruthy();
    expect(screen.getByText("校验通过")).toBeTruthy();
    expect(screen.getByText("本地实时模板 URL")).toBeTruthy();
    // 头部与设备配置标签内的 URL 行都会展示本地模板 URL
    expect(screen.getAllByText(/127\.0\.0\.1:8787\/templates\/Custom_Clash\.ini/).length).toBeGreaterThan(0);
  });

  it("marks the GitHub publish tab as optional", () => {
    renderOutput();
    expect(screen.getByText("GitHub 发布")).toBeTruthy();
    expect(screen.getByText("可选")).toBeTruthy();
  });

  it("reveals the github publish panel after switching tabs", () => {
    renderOutput();
    fireEvent.click(screen.getByText("GitHub 发布"));
    expect(screen.getByText("提交并推送 main")).toBeTruthy();
    expect(screen.getByTestId("publish-ini-preview")).toBeTruthy();
  });
});
