// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { AppProviders } from "../src/components/AppProviders.js";
import { LocalTemplatePanel } from "../src/features/output/LocalTemplatePanel.js";
import { GithubPublishPanel } from "../src/features/output/GithubPublishPanel.js";

afterEach(cleanup);

afterEach(() => {
  vi.useRealTimers();
});

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

const jsonOk = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;

const mountStatusMain = { branch: "main", workflow: { state: "unsupported" } };

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
  it("runs build+push on main and notes a missing GitHub origin", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const action = /\/api\/actions\/([\w-]+)/.exec(url)?.[1] ?? "";
      if (action) calls.push(action);
      if (url.includes("/api/git/remote")) return jsonOk({ url: "" });
      if (url.includes("/api/git/publish-status")) return jsonOk(mountStatusMain);
      return jsonOk({ action, ok: true, output: "ok" });
    });
    render(
      <AppProviders>
        <GithubPublishPanel config={config} fetcher={fetcher} />
      </AppProviders>,
    );
    expect(screen.getByText("未检测到 GitHub origin，当前仅本机 LAN 可用")).toBeTruthy();
    await waitFor(() => expect((screen.getByTestId("publish-main-button") as HTMLButtonElement).disabled).toBe(false));
    const button = screen.getByTestId("publish-main-button");
    expect(button.textContent).toBe("提交并推送 main");
    fireEvent.click(button);
    await waitFor(() => expect(calls).toEqual(expect.arrayContaining(["generate", "git-commit", "git-push"])));
  });

  it("shows an ini diff for the current template instead of repository git status", () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const action = /\/api\/actions\/([\w-]+)/.exec(url)?.[1] ?? "";
      if (action) calls.push(action);
      if (url.includes("/api/git/remote")) return jsonOk({ url: "" });
      if (url.includes("/api/git/publish-status")) return jsonOk(mountStatusMain);
      return jsonOk({ action, ok: true, output: "ok" });
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

  it("blocks publishing and warns when the current branch is not main", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const action = /\/api\/actions\/([\w-]+)/.exec(url)?.[1] ?? "";
      if (action) calls.push(action);
      if (url.includes("/api/git/remote")) {
        return jsonOk({ url: "https://github.com/acme/routes.git" });
      }
      if (url.includes("/api/git/publish-status")) {
        return jsonOk({ branch: "feature-x", workflow: { state: "unsupported" } });
      }
      return jsonOk({ action, ok: true, output: "ok" });
    });
    render(
      <AppProviders>
        <GithubPublishPanel config={config} fetcher={fetcher} />
      </AppProviders>,
    );
    const branchTag = await screen.findByTestId("publish-branch");
    expect(branchTag.textContent).toBe("feature-x");
    expect(screen.getByText("请切换或合并到 main 后发布")).toBeTruthy();
    const button = screen.getByTestId("publish-main-button") as HTMLButtonElement;
    expect(button.textContent).toBe("提交并推送 main");
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    await act(async () => {});
    expect(calls).toEqual([]);
  });

  it("keeps publishing blocked when the branch cannot be read", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/git/publish-status")) {
        return { ok: false, json: async () => ({ ok: false, output: "boom" }) } as unknown as Response;
      }
      return jsonOk({ url: "https://github.com/acme/routes.git" });
    });
    render(
      <AppProviders>
        <GithubPublishPanel config={config} fetcher={fetcher} />
      </AppProviders>,
    );
    expect(await screen.findByTestId("publish-branch-unknown")).toBeTruthy();
    expect((screen.getByTestId("publish-main-button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("polls publish status after push and marks the raw url latest on success", async () => {
    const pollResponses: Array<Record<string, unknown>> = [
      { branch: "main", workflow: { state: "queued", createdAt: "2026-09-13T01:00:00Z" } },
      {
        branch: "main",
        workflow: {
          state: "in-progress",
          createdAt: "2026-09-13T01:00:00Z",
          runUrl: "https://github.com/acme/routes/actions/runs/7",
        },
      },
      {
        branch: "main",
        workflow: {
          state: "success",
          conclusion: "success",
          createdAt: "2026-09-13T01:00:00Z",
          runUrl: "https://github.com/acme/routes/actions/runs/7",
        },
      },
    ];
    let phase: "mount" | "poll" = "mount";
    let statusCalls = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/git/publish-status")) {
        statusCalls += 1;
        if (phase === "mount") return jsonOk(mountStatusMain);
        const body = pollResponses.shift() ?? pollResponses[pollResponses.length - 1];
        return jsonOk(body);
      }
      if (url.includes("/api/git/remote")) {
        return jsonOk({ url: "https://github.com/acme/routes.git" });
      }
      return jsonOk({ action: /\/api\/actions\/([\w-]+)/.exec(url)?.[1] ?? "", ok: true, output: "ok" });
    });
    render(
      <AppProviders>
        <GithubPublishPanel config={config} fetcher={fetcher} />
      </AppProviders>,
    );
    await screen.findByText("提交并推送 main");
    await waitFor(() => expect((screen.getByTestId("publish-main-button") as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByTestId("publish-raw-latest")).toBeNull();

    // fake timers 先于轮询定时器注册：点击后的推送链是纯微任务，用 0ms 推进冲刷
    phase = "poll";
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("publish-main-button"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByText("Actions 排队中")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByText("Actions 运行中")).toBeTruthy();
    expect(screen.getByText("查看运行")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByText("Actions 成功")).toBeTruthy();
    expect(screen.getByTestId("publish-raw-latest")).toBeTruthy();
    // 挂载 1 次 + 轮询 3 次；终态后停止轮询
    expect(statusCalls).toBe(4);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(statusCalls).toBe(4);
  });

  it("reports a failed workflow run after push", async () => {
    let phase: "mount" | "poll" = "mount";
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/git/publish-status")) {
        if (phase === "mount") return jsonOk(mountStatusMain);
        return jsonOk({
          branch: "main",
          workflow: {
            state: "failed",
            conclusion: "failure",
            createdAt: "2026-09-13T01:00:00Z",
            runUrl: "https://github.com/acme/routes/actions/runs/8",
          },
        });
      }
      if (url.includes("/api/git/remote")) {
        return jsonOk({ url: "https://github.com/acme/routes.git" });
      }
      return jsonOk({ action: /\/api\/actions\/([\w-]+)/.exec(url)?.[1] ?? "", ok: true, output: "ok" });
    });
    render(
      <AppProviders>
        <GithubPublishPanel config={config} fetcher={fetcher} />
      </AppProviders>,
    );
    await screen.findByText("提交并推送 main");
    await waitFor(() => expect((screen.getByTestId("publish-main-button") as HTMLButtonElement).disabled).toBe(false));
    phase = "poll";
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("publish-main-button"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByText("Actions 失败")).toBeTruthy();
    expect(screen.getByText("GitHub Actions 发布失败")).toBeTruthy();
  });

  it("stops polling when the panel unmounts", async () => {
    let phase: "mount" | "poll" = "mount";
    let statusCalls = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/git/publish-status")) {
        statusCalls += 1;
        if (phase === "mount") return jsonOk(mountStatusMain);
        return jsonOk({ branch: "main", workflow: { state: "queued" } });
      }
      if (url.includes("/api/git/remote")) {
        return jsonOk({ url: "https://github.com/acme/routes.git" });
      }
      return jsonOk({ action: /\/api\/actions\/([\w-]+)/.exec(url)?.[1] ?? "", ok: true, output: "ok" });
    });
    const { unmount } = render(
      <AppProviders>
        <GithubPublishPanel config={config} fetcher={fetcher} />
      </AppProviders>,
    );
    await screen.findByText("提交并推送 main");
    await waitFor(() => expect((screen.getByTestId("publish-main-button") as HTMLButtonElement).disabled).toBe(false));
    phase = "poll";
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("publish-main-button"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(statusCalls).toBe(2);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(statusCalls).toBe(2);
  });
});
