// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../src/App.js";

// 根 vitest.config 未注册 virtual:routes-config-yaml 插件，
// 这里整体替换 config 模块，避免 App 装配测试依赖构建期内联配置。
// vi.mock 工厂会被提升，yaml 字面量须内联在工厂内（不可引用顶层变量）。
vi.mock("../src/config.js", () => ({
  bundledSchemaVersion: 2,
  bundledProjectConfigYaml: `schemaVersion: 2
project:
  template:
    output: Custom_Clash.ini
proxyGroups: []
routes:
  - id: final
    policy:
      builtin: DIRECT
    source:
      type: final
ruleProviders: []
`,
}));

const bundledYaml = `schemaVersion: 2
project:
  template:
    output: Custom_Clash.ini
proxyGroups: []
routes:
  - id: final
    policy:
      builtin: DIRECT
    source:
      type: final
ruleProviders: []
`;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubLocalApi() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/project/config")) {
      return {
        ok: true,
        json: async () => ({
          schemaVersion: 2,
          yaml: bundledYaml,
          publishBaseUrl: "http://127.0.0.1:8787",
          subconverterUrl: "http://127.0.0.1:25500/sub",
        }),
      } as unknown as Response;
    }
    if (url.includes("/api/git/remote")) {
      return { ok: true, json: async () => ({ url: "" }) } as unknown as Response;
    }
    const action = /\/api\/actions\/([\w-]+)/.exec(url)?.[1] ?? "";
    return { ok: true, json: async () => ({ action, ok: true, output: "ok" }) } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("App four-page navigation", () => {
  it("lands on the project page and renders the four primary nav items", async () => {
    stubLocalApi();
    render(<App />);
    for (const label of ["项目", "规则库", "路由", "输出"]) {
      expect(screen.getByRole("menuitem", { name: label })).toBeTruthy();
    }
    await waitFor(() => expect(screen.getByText("项目状态")).toBeTruthy());
  });

  it("keeps the global top bar free of the import button", async () => {
    stubLocalApi();
    render(<App />);
    await waitFor(() => expect(screen.getByText("项目状态")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "导入模板" })).toBeNull();
  });

  it("switches between the output page and the project page", async () => {
    stubLocalApi();
    render(<App />);
    await waitFor(() => expect(screen.getByText("项目状态")).toBeTruthy());

    fireEvent.click(screen.getByRole("menuitem", { name: "输出" }));
    await waitFor(() => expect(screen.getByText("生成 config.yaml")).toBeTruthy());

    fireEvent.click(screen.getByRole("menuitem", { name: "项目" }));
    await waitFor(() => expect(screen.getByText("项目状态")).toBeTruthy());
  });
});
