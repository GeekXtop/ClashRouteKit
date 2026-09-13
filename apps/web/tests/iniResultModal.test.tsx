// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { AppProviders } from "../src/components/AppProviders.js";
import { IniResultModal } from "../src/components/IniResultModal.js";

afterEach(cleanup);

const config: RouteKitProjectConfig = {
  publishBaseUrl: "http://127.0.0.1:8787",
  template: { output: "Custom_Clash.ini" },
  vendorRepos: [],
  customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
  ruleSets: [{ id: "final", policy: "Proxy", source: { type: "final" } }],
  ruleProviders: [],
};

describe("IniResultModal", () => {
  it("renders nothing while closed", () => {
    render(
      <AppProviders>
        <IniResultModal open={false} config={config} onClose={() => {}} />
      </AppProviders>,
    );
    expect(screen.queryByTestId("ini-result")).toBeNull();
  });

  it("renders the current INI on demand and reports close intent", () => {
    const onClose = vi.fn();
    render(
      <AppProviders>
        <IniResultModal open config={config} onClose={onClose} />
      </AppProviders>,
    );
    expect(screen.getByTestId("ini-result").textContent).toContain("ruleset=Proxy");
    expect(screen.getByRole("dialog", { name: "生成结果（INI）" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
