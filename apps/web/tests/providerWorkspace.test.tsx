// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { ProviderWorkspace } from "../src/components/ProviderWorkspace.js";

afterEach(cleanup);

const config: RouteKitProjectConfig = {
  publishBaseUrl: "http://127.0.0.1:8787",
  template: { output: "Custom_Clash.ini" },
  vendorRepos: [],
  globalRemove: ["ban.example"],
  customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
  ruleSets: [
    { id: "ai", policy: "Proxy", source: { type: "rule-provider", behavior: "domain", file: "AI_Domain.yaml" } },
    { id: "final", policy: "Proxy", source: { type: "final" } },
  ],
  ruleProviders: [
    { name: "AI", output: "AI_Domain.yaml", behavior: "domain", sources: [] },
    { name: "Orphan", output: "Orphan_Domain.yaml", behavior: "domain", sources: [] },
  ],
};

function renderWorkspace(overrides: Partial<Parameters<typeof ProviderWorkspace>[0]> = {}) {
  const props = {
    config,
    selectedProvider: config.ruleProviders![0],
    onCreateProvider: vi.fn(),
    onDeleteProvider: vi.fn(),
    onSelectProvider: vi.fn(),
    onSetGlobalRemove: vi.fn(),
    onSetProviderListField: vi.fn(),
    onSetProviderSources: vi.fn(),
    onUpdateProvider: vi.fn(),
    ...overrides,
  };
  render(<ProviderWorkspace {...props} />);
  return props;
}

describe("ProviderWorkspace", () => {
  it("edits the global remove list from the dedicated entry", () => {
    const onSetGlobalRemove = vi.fn();
    renderWorkspace({ onSetGlobalRemove });
    fireEvent.click(screen.getByText("全局移除清单"));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "ban.example\nads.example" },
    });
    expect(onSetGlobalRemove).toHaveBeenCalledWith(["ban.example", "ads.example"]);
  });

  it("lists the rule sets that reference the selected provider", () => {
    renderWorkspace();
    expect(screen.getByText("被引用")).toBeTruthy();
    expect(screen.getByText("ai")).toBeTruthy();
  });

  it("warns when the selected provider is an orphan", () => {
    renderWorkspace({ selectedProvider: config.ruleProviders![1] });
    expect(screen.getByText(/未被任何/)).toBeTruthy();
  });
});
