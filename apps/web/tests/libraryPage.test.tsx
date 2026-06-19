// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { AppProviders } from "../src/components/AppProviders.js";
import { LibraryPage } from "../src/components/LibraryPage.js";
import type { useProjectDraftActions } from "../src/useProjectDraftActions.js";

afterEach(cleanup);

const config: RouteKitProjectConfig = {
  publishBaseUrl: "http://127.0.0.1:8787",
  template: { output: "Custom_Clash.ini" },
  vendorRepos: [{ name: "ACL4SSR", url: "https://x.git", path: "vendor/ACL4SSR", catalog: { dir: "vendor/ACL4SSR/Clash", kind: "list-dir" } }],
  customProxyGroups: [],
  ruleSets: [],
  ruleProviders: [],
};

const draftActions = new Proxy({}, { get: () => vi.fn() }) as ReturnType<typeof useProjectDraftActions>;

function makeFetcher() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/catalog/sources"))
      return { ok: true, json: async () => ({ sources: [{ id: "ACL4SSR", label: "ACL4SSR", kind: "upstream", count: 24, syncedAt: null, browsable: true }] }) } as unknown as Response;
    if (url.includes("/api/project/rules"))
      return { ok: true, json: async () => ({ files: ["Direct.list"] }) } as unknown as Response;
    return { ok: true, json: async () => ({}) } as unknown as Response;
  });
}

it("renders repos and local list files", async () => {
  render(
    <AppProviders>
      <LibraryPage config={config} draftActions={draftActions} onRefreshConfig={() => {}} fetcher={makeFetcher()} />
    </AppProviders>,
  );
  await waitFor(() => expect(screen.getByText("ACL4SSR")).toBeTruthy());
  expect(screen.getByText("Direct.list")).toBeTruthy();
});
