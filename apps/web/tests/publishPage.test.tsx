// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { AppProviders } from "../src/components/AppProviders.js";
import { OutputPage } from "../src/features/output/OutputPage.js";

afterEach(cleanup);

const config: RouteKitProjectConfig = {
  publishBaseUrl: "http://127.0.0.1:8787",
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

const jsonOk = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;

it("keeps the legacy publish flow reachable: push main runs generate, commit, push", async () => {
  const calls: string[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const action = /\/api\/actions\/([\w-]+)/.exec(url)?.[1] ?? "";
    if (action) calls.push(action);
    if (url.includes("/api/git/remote")) return jsonOk({ url: "" });
    if (url.includes("/api/git/publish-status")) {
      return jsonOk({ branch: "main", workflow: { state: "unsupported" } });
    }
    return jsonOk({ action, ok: true, output: "ok" });
  });
  render(
    <AppProviders>
      <OutputPage
        config={config}
        validation={{ status: "idle", output: "" }}
        onRunCheck={() => {}}
        fetcher={fetcher}
      />
    </AppProviders>,
  );
  fireEvent.click(screen.getByText("GitHub 发布"));
  await waitFor(() => expect((screen.getByTestId("publish-main-button") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByTestId("publish-main-button"));
  await waitFor(() => expect(calls).toEqual(expect.arrayContaining(["generate", "git-commit", "git-push"])));
});

it("keeps the ini diff preview in the github tab instead of the device-config tab", () => {
  render(
    <AppProviders>
      <OutputPage
        config={changedConfig}
        originalConfig={originalConfig}
        validation={{ status: "idle", output: "" }}
        onRunCheck={() => {}}
        fetcher={vi.fn(async () => ({ ok: true, json: async () => ({ url: "" }) }) as unknown as Response)}
      />
    </AppProviders>,
  );
  expect(screen.queryByTestId("publish-ini-preview")).toBeNull();
  fireEvent.click(screen.getByText("GitHub 发布"));
  expect(screen.getByTestId("publish-ini-preview").className).toContain("rk-ini-scroll");
  expect(screen.getByTestId("publish-ini-preview").textContent).toContain(" [custom]");
  expect(screen.getByText(/\+ruleset=Proxy,\[\]GEOSITE,openai/)).toBeTruthy();
  expect(screen.getByText(/-ruleset=DIRECT,\[\]GEOSITE,legacy/)).toBeTruthy();
});
