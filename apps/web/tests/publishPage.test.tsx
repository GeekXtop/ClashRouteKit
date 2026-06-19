// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { AppProviders } from "../src/components/AppProviders.js";
import { PublishPage } from "../src/components/PublishPage.js";

afterEach(cleanup);

const config: RouteKitProjectConfig = {
  publishBaseUrl: "http://127.0.0.1:8787",
  template: { output: "Custom_Clash.ini" },
  vendorRepos: [],
  customProxyGroups: [],
  ruleSets: [],
  ruleProviders: [],
};

it("renders the three publish sections", async () => {
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response);
  render(
    <AppProviders>
      <PublishPage
        config={config}
        validation={{ status: "idle", output: "" }}
        onRunCheck={() => {}}
        fetcher={fetcher}
      />
    </AppProviders>,
  );
  await waitFor(() => expect(screen.getByText(/模板与发布/)).toBeTruthy());
  expect(screen.getByText(/构建并推送/)).toBeTruthy();
  expect(screen.getByText("生成 config.yaml")).toBeTruthy();
});
