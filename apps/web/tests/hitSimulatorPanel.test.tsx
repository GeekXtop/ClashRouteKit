// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HitSimulatorPanel } from "../src/components/HitSimulatorPanel.js";

afterEach(() => {
  cleanup();
});

const matchedResponse = {
  ok: true,
  result: {
    status: "matched",
    domain: "www.openai.com",
    matched: {
      index: 0,
      routeId: "ai",
      label: "GEOSITE,ai",
      policyLabel: "Proxy",
      chain: [{ id: "proxy", name: "Proxy", type: "select" }],
      possibleTerminals: ["runtime-select:Proxy"],
    },
    trace: [
      { index: 0, routeId: "ai", label: "GEOSITE,ai", outcome: { kind: "hit" } },
      { index: 1, routeId: "final", label: "FINAL", outcome: { kind: "not-evaluated" } },
    ],
  },
};

function jsonFetcher(payload: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(payload), { status }));
}

describe("HitSimulatorPanel", () => {
  it("输入域名点模拟 → POST 请求体只带 domain（未传 yaml 时）", async () => {
    const fetcher = jsonFetcher(matchedResponse);
    render(<HitSimulatorPanel fetcher={fetcher as unknown as never} />);
    fireEvent.change(screen.getByPlaceholderText("输入域名，如 www.example.com"), {
      target: { value: "www.openai.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /模\s*拟/ }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const [input, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(input).toBe("/api/route-simulate");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ domain: "www.openai.com" });
  });

  it("命中结果展示命中路由、策略链与可能终点", async () => {
    const fetcher = jsonFetcher(matchedResponse);
    render(<HitSimulatorPanel fetcher={fetcher as unknown as never} />);
    fireEvent.change(screen.getByPlaceholderText("输入域名，如 www.example.com"), {
      target: { value: "www.openai.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /模\s*拟/ }));
    await waitFor(() => screen.getByText(/命中路由：/));
    const summary = screen.getByText(/命中路由：/).textContent ?? "";
    expect(summary).toContain("GEOSITE,ai");
    expect(summary).toContain("Proxy");
    expect(screen.getByText(/runtime-select:Proxy/)).toBeTruthy();
    fireEvent.click(screen.getByText(/评估轨迹/));
    expect(await screen.findByText("未评估")).toBeTruthy();
  });

  it("未命中显示兜底提示；请求失败显示原因", async () => {
    const unmatched = jsonFetcher({
      ok: true,
      result: { status: "unmatched", domain: "a.com", trace: [] },
    });
    const { unmount } = render(<HitSimulatorPanel fetcher={unmatched as unknown as never} />);
    fireEvent.change(screen.getByPlaceholderText("输入域名，如 www.example.com"), {
      target: { value: "a.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /模\s*拟/ }));
    await waitFor(() => expect(screen.getByText(/未命中/)).toBeTruthy());
    unmount();

    const failing = vi.fn(async () => new Response(JSON.stringify({ ok: false, output: "Invalid domain" }), { status: 400 }));
    render(<HitSimulatorPanel fetcher={failing as unknown as never} />);
    fireEvent.change(screen.getByPlaceholderText("输入域名，如 www.example.com"), {
      target: { value: "bad" },
    });
    fireEvent.click(screen.getByRole("button", { name: /模\s*拟/ }));
    await waitFor(() => expect(screen.getByText(/Invalid domain/)).toBeTruthy());
  });
});
