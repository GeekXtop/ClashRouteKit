// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { AppProviders } from "../src/components/AppProviders.js";
import { PublishLeftPanel } from "../src/components/PublishLeftPanel.js";

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

it("shows local template url and runs build+push", async () => {
  const calls: string[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input);
    const m = /\/api\/actions\/([\w-]+)/.exec(u);
    if (m) calls.push(m[1]!);
    if (u.includes("/api/git/remote")) return { ok: true, json: async () => ({ url: "" }) } as unknown as Response;
    return { ok: true, json: async () => ({ action: m?.[1], ok: true, output: "ok" }) } as unknown as Response;
  });
  render(
    <AppProviders>
      <PublishLeftPanel config={config} validation={{ status: "success", output: "" }} onRunCheck={() => {}} fetcher={fetcher} />
    </AppProviders>,
  );
  expect(screen.getByText(/192\.168\.1\.9:8787\/templates\/Custom_Clash\.ini/)).toBeTruthy();
  fireEvent.click(screen.getByText(/构建并推送/));
  await waitFor(() => expect(calls).toEqual(expect.arrayContaining(["generate", "git-commit", "git-push"])));
});

it("shows an ini diff for the current template instead of repository git status", async () => {
  const calls: string[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const action = /\/api\/actions\/([\w-]+)/.exec(url)?.[1] ?? "";
    if (action) calls.push(action);
    if (url.includes("/api/git/remote")) return { ok: true, json: async () => ({ url: "" }) } as unknown as Response;
    const output = action === "git-status" ? " M config/routes.yaml" : "ok";
    return { ok: true, json: async () => ({ action, ok: true, output }) } as unknown as Response;
  });
  render(
    <AppProviders>
      <PublishLeftPanel
        config={changedConfig}
        originalConfig={originalConfig}
        validation={{ status: "idle", output: "" }}
        onRunCheck={() => {}}
        fetcher={fetcher}
      />
    </AppProviders>,
  );
  expect(screen.getByText("INI 变更预览")).toBeTruthy();
  expect(screen.getByTestId("publish-ini-preview").className).toContain("rk-ini-scroll");
  expect(screen.getByTestId("publish-ini-preview").textContent).toContain(" [custom]");
  expect(screen.getByText(/\+ruleset=Proxy,\[\]GEOSITE,openai/)).toBeTruthy();
  expect(screen.getByText(/-ruleset=DIRECT,\[\]GEOSITE,legacy/)).toBeTruthy();
  expect(screen.queryByText(/config\/routes\.yaml/)).toBeNull();
  expect(calls).not.toContain("git-status");
});
