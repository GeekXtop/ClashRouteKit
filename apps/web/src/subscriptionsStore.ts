import type { LocalSubscription } from "@clash-route-kit/core";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function fetchSubscriptions(fetcher: Fetcher = globalThis.fetch): Promise<LocalSubscription[]> {
  const response = await fetcher("/api/subscriptions");
  const payload = (await response.json()) as { subscriptions?: unknown };
  if (!response.ok || !Array.isArray(payload.subscriptions)) {
    throw new Error("Invalid subscriptions response");
  }
  return payload.subscriptions as LocalSubscription[];
}

export async function saveSubscriptions(
  subscriptions: LocalSubscription[],
  fetcher: Fetcher = globalThis.fetch,
): Promise<LocalSubscription[]> {
  const response = await fetcher("/api/subscriptions", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscriptions }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { output?: string };
    throw new Error(payload.output ?? "保存订阅失败");
  }
  return subscriptions;
}
