import { describe, expect, it, vi } from "vitest";
import {
  fetchCatalogDomains,
  fetchCatalogEntries,
  fetchCatalogEntry,
  fetchCatalogSources,
  formatDomainRule,
  formatSyncedAt,
} from "../src/catalog.js";

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

  it("fetches the expanded domain list for an entry", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ domains: ["DOMAIN-SUFFIX,openai.com", "DOMAIN,chatgpt.com"] }), {
        status: 200,
      }),
    );
    await expect(fetchCatalogDomains("domain-list-community", "openai", fetcher)).resolves.toEqual([
      "DOMAIN-SUFFIX,openai.com",
      "DOMAIN,chatgpt.com",
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/catalog/domains?origin=domain-list-community&name=openai",
    );
  });

  it("formats domain rules for display", () => {
    expect(formatDomainRule("DOMAIN-SUFFIX,openai.com")).toBe("+.openai.com");
    expect(formatDomainRule("DOMAIN,chatgpt.com")).toBe("chatgpt.com");
    expect(formatDomainRule("DOMAIN-KEYWORD,openai")).toBe("*openai*");
  });

  it("fetches catalog sources", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          sources: [
            { id: "domain-list-community", label: "domain-list-community", kind: "upstream", count: 1479, syncedAt: 1, browsable: true },
            { id: "local", label: "本地 .list", kind: "local", count: 4, syncedAt: null, browsable: true },
          ],
        }),
        { status: 200 },
      ),
    );
    const sources = await fetchCatalogSources(fetcher);
    expect(sources.map((source) => source.id)).toEqual(["domain-list-community", "local"]);
    expect(fetcher).toHaveBeenCalledWith("/api/catalog/sources");
  });

  it("formats sync time relative to now", () => {
    const now = 10 * 86_400_000;
    expect(formatSyncedAt(now, now)).toBe("今天同步");
    expect(formatSyncedAt(7 * 86_400_000, now)).toBe("3天前同步");
    expect(formatSyncedAt(null, now)).toBe("");
  });
});
