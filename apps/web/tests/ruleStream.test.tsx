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
    policies: ["Direct", "Proxy"],
    selectedRuleSetId: "a",
    onSelectRuleSet: vi.fn(),
    onPolicyChange: vi.fn(),
    onToggle: vi.fn(),
    onDelete: vi.fn(),
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
