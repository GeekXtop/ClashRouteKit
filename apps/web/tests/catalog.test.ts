import { describe, expect, it, vi } from "vitest";
import { fetchCatalogEntries, fetchCatalogEntry } from "../src/catalog.js";

describe("catalog client", () => {
  it("fetches catalog entries for an origin", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ entries: ["anthropic", "openai"] }), { status: 200 }),
    );

    await expect(fetchCatalogEntries("domain-list-community", fetcher)).resolves.toEqual([
      "anthropic",
      "openai",
    ]);
    expect(fetcher).toHaveBeenCalledWith("/api/catalog/entries?origin=domain-list-community");
  });

  it("throws when the entries payload is malformed", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ entries: "nope" }), { status: 200 }));
    await expect(fetchCatalogEntries("x", fetcher)).rejects.toThrow("Invalid catalog entries response");
  });

  it("fetches a single catalog entry detail", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({ name: "category-ai-!cn", includes: ["anthropic", "openai"], ruleCount: 2 }),
        { status: 200 },
      ),
    );

    await expect(
      fetchCatalogEntry("domain-list-community", "category-ai-!cn", fetcher),
    ).resolves.toEqual({
      name: "category-ai-!cn",
      includes: ["anthropic", "openai"],
      ruleCount: 2,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/catalog/entry?origin=domain-list-community&name=category-ai-!cn",
    );
  });

  it("throws when the entry payload is malformed", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ name: "y" }), { status: 200 }));
    await expect(fetchCatalogEntry("x", "y", fetcher)).rejects.toThrow("Invalid catalog entry response");
  });
});
