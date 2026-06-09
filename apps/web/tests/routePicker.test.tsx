// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RoutePicker } from "../src/components/RoutePicker.js";

afterEach(cleanup);

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

describe("RoutePicker", () => {
  it("fetches catalog entries and adds a geosite route with the chosen policy and section", async () => {
    const onAdd = vi.fn();
    const fetcher = vi.fn(async () => jsonResponse({ entries: ["openai", "youtube"] }));
    render(
      <RoutePicker
        policies={["Proxy", "Direct"]}
        sections={["AI"]}
        fetcher={fetcher}
        onAdd={onAdd}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByText("openai"));
    fireEvent.change(screen.getByLabelText("目标策略"), { target: { value: "Direct" } });
    fireEvent.change(screen.getByLabelText("段"), { target: { value: "AI" } });
    fireEvent.click(screen.getByText("添加到路由"));

    expect(onAdd).toHaveBeenCalledWith("openai", "Direct", "AI");
  });

  it("filters entries by the search query", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ entries: ["openai", "youtube"] }));
    render(
      <RoutePicker policies={["Proxy"]} sections={[]} fetcher={fetcher} onAdd={vi.fn()} onClose={vi.fn()} />,
    );

    await screen.findByText("openai");
    fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "you" } });
    expect(screen.queryByText("openai")).toBeNull();
    expect(screen.getByText("youtube")).toBeTruthy();
  });

  it("filters to category entries with the 仅分类 toggle", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ entries: ["openai", "category-ai-!cn"] }));
    render(
      <RoutePicker policies={["Proxy"]} sections={[]} fetcher={fetcher} onAdd={vi.fn()} onClose={vi.fn()} />,
    );

    await screen.findByText("openai");
    fireEvent.click(screen.getByText("仅分类"));
    expect(screen.queryByText("openai")).toBeNull();
    expect(screen.getByText("category-ai-!cn")).toBeTruthy();
  });
});
