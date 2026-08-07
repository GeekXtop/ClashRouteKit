// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { RuleRow } from "../src/components/RuleRow.js";
import type { RuleSet } from "@clash-route-kit/core";

afterEach(cleanup);

const ruleSet: RuleSet = { id: "geosite-openai", policy: "Proxy", source: { type: "geosite", value: "openai" } };
const noop = { draggable: true, onDragStart: () => {}, onDragOver: () => {}, onDrop: () => {} };

it("invokes onToggle and onEdit", () => {
  const onToggle = vi.fn();
  const onEdit = vi.fn();
  render(
    <AppProviders>
      <RuleRow
        ruleSet={ruleSet}
        sourceText="[]GEOSITE,openai"
        tone="reg"
        selected={false}
        onSelect={() => {}}
        onToggle={onToggle}
        onEdit={onEdit}
        dragHandlers={noop}
      />
    </AppProviders>,
  );
  fireEvent.click(screen.getByRole("switch"));
  expect(onToggle).toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("编辑 geosite-openai"));
  expect(onEdit).toHaveBeenCalled();
});

it("hides the toggle but keeps edit for FINAL rows", () => {
  const onEdit = vi.fn();
  render(
    <AppProviders>
      <RuleRow
        ruleSet={{ id: "final", policy: "Fish", source: { type: "final" } }}
        sourceText="[]FINAL"
        tone="fin"
        selected={false}
        onSelect={() => {}}
        onToggle={() => {}}
        onEdit={onEdit}
        dragHandlers={noop}
      />
    </AppProviders>,
  );
  expect(screen.queryByRole("switch")).toBeNull();
  fireEvent.click(screen.getByLabelText("编辑 final"));
  expect(onEdit).toHaveBeenCalled();
});

it("shows policy read-only without a row delete action", () => {
  render(
    <AppProviders>
      <RuleRow
        ruleSet={ruleSet}
        sourceText="[]GEOSITE,openai"
        tone="reg"
        selected={false}
        onSelect={() => {}}
        onToggle={() => {}}
        onEdit={() => {}}
        dragHandlers={noop}
      />
    </AppProviders>,
  );
  expect(screen.getByText("Proxy").className).toContain("ant-tag");
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.queryByLabelText("删除 geosite-openai")).toBeNull();
});
