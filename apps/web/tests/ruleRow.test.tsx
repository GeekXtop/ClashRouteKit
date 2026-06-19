// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { RuleRow } from "../src/components/RuleRow.js";
import type { RuleSet } from "@clash-route-kit/core";

afterEach(cleanup);

const ruleSet: RuleSet = { id: "geosite-openai", policy: "Proxy", source: { type: "geosite", value: "openai" } };
const noop = { draggable: true, onDragStart: () => {}, onDragOver: () => {}, onDrop: () => {} };

it("invokes onToggle and onDelete", () => {
  const onToggle = vi.fn();
  const onDelete = vi.fn();
  render(
    <AppProviders>
      <RuleRow
        ruleSet={ruleSet}
        sourceText="[]GEOSITE,openai"
        tone="reg"
        policies={["Proxy", "Direct"]}
        selected={false}
        onSelect={() => {}}
        onPolicyChange={() => {}}
        onToggle={onToggle}
        onDelete={onDelete}
        dragHandlers={noop}
      />
    </AppProviders>,
  );
  fireEvent.click(screen.getByRole("switch"));
  expect(onToggle).toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("删除 geosite-openai"));
  expect(onDelete).toHaveBeenCalled();
});

it("hides toggle and delete for FINAL rows", () => {
  render(
    <AppProviders>
      <RuleRow
        ruleSet={{ id: "final", policy: "Fish", source: { type: "final" } }}
        sourceText="[]FINAL"
        tone="fin"
        policies={["Fish"]}
        selected={false}
        onSelect={() => {}}
        onPolicyChange={() => {}}
        onToggle={() => {}}
        onDelete={() => {}}
        dragHandlers={noop}
      />
    </AppProviders>,
  );
  expect(screen.queryByRole("switch")).toBeNull();
});
