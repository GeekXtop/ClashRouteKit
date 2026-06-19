// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RuleSet } from "@clash-route-kit/core";
import { AppProviders } from "../src/components/AppProviders.js";
import { RuleDrawer } from "../src/components/RuleDrawer.js";

afterEach(cleanup);

it("edits a rule's source value and exposes delete", () => {
  const onUpdate = vi.fn();
  const ruleSet: RuleSet = { id: "ai-geosite-openai", policy: "AI", source: { type: "geosite", value: "openai" } };
  render(
    <AppProviders>
      <RuleDrawer open ruleSet={ruleSet} policies={["AI", "Direct"]} onClose={() => {}} onUpdate={onUpdate} onDelete={() => {}} />
    </AppProviders>,
  );
  expect(screen.getByDisplayValue("ai-geosite-openai")).toBeTruthy();
  fireEvent.change(screen.getByDisplayValue("openai"), { target: { value: "anthropic" } });
  expect(onUpdate).toHaveBeenCalledWith({ source: { type: "geosite", value: "anthropic" } });
});
