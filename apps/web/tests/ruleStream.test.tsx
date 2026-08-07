// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { RuleStream } from "../src/components/RuleStream.js";
import type { RuleSet } from "@clash-route-kit/core";

afterEach(cleanup);

const ruleSets: RuleSet[] = [
  { id: "a", policy: "Direct", section: "直连", source: { type: "geosite", value: "cn" } },
  { id: "b", policy: "Proxy", section: "代理", source: { type: "geosite", value: "gfw" } },
];

function setup(over: Partial<Parameters<typeof RuleStream>[0]> = {}) {
  const props = {
    ruleSets,
    selectedGroup: null,
    selectedRuleSetId: "a",
    onSelectRuleSet: vi.fn(),
    onToggle: vi.fn(),
    onEditRule: vi.fn(),
    onReorder: vi.fn(),
    allOrderedIds: ["a", "b"],
    onAddRule: vi.fn(),
    ...over,
  };
  render(
    <AppProviders>
      <RuleStream {...props} />
    </AppProviders>,
  );
  return props;
}

it("renders section headers and rows", () => {
  setup();
  expect(screen.getByText("; 直连")).toBeTruthy();
  expect(screen.getByText("; 代理")).toBeTruthy();
  expect(screen.getByTestId("route-row-a")).toBeTruthy();
});

it("labels add button with the selected group", () => {
  const props = setup({ selectedGroup: "Proxy" });
  fireEvent.click(screen.getByText(/给「Proxy」添加规则/));
  expect(props.onAddRule).toHaveBeenCalled();
});

it("keeps section headers while filtering by policy group", () => {
  setup({ selectedGroup: "Proxy" });
  expect(screen.getByText("; 直连")).toBeTruthy();
  expect(screen.getByText("; 代理")).toBeTruthy();
});

it("marks routes backed by incomplete rule providers", () => {
  setup({
    ruleSets: [
      {
        id: "custom-provider",
        policy: "Proxy",
        source: { type: "rule-provider", behavior: "classical", file: "Custom_Direct.yaml" },
      },
    ],
    incompleteProviderOutputs: new Set(["Custom_Direct.yaml"]),
    allOrderedIds: ["custom-provider"],
  });

  expect(screen.getByText("规则源待补全")).toBeTruthy();
});

it("renders a caller-provided empty explanation", () => {
  setup({
    ruleSets: [],
    allOrderedIds: [],
    emptyDescription: (
      <>
        <div>当前没有 RuleSet 直接指向此组。</div>
        <div>该组仍可作为下游策略组被其他组引用。</div>
      </>
    ),
  });

  expect(screen.getByText("当前没有 RuleSet 直接指向此组。")).toBeTruthy();
  expect(screen.queryByText("没有匹配规则")).toBeNull();
});

it("uses project defaults in rendered RuleSet source text", () => {
  setup({
    ruleSets: [
      { id: "geoip", policy: "Proxy", source: { type: "geoip", value: "cn" } },
    ],
    allOrderedIds: ["geoip"],
    defaults: { ruleSets: { geoipNoResolve: false } },
  });

  expect(screen.getByText("[]GEOIP,cn")).toBeTruthy();
  expect(screen.queryByText("[]GEOIP,cn,no-resolve")).toBeNull();
});
