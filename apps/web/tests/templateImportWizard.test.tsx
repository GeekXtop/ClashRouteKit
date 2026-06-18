// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TemplateImportWizard } from "../src/components/TemplateImportWizard.js";

afterEach(cleanup);

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

describe("TemplateImportWizard", () => {
  it("parses pasted INI, previews, and applies as a replace", async () => {
    const onApply = vi.fn();
    const fetcher = vi.fn(async () => jsonResponse({ sources: [] }));
    render(<TemplateImportWizard fetcher={fetcher} onApply={onApply} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("INI 文本"), {
      target: { value: "[custom]\nruleset=Proxy,[]FINAL\n" },
    });
    fireEvent.click(screen.getByText("解析预览"));

    const apply = await screen.findByText("覆盖整份配置");
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledTimes(1);
    const imported = onApply.mock.calls[0]![0] as { ruleSets: unknown[] };
    expect(imported.ruleSets.length).toBeGreaterThan(0);
  });

  it("does not apply before a successful parse", () => {
    const onApply = vi.fn();
    const fetcher = vi.fn(async () => jsonResponse({ sources: [] }));
    render(<TemplateImportWizard fetcher={fetcher} onApply={onApply} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("覆盖整份配置"));
    expect(onApply).not.toHaveBeenCalled();
  });
});
