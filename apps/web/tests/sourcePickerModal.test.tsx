// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { SourcePickerModal } from "../src/components/SourcePickerModal.js";

afterEach(cleanup);

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

function makeFetcher() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/catalog/sources"))
      return jsonResponse({
        sources: [
          {
            id: "domain-list-community",
            label: "dlc",
            kind: "upstream",
            originKind: "domain-list",
            count: 2,
            syncedAt: null,
            browsable: true,
          },
        ],
      });
    if (url.includes("/api/catalog/entries"))
      return jsonResponse({
        entries: [
          { name: "openai", hasChildren: false },
          { name: "category-acg", hasChildren: true },
        ],
      });
    if (url.includes("/api/catalog/domains")) return jsonResponse({ domains: ["DOMAIN-SUFFIX,openai.com"] });
    return jsonResponse({});
  });
}

it("adds a geosite source with prefilled policy", async () => {
  const onAdd = vi.fn();
  render(
    <AppProviders>
      <SourcePickerModal
        open
        policies={["Proxy", "Direct"]}
        defaultPolicy="Proxy"
        sections={["代理"]}
        onAdd={onAdd}
        onClose={() => {}}
        fetcher={makeFetcher()}
      />
    </AppProviders>,
  );
  await waitFor(() => expect(screen.getByText("openai")).toBeTruthy());
  expect(screen.queryByText("全部")).toBeNull();
  expect(screen.queryByText("GEOSITE")).toBeNull();
  expect(screen.queryByText("GEOIP")).toBeNull();
  expect(screen.queryByText("规则源")).toBeNull();
  fireEvent.click(screen.getByText("openai"));
  expect(screen.getByTestId("source-preview").className).toContain("rk-source-preview");
  expect(screen.getByTestId("source-preview").className).toContain("rk-fill-preview");
  fireEvent.click(screen.getByText("添加"));
  await waitFor(() =>
    expect(onAdd).toHaveBeenCalledWith({ type: "geosite", value: "openai" }, "Proxy", expect.anything()),
  );
});

it("searches across repositories and adds a rule-provider source", async () => {
  const onAdd = vi.fn();
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/catalog/sources")) {
      return jsonResponse({
        sources: [
          { id: "domain-list-community", label: "dlc", kind: "upstream", originKind: "domain-list", count: 1, syncedAt: null, browsable: true },
          { id: "ACL4SSR", label: "ACL4SSR", kind: "upstream", originKind: "list-dir", count: 1, syncedAt: null, browsable: true },
        ],
      });
    }
    if (url.includes("origin=domain-list-community")) return jsonResponse({ entries: [{ name: "openai", hasChildren: false }] });
    if (url.includes("origin=ACL4SSR")) return jsonResponse({ entries: [{ name: "Apple", hasChildren: false }] });
    if (url.includes("/api/catalog/domains")) return jsonResponse({ domains: ["DOMAIN-SUFFIX,apple.com"] });
    return jsonResponse({});
  });
  render(
    <AppProviders>
      <SourcePickerModal open policies={["Proxy"]} defaultPolicy="Proxy" sections={[]} onAdd={onAdd} onClose={() => {}} fetcher={fetcher} />
    </AppProviders>,
  );
  await waitFor(() => expect(screen.getByPlaceholderText("搜索来源…")).toBeTruthy());
  fireEvent.change(screen.getByPlaceholderText("搜索来源…"), { target: { value: "Apple" } });
  await waitFor(() => expect(screen.getByText("Apple")).toBeTruthy());
  fireEvent.click(screen.getByText("Apple"));
  fireEvent.click(screen.getByText("添加"));
  expect(onAdd).toHaveBeenCalledWith({ type: "rule-provider", behavior: "domain", file: "Apple" }, "Proxy", undefined);
});
