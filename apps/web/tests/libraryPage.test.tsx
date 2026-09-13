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

const healthConfig: RouteKitProjectConfig = {
  ...config,
  ruleProviders: [
    { name: "Draft", output: "Draft.yaml", behavior: "domain", sources: [] },
    {
      name: "StaleOne",
      output: "StaleOne.yaml",
      behavior: "domain",
      sources: [{ name: "s", type: "clash-list", path: "config/rules/Missing.list" }],
    },
    { name: "MrsThing", output: "Thing.mrs", behavior: "domain", enabled: false, sources: [] },
  ],
};

describe("library health bar", () => {
  it("shows the pass status for a healthy library", async () => {
    render(
      <AppProviders>
        <LibraryPage config={config} draftActions={draftActions} onRefreshConfig={() => {}} fetcher={makeFetcher()} />
      </AppProviders>,
    );
    await waitFor(() =>
      expect(screen.getByText("规则库健康：无待补全来源、无失效来源、无阻断生成")).toBeTruthy(),
    );
  });

  it("counts pending, stale and blocking entries and locates a pending provider", async () => {
    render(
      <AppProviders>
        <LibraryPage config={healthConfig} draftActions={draftActions} onRefreshConfig={() => {}} fetcher={makeFetcher()} />
      </AppProviders>,
    );
    await waitFor(() => expect(screen.getByText("ACL4SSR")).toBeTruthy());
    expect(screen.getByRole("button", { name: "2 待补全来源" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "1 失效来源" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "1 阻断生成" })).toBeTruthy();
    // .mrs providers surface as import problems in the sidebar, not pending providers
    expect(screen.getByText("导入问题")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "2 待补全来源" }));
    fireEvent.click(screen.getByRole("button", { name: "Draft 尚无可用数据来源" }));
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("data-testid")).toBe("provider-row-Draft"),
    );
  });

  it("opens rule defaults from a blocking defaults diagnostic", async () => {
    const badDefaults: RouteKitProjectConfig = {
      ...config,
      defaults: { ruleSets: { ruleProviderInterval: 0 } },
    };
    render(
      <AppProviders>
        <LibraryPage config={badDefaults} draftActions={draftActions} onRefreshConfig={() => {}} fetcher={makeFetcher()} />
      </AppProviders>,
    );
    await waitFor(() => expect(screen.getByText("ACL4SSR")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "1 阻断生成" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "规则默认值 [defaults.route.interval] RuleSet interval 必须为正整数",
      }),
    );
    expect(screen.getByRole("dialog", { name: "项目默认值" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "规则默认值" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });
});

describe("repo management entry", () => {
  it("opens the add-repo modal from the sidebar repo group header", async () => {
    render(
      <AppProviders>
        <LibraryPage config={config} draftActions={draftActions} onRefreshConfig={() => {}} fetcher={makeFetcher()} />
      </AppProviders>,
    );
    await waitFor(() => expect(screen.getByText("ACL4SSR")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "添加上游仓库" }));
    expect(await screen.findByRole("dialog", { name: "添加上游仓库" })).toBeTruthy();
  });

  it("opens the edit-repo modal for a declared vendor repo", async () => {
    render(
      <AppProviders>
        <LibraryPage config={config} draftActions={draftActions} onRefreshConfig={() => {}} fetcher={makeFetcher()} />
      </AppProviders>,
    );
    await waitFor(() => expect(screen.getByText("ACL4SSR")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "编辑 ACL4SSR" }));
    expect(await screen.findByRole("dialog", { name: "编辑上游仓库" })).toBeTruthy();
  });

  it("removes a repo after confirmation", async () => {
    const fetcher = makeFetcher();
    render(
      <AppProviders>
        <LibraryPage config={config} draftActions={draftActions} onRefreshConfig={() => {}} fetcher={fetcher} />
      </AppProviders>,
    );
    await waitFor(() => expect(screen.getByText("ACL4SSR")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "移除 ACL4SSR" }));
    fireEvent.click(await screen.findByRole("button", { name: /^移\s*除$/ }));
    await waitFor(() => {
      const calls = fetcher.mock.calls.map((call) => {
        const [input, init] = call as unknown as [RequestInfo | URL, RequestInit | undefined];
        return {
          url: String(input),
          method: init?.method ?? "GET",
        };
      });
      expect(calls.some((c) => c.url === "/api/vendor/remove" && c.method === "POST")).toBe(true);
    });
  });
});
