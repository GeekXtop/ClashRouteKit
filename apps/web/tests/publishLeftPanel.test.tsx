// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { AppProviders } from "../src/components/AppProviders.js";
import { LocalTemplatePanel } from "../src/features/output/LocalTemplatePanel.js";
import { GithubPublishPanel } from "../src/features/output/GithubPublishPanel.js";

afterEach(cleanup);

const config: RouteKitProjectConfig = {
  publishBaseUrl: "http://192.168.1.9:8787",
  template: { output: "Custom_Clash.ini" },
  vendorRepos: [],
  customProxyGroups: [],
  ruleSets: [],
  ruleProviders: [],
};

const originalConfig: RouteKitProjectConfig = {
  ...config,
  ruleSets: [
    { id: "legacy", policy: "DIRECT", source: { type: "geosite", value: "legacy" } },
    { id: "final", policy: "DIRECT", source: { type: "final" } },
  ],
};

const changedConfig: RouteKitProjectConfig = {
  ...config,
  customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
  ruleSets: [
    { id: "openai", policy: "Proxy", source: { type: "geosite", value: "openai" } },
    { id: "final", policy: "DIRECT", source: { type: "final" } },
  ],
};

describe("LocalTemplatePanel", () => {
  it("shows the local LAN template url and OpenClash hints", () => {
    render(
      <AppProviders>
        <LocalTemplatePanel config={config} />
      </AppProviders>,
    );
    expect(screen.getByText(/192\.168\.1\.9:8787\/templates\/Custom_Clash\.ini/)).toBeTruthy();
    expect(screen.getByText(/SubConverter 需能访问本机 LAN 地址/)).toBeTruthy();
  });
});

describe("GithubPublishPanel", () => {
  it("runs build+push and notes a missing GitHub origin", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const action = /\/api\/actions\/([\w-]+)/.exec(url)?.[1] ?? "";
      if (action) calls.push(action);
      if (url.includes("/api/git/remote")) return { ok: true, json: async () => ({ url: "" }) } as unknown as Response;
      return { ok: true, json: async () => ({ action, ok: true, output: "ok" }) } as unknown as Response;
    });
    render(
      <AppProviders>
        <GithubPublishPanel config={config} fetcher={fetcher} />
      </AppProviders>,
    );
    expect(screen.getByText(/未检测到 GitHub origin/)).toBeTruthy();
    fireEvent.click(screen.getByText(/构建并推送/));
    await waitFor(() => expect(calls).toEqual(expect.arrayContaining(["generate", "git-commit", "git-push"])));
  });

  it("shows an ini diff for the current template instead of repository git status", () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const action = /\/api\/actions\/([\w-]+)/.exec(url)?.[1] ?? "";
      if (action) calls.push(action);
      if (url.includes("/api/git/remote")) return { ok: true, json: async () => ({ url: "" }) } as unknown as Response;
      return { ok: true, json: async () => ({ action, ok: true, output: "ok" }) } as unknown as Response;
    });
    render(
      <AppProviders>
        <GithubPublishPanel config={changedConfig} originalConfig={originalConfig} fetcher={fetcher} />
      </AppProviders>,
    );
    expect(screen.getByText("INI 变更预览")).toBeTruthy();
    expect(screen.getByTestId("publish-ini-preview").textContent).toContain(" [custom]");
    expect(screen.getByText(/\+ruleset=Proxy,\[\]GEOSITE,openai/)).toBeTruthy();
    expect(screen.getByText(/-ruleset=DIRECT,\[\]GEOSITE,legacy/)).toBeTruthy();
    expect(screen.queryByText(/config\/routes\.yaml/)).toBeNull();
    expect(calls).not.toContain("git-status");
  });
});
