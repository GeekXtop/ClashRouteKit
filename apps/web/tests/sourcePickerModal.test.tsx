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
  fireEvent.click(screen.getByText("openai"));
  fireEvent.click(screen.getByText("添加"));
  await waitFor(() =>
    expect(onAdd).toHaveBeenCalledWith({ type: "geosite", value: "openai" }, "Proxy", expect.anything()),
  );
});
