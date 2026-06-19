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
