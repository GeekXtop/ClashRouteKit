// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

it("opens project defaults on the rule-set section", async () => {
  render(
    <AppProviders>
      <LibraryPage config={config} draftActions={draftActions} onRefreshConfig={() => {}} fetcher={makeFetcher()} />
    </AppProviders>,
  );

  fireEvent.click(screen.getByLabelText("规则默认值"));

  expect(screen.getByRole("dialog", { name: "项目默认值" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "规则默认值" }).getAttribute("aria-selected")).toBe(
    "true",
  );
});

it("cancels local rule-default edits without committing", async () => {
  const setProjectDefaults = vi.fn();
  const actions = new Proxy({ setProjectDefaults }, {
    get(target, key) {
      return Reflect.has(target, key) ? Reflect.get(target, key) : vi.fn();
    },
  }) as unknown as ReturnType<typeof useProjectDraftActions>;
  render(
    <AppProviders>
      <LibraryPage
        config={config}
        draftActions={actions}
        onRefreshConfig={() => {}}
        fetcher={makeFetcher()}
      />
    </AppProviders>,
  );
  await waitFor(() => expect(screen.getByText("ACL4SSR")).toBeTruthy());
  fireEvent.click(screen.getByLabelText("规则默认值"));
  fireEvent.change(screen.getByLabelText("Rule Provider 刷新间隔（秒）"), {
    target: { value: "600" },
  });
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(setProjectDefaults).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog", { name: "项目默认值" })).toBeNull();
});

it("deletes a local list file and refreshes the sidebar", async () => {
  let deleted = false;
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/catalog/sources")) {
      return { ok: true, json: async () => ({ sources: [] }) } as unknown as Response;
    }
    if (url.endsWith("/api/project/rules")) {
      return { ok: true, json: async () => ({ files: deleted ? [] : ["Direct.list"] }) } as unknown as Response;
    }
    if (url.endsWith("/api/project/rules/Direct.list") && init?.method === "DELETE") {
      deleted = true;
      return { ok: true, json: async () => ({ file: "Direct.list" }) } as unknown as Response;
    }
    if (url.endsWith("/api/project/rules/Direct.list")) {
      return { ok: true, json: async () => ({ file: "Direct.list", text: "DOMAIN,a.cn\n" }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  });

  render(
    <AppProviders>
      <LibraryPage config={config} draftActions={draftActions} onRefreshConfig={() => {}} fetcher={fetcher} />
    </AppProviders>,
  );
  await waitFor(() => expect(screen.getByText("Direct.list")).toBeTruthy());
  fireEvent.click(screen.getByText("Direct.list"));
  await waitFor(() => expect(screen.getByRole("textbox")).toBeTruthy());
  fireEvent.click(screen.getByText("删除"));
  fireEvent.click(await screen.findByText("删除文件"));

  await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) =>
    String(url).endsWith("/api/project/rules/Direct.list") && (init as RequestInit | undefined)?.method === "DELETE",
  )).toBe(true));
  await waitFor(() => expect(screen.queryByText("Direct.list")).toBeNull());
  expect(screen.getByText("选择左侧的仓库 / 本地 .list / 规则源")).toBeTruthy();
});
