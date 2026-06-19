// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { ConfigYamlSection } from "../src/components/ConfigYamlSection.js";

afterEach(cleanup);

it("builds a subconverter download url from subscriptions", async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/api/subscriptions"))
      return { ok: true, json: async () => ({ subscriptions: [{ id: "a", name: "A", url: "https://air/sub", enabled: true }] }) } as unknown as Response;
    return { ok: true, json: async () => ({}) } as unknown as Response;
  });
  render(
    <AppProviders>
      <ConfigYamlSection
        publishBaseUrl="http://127.0.0.1:8787"
        templateOutput="Custom_Clash.ini"
        subconverterUrl="http://10.0.0.3:25500/sub"
        fetcher={fetcher}
      />
    </AppProviders>,
  );
  await waitFor(() => expect(screen.getByDisplayValue("https://air/sub")).toBeTruthy());
  fireEvent.click(screen.getByText("生成 config.yaml"));
  await waitFor(() =>
    expect(screen.getByText("下载").closest("a")?.getAttribute("href")).toContain("10.0.0.3:25500/sub"),
  );
});
