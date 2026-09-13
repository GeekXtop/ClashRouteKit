// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { LibraryHealthBar, type LibraryHealthItem } from "../src/components/LibraryHealthBar.js";

afterEach(cleanup);

const pendingItem: LibraryHealthItem = {
  id: "pending:DraftA",
  title: "DraftA",
  detail: "尚无可用数据来源",
  providerName: "DraftA",
};
const staleItem: LibraryHealthItem = {
  id: "stale:StaleB",
  title: "StaleB",
  detail: "config/rules/Gone.list（本地文件缺失）",
  providerName: "StaleB",
};
const blockingProviderItem: LibraryHealthItem = {
  id: "blocking:0",
  title: "DraftA",
  detail: "[provider.sources.empty] 启用的规则源 DraftA 至少需要一个数据源",
  providerName: "DraftA",
};
const plainItem: LibraryHealthItem = {
  id: "blocking:9",
  title: "全局问题",
  detail: "[route.final.missing] ruleSets 需要包含一条 FINAL 兜底规则",
};

function renderBar(items?: {
  pending?: LibraryHealthItem[];
  stale?: LibraryHealthItem[];
  blocking?: LibraryHealthItem[];
}, onLocate = vi.fn()) {
  render(
    <AppProviders>
      <LibraryHealthBar
        pending={items?.pending ?? []}
        stale={items?.stale ?? []}
        blocking={items?.blocking ?? []}
        onLocate={onLocate}
      />
    </AppProviders>,
  );
  return { onLocate };
}

describe("LibraryHealthBar", () => {
  it("shows a pass status when all three categories are empty", () => {
    renderBar();
    expect(
      screen.getByText("规则库健康：无待补全来源、无失效来源、无阻断生成"),
    ).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /待补全来源/ })).toBeNull();
  });

  it("renders one count chip per non-empty category", () => {
    renderBar({ pending: [pendingItem], stale: [staleItem], blocking: [blockingProviderItem, plainItem] });
    expect(screen.getByRole("button", { name: "1 待补全来源" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "1 失效来源" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "2 阻断生成" })).toBeTruthy();
    expect(screen.queryByText("0 待补全来源")).toBeNull();
  });

  it("keeps category lists collapsed until the chip is clicked", () => {
    renderBar({ pending: [pendingItem] });
    expect(screen.queryByText("DraftA")).toBeNull();
    const chip = screen.getByRole("button", { name: "1 待补全来源" });
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("DraftA")).toBeTruthy();
  });

  it("locates locatable items and keeps plain items unclickable", () => {
    const { onLocate } = renderBar({ blocking: [blockingProviderItem, plainItem] });
    fireEvent.click(screen.getByRole("button", { name: "2 阻断生成" }));
    const locateButton = screen.getByRole("button", {
      name: "DraftA [provider.sources.empty] 启用的规则源 DraftA 至少需要一个数据源",
    });
    fireEvent.click(locateButton);
    expect(onLocate).toHaveBeenCalledWith(blockingProviderItem);
    expect(screen.queryByRole("button", { name: /全局问题/ })).toBeNull();
    expect(screen.getByText(/全局问题/)).toBeTruthy();
  });

  it("toggles a category list closed on a second click", () => {
    renderBar({ stale: [staleItem] });
    const chip = screen.getByRole("button", { name: "1 失效来源" });
    fireEvent.click(chip);
    expect(screen.getByText("StaleB")).toBeTruthy();
    fireEvent.click(chip);
    expect(screen.queryByText("StaleB")).toBeNull();
  });
});
