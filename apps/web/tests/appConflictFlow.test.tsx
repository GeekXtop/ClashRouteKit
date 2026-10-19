// @vitest-environment jsdom
// App 级写冲突回归测试（plan Review Focus #3 的 pin）：
// 自动保存 409 后必须挂起（不自动重试），覆盖重试以服务端最新 mtime 为 base，
// 再 409 对话框重现、成功后关框；覆盖/重载期间不得出现后台自动重试循环。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../src/App.js";

// vi.mock 工厂会被提升，yaml 字面量须内联在工厂内（不可引用顶层变量）。
vi.mock("../src/config.js", () => ({
  bundledSchemaVersion: 2,
  bundledProjectConfigYaml: `schemaVersion: 2
project:
  template:
    output: Custom_Clash.ini
proxyGroups:
  - id: proxy
    name: Proxy
    type: select
    members:
      - builtin: DIRECT
routes:
  - id: geosite-openai
    policy:
      group: proxy
    source:
      type: geosite
      value: openai
  - id: final
    policy:
      builtin: DIRECT
    source:
      type: final
ruleProviders:
  - id: ai
    name: AI
    output: AI_Domain.yaml
    behavior: domain
    enabled: true
    sources:
      - id: list
        name: list
        type: clash-list
        path: ai.list
`,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

interface PutRecord {
  baseMtime: unknown;
}

const documentYaml = `schemaVersion: 2
project:
  template:
    output: Custom_Clash.ini
proxyGroups:
  - id: proxy
    name: Proxy
    type: select
    members:
      - builtin: DIRECT
routes:
  - id: geosite-openai
    policy:
      group: proxy
    source:
      type: geosite
      value: openai
  - id: final
    policy:
      builtin: DIRECT
    source:
      type: final
ruleProviders:
  - id: ai
    name: AI
    output: AI_Domain.yaml
    behavior: domain
    enabled: true
    sources:
      - id: list
        name: list
        type: clash-list
        path: ai.list
`;

function stubConflictApi() {
  const puts: PutRecord[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/project/config" && (init?.method ?? "GET") === "GET") {
      return new Response(
        JSON.stringify({
          schemaVersion: 2,
          yaml: documentYaml,
          mtime: 100,
          publishBaseUrl: "http://127.0.0.1:8787",
          subconverterUrl: "http://127.0.0.1:25500/sub",
        }),
        { status: 200 },
      );
    }
    if (url === "/api/project/config" && init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as { baseMtime: number };
      puts.push({ baseMtime: body.baseMtime });
      const seq = puts.length;
      if (seq === 1) {
        return new Response(
          JSON.stringify({ ok: false, conflict: true, code: "config.conflict", currentYaml: "server-a", mtime: 200 }),
          { status: 409 },
        );
      }
      if (seq === 2) {
        return new Response(
          JSON.stringify({ ok: false, conflict: true, code: "config.conflict", currentYaml: "server-b", mtime: 300 }),
          { status: 409 },
        );
      }
      return new Response(
        JSON.stringify({ ok: true, schemaVersion: 2, yaml: "saved\n", mtime: 400, diagnostics: [] }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return puts;
}

function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("App 写冲突流（409 → 覆盖重试 → 成功）", () => {
  it("409 后自动保存挂起不再自动重试，覆盖以最新 mtime 逐次重试直至成功关框", { timeout: 20000 }, async () => {
    const puts = stubConflictApi();
    render(<App />);

    // 等装载完成（GET 已回）再进路由页，经组抽屉做一次真实编辑并保存（标记 dirty）
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "路由" })).toBeTruthy());
    fireEvent.click(screen.getByRole("menuitem", { name: "路由" }));
    const groupRow = await waitFor(() => {
      const row = document.querySelector('[data-group-row="Proxy"]');
      if (!row) throw new Error("group row not ready");
      return row;
    });
    fireEvent.click(groupRow);

    await screen.findByRole("dialog", { name: "策略组 · Proxy" });
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "策略组类型" }));
    fireEvent.click(await screen.findByText("fallback"));
    fireEvent.click(screen.getByRole("button", { name: "保 存" }));

    // 第一次自动保存：baseMtime 100 → 409，对话框出现
    await waitFor(() => expect(puts.length).toBe(1));
    await screen.findByText("配置文件已被外部修改");
    expect(puts[0]?.baseMtime).toBe(100);

    // 关键回归断言：冲突待决期间不得出现后台自动重试（旧实现每 600ms 一发）
    await settle(1300);
    expect(puts.length).toBe(1);

    // 覆盖 #1：以 409 返回的 mtime 200 为 base → 再 409
    fireEvent.click(screen.getByRole("button", { name: "覆 盖" }));
    await waitFor(() => expect(puts.length).toBe(2));
    expect(puts[1]?.baseMtime).toBe(200);
    await screen.findByText("配置文件已被外部修改");
    await settle(700);
    expect(puts.length).toBe(2);

    // 覆盖 #2：以最新 mtime 300 为 base → 200，保存成功基线刷新且不再发请求。
    // 注：jsdom 下 antd Modal 退场动画不结束、DOM 不会移除，故以「已保存」
    // 状态标记与请求停流代替对话框 DOM 消失断言。
    fireEvent.click(screen.getByRole("button", { name: "覆 盖" }));
    await waitFor(() => expect(puts.length).toBe(3));
    expect(puts[2]?.baseMtime).toBe(300);
    await waitFor(() => expect(screen.getByText("已保存")).toBeTruthy());
    await settle(700);
    expect(puts.length).toBe(3);
  });
});
