// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { CatalogBrowser } from "../src/components/CatalogBrowser.js";

afterEach(cleanup);

function makeFetcher() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/catalog/entries"))
      return { ok: true, json: async () => ({ entries: [{ name: "BanAD", hasChildren: false }] }) } as unknown as Response;
    if (url.includes("/api/catalog/domains"))
      return { ok: true, json: async () => ({ domains: ["DOMAIN,ad.example"] }) } as unknown as Response;
    return { ok: true, json: async () => ({}) } as unknown as Response;
  });
}

it("lists repo entries and previews domains on select", async () => {
  render(
    <AppProviders>
      <CatalogBrowser origin="ACL4SSR" originKind="list-dir" fetcher={makeFetcher()} />
    </AppProviders>,
  );
  await waitFor(() => expect(screen.getByText("BanAD")).toBeTruthy());
  fireEvent.click(screen.getByText("BanAD"));
  await waitFor(() => expect(screen.getByText(/ad\.example/)).toBeTruthy());
});
