// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { AppProviders } from "../src/components/AppProviders.js";
import { RoutingPage } from "../src/components/RoutingPage.js";
import type { useProjectDraftActions } from "../src/useProjectDraftActions.js";

afterEach(cleanup);

const config: RouteKitProjectConfig = {
  publishBaseUrl: "http://127.0.0.1:8787",
  template: { output: "Custom_Clash.ini" },
  vendorRepos: [],
  customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
  ruleSets: [
    { id: "geosite-gfw", policy: "Proxy", section: "代理", source: { type: "geosite", value: "gfw" } },
    { id: "final", policy: "Proxy", source: { type: "final" } },
  ],
  ruleProviders: [],
};

const draftActions = new Proxy({}, { get: () => vi.fn() }) as ReturnType<typeof useProjectDraftActions>;

it("renders group nav and the ordered rule stream", () => {
  render(
    <AppProviders>
      <RoutingPage config={config} selectedRuleSetId="geosite-gfw" draftActions={draftActions} fetcher={vi.fn()} />
    </AppProviders>,
  );
  expect(screen.getByText("服务组")).toBeTruthy();
  expect(screen.getAllByText("Proxy").length).toBeGreaterThan(0);
  expect(screen.getByText("全部规则")).toBeTruthy();
  expect(screen.getByTestId("route-row-geosite-gfw")).toBeTruthy();
  expect(screen.getByTestId("route-row-final")).toBeTruthy();
});
