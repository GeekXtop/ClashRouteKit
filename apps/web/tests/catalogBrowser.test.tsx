// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { CatalogBrowser, sortCatalogNodes } from "../src/components/CatalogBrowser.js";

afterEach(cleanup);

it("orders branches (with children) before leaves, alphabetical within each group", () => {
  const ordered = sortCatalogNodes([
    { key: "zebra", title: "zebra", isLeaf: true },
    { key: "category-b", title: "category-b", isLeaf: false },
    { key: "adblock", title: "adblock", isLeaf: true },
    { key: "category-a", title: "category-a", isLeaf: false },
  ]);
  expect(ordered.map((node) => node.title)).toEqual(["category-a", "category-b", "adblock", "zebra"]);
});

function makeFetcher() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/catalog/entries"))
      return { ok: true, json: async () => ({ entries: [{ name: "BanAD", hasChildren: false }] }) } as unknown as Response;
    if (url.includes("/api/catalog/domains"))
      return { ok: true, json: async () => ({ domains: ["DOMAIN,ad.example", "DOMAIN-SUFFIX,ads.example"] }) } as unknown as Response;
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

it("shows the selected entry rule count for list repositories", async () => {
  const { container } = render(
    <AppProviders>
      <CatalogBrowser origin="ACL4SSR" originKind="list-dir" fetcher={makeFetcher()} />
    </AppProviders>,
  );
  await waitFor(() => expect(screen.getByText("BanAD")).toBeTruthy());
  expect(container.querySelector(".rk-cat-count")).toBeNull();
  fireEvent.click(screen.getByText("BanAD"));
  await waitFor(() => expect(container.querySelector(".rk-cat-count")?.textContent).toBe("2"));
});

it("searches by domain via the backend and previews matched domains", async () => {
  const ok = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/catalog/search"))
      return ok({ hits: [{ name: "openai", matchedDomains: ["openai.com"] }] });
    if (url.includes("/api/catalog/entries")) return ok({ entries: [{ name: "category-ai-!cn", hasChildren: true }] });
    if (url.includes("/api/catalog/domains")) return ok({ domains: ["DOMAIN-SUFFIX,openai.com"] });
    return ok({});
  });
  render(
    <AppProviders>
      <CatalogBrowser origin="domain-list-community" originKind="domain-list" fetcher={fetcher} />
    </AppProviders>,
  );
  fireEvent.change(screen.getByPlaceholderText(/搜索条目名或域名/), { target: { value: "openai.com" } });
  await waitFor(() => expect(screen.getByText("openai")).toBeTruthy());
  // matched-domain preview shown under the hit
  expect(screen.getByText("openai.com")).toBeTruthy();
});

it("locates a hit and highlights only the matched domain line on the right", async () => {
  const ok = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/catalog/search")) return ok({ hits: [{ name: "openai", matchedDomains: ["openai.com"] }] });
    if (url.includes("/api/catalog/path")) return ok({ path: [] }); // fallback: select + highlight, no tree walk
    if (url.includes("/api/catalog/entries")) return ok({ entries: [{ name: "category-ai", hasChildren: true, root: true }] });
    if (url.includes("/api/catalog/domains"))
      return ok({ domains: ["DOMAIN-SUFFIX,openai.com", "DOMAIN,example.org"] });
    return ok({});
  });
  render(
    <AppProviders>
      <CatalogBrowser origin="domain-list-community" originKind="domain-list" fetcher={fetcher} />
    </AppProviders>,
  );
  fireEvent.change(screen.getByPlaceholderText(/搜索条目名或域名/), { target: { value: "openai.com" } });
  await waitFor(() => expect(screen.getByText("openai")).toBeTruthy());
  fireEvent.click(screen.getByText("openai"));
  await waitFor(() => expect(screen.getByText("+.openai.com").className).toContain("rk-ini-hit"));
  expect(screen.getByText("example.org").className).not.toContain("rk-ini-hit");
});
