// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { PublishTemplateSection } from "../src/components/PublishTemplateSection.js";

afterEach(cleanup);

it("shows local and raw template urls", async () => {
  const fetcher = vi.fn(async () =>
    ({ ok: true, json: async () => ({ url: "https://github.com/GeekXtop/ClashRouteKit.git" }) }) as unknown as Response,
  );
  render(
    <AppProviders>
      <PublishTemplateSection
        templateOutput="Custom_Clash.ini"
        publishBaseUrl="http://192.168.1.9:8787"
        validation={{ status: "success", output: "[check] ok" }}
        onRunCheck={() => {}}
        fetcher={fetcher}
      />
    </AppProviders>,
  );
  expect(screen.getByText(/192\.168\.1\.9:8787\/templates\/Custom_Clash\.ini/)).toBeTruthy();
  await waitFor(() =>
    expect(
      screen.getByText(/raw\.githubusercontent\.com\/GeekXtop\/ClashRouteKit\/publish\/templates\/Custom_Clash\.ini/),
    ).toBeTruthy(),
  );
});
