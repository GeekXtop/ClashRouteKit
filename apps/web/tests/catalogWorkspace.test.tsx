// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CatalogWorkspace } from "../src/components/CatalogWorkspace.js";
import type { RuleFileState } from "../src/components/RuleFileWorkspace.js";

afterEach(cleanup);

const baseRuleFileState: RuleFileState = {
  files: ["AI.list", "Direct.list"],
  selectedFile: "",
  text: "",
  status: "idle",
  message: "尚未读取规则文件",
};

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

function makeFetcher() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/catalog/entries")) {
      return jsonResponse({ entries: ["anthropic", "openai", "youtube"] });
    }
    if (url.includes("/api/catalog/domains")) {
      return jsonResponse({ domains: ["DOMAIN-SUFFIX,openai.com"] });
    }
    if (url.includes("/api/catalog/entry")) {
      return jsonResponse({ name: "openai", includes: ["openai-inc"], ruleCount: 3 });
    }
    return jsonResponse({ ok: false });
  });
}

function renderWorkspace(overrides: Partial<Parameters<typeof CatalogWorkspace>[0]> = {}) {
  const props = {
    ruleFileState: baseRuleFileState,
    onLoadRuleFile: vi.fn(),
    onSaveRuleFile: vi.fn(),
    onRefreshRuleFiles: vi.fn(),
    onRuleFileTextChange: vi.fn(),
    fetcher: makeFetcher(),
    ...overrides,
  };
  render(<CatalogWorkspace {...props} />);
  return props;
}

describe("CatalogWorkspace", () => {
  it("renders the source list and upstream entry grid", async () => {
    renderWorkspace();
    expect(screen.getByText("domain-list-community")).toBeTruthy();
    expect(screen.getByText("本地 .list")).toBeTruthy();
    expect(await screen.findByText("openai")).toBeTruthy();
    expect(screen.getByText("anthropic")).toBeTruthy();
  });

  it("shows a read-only domain detail when an upstream entry is selected", async () => {
    renderWorkspace();
    fireEvent.click(await screen.findByText("openai"));
    expect(await screen.findByText("+.openai.com")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows the local rule-file editor with a save control", () => {
    const onLoadRuleFile = vi.fn();
    renderWorkspace({ onLoadRuleFile });
    fireEvent.click(screen.getByText("本地 .list"));
    fireEvent.click(screen.getByText("AI.list"));
    expect(onLoadRuleFile).toHaveBeenCalledWith("AI.list");
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByText("保存规则文件")).toBeTruthy();
  });

  it("filters upstream entries by the search query", async () => {
    renderWorkspace();
    await screen.findByText("openai");
    fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "you" } });
    expect(screen.queryByText("openai")).toBeNull();
    expect(screen.getByText("youtube")).toBeTruthy();
  });
});
