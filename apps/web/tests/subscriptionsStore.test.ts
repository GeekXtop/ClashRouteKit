import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSubscriptions, saveSubscriptions } from "../src/subscriptionsStore.js";

afterEach(() => vi.restoreAllMocks());

it("fetches subscriptions", async () => {
  const fetcher = vi.fn(async () =>
    ({ ok: true, json: async () => ({ subscriptions: [{ id: "a", name: "A", url: "u", enabled: true }] }) }) as unknown as Response,
  );
  expect(await fetchSubscriptions(fetcher)).toEqual([{ id: "a", name: "A", url: "u", enabled: true }]);
});

it("saves subscriptions via PUT", async () => {
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    ({ ok: true, json: async () => ({ subscriptions: [] }) }) as unknown as Response,
  );
  await saveSubscriptions([], fetcher);
  expect((fetcher.mock.calls[0]![1] as RequestInit).method).toBe("PUT");
});
