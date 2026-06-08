// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PublishPanel } from "../src/components/PublishPanel.js";
import { createInitialActionStates } from "../src/publishWorkflow.js";

afterEach(cleanup);

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

function renderPanel(overrides: Partial<Parameters<typeof PublishPanel>[0]> = {}) {
  const props = {
    actionStates: createInitialActionStates(),
    dirty: false,
    draftYamlLength: 100,
    projectMessage: "ready",
    projectStatus: "ready",
    publishBaseUrl: "http://127.0.0.1:8787",
    saveReadiness: { ok: true } as const,
    template: { output: "Custom_Clash.ini" },
    fetcher: vi.fn(async () => jsonResponse({ url: "git@github.com:foo/bar.git" })),
    onRun: vi.fn(),
    onSave: vi.fn(),
    onSetTemplateField: vi.fn(),
    ...overrides,
  };
  render(<PublishPanel {...props} />);
  return props;
}

describe("PublishPanel", () => {
  it("writes the template output filename through onSetTemplateField", () => {
    const { onSetTemplateField } = renderPanel();
    fireEvent.change(screen.getByLabelText("模板输出文件名"), { target: { value: "My_Clash.ini" } });
    expect(onSetTemplateField).toHaveBeenCalledWith({ output: "My_Clash.ini" });
  });

  it("toggles between local and GitHub publish modes", () => {
    renderPanel();
    expect(screen.queryByLabelText("Owner")).toBeNull();
    fireEvent.click(screen.getByText("GitHub"));
    expect(screen.getByLabelText("Owner")).toBeTruthy();
  });

  it("auto-detects the repository from the git remote", async () => {
    renderPanel();
    fireEvent.click(screen.getByText("GitHub"));
    fireEvent.click(screen.getByText("自动探测仓库"));
    await screen.findByDisplayValue("foo");
    expect((screen.getByLabelText("Owner") as HTMLInputElement).value).toBe("foo");
    expect((screen.getByLabelText("Repo") as HTMLInputElement).value).toBe("bar");
  });
});
