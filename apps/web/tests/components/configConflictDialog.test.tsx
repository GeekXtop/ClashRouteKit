// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../../src/components/AppProviders.js";
import { ConfigConflictDialog } from "../../src/components/ConfigConflictDialog.js";

afterEach(cleanup);

function renderDialog(overrides: Partial<Parameters<typeof ConfigConflictDialog>[0]> = {}) {
  const onOverwrite = vi.fn();
  const onReload = vi.fn();
  const onCancel = vi.fn();
  render(
    <AppProviders>
      <ConfigConflictDialog
        open
        serverMtime={1750000000000}
        onOverwrite={onOverwrite}
        onReload={onReload}
        onCancel={onCancel}
        {...overrides}
      />
    </AppProviders>,
  );
  return { onOverwrite, onReload, onCancel };
}

describe("ConfigConflictDialog", () => {
  it("渲染冲突提示与覆盖/重载两个动作", () => {
    renderDialog();
    expect(screen.getByText("配置文件已被外部修改")).toBeTruthy();
    expect(screen.getByRole("button", { name: "覆盖" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "重载" })).toBeTruthy();
  });

  it("点击覆盖触发 onOverwrite，点击重载触发 onReload", () => {
    const { onOverwrite, onReload } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "覆盖" }));
    fireEvent.click(screen.getByRole("button", { name: "重载" }));
    expect(onOverwrite).toHaveBeenCalledTimes(1);
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("open=false 时不渲染", () => {
    renderDialog({ open: false });
    expect(screen.queryByText("配置文件已被外部修改")).toBeNull();
  });
});
