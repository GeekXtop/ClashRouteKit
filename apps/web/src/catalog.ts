type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface CatalogEntryDetail {
  name: string;
  includes: string[];
  ruleCount: number;
}

export async function fetchCatalogEntries(
  origin: string,
  fetcher: Fetcher = globalThis.fetch,
): Promise<string[]> {
  const response = await fetcher(`/api/catalog/entries?origin=${encodeURIComponent(origin)}`);
  const payload = (await response.json()) as { entries?: unknown };
  if (
    !response.ok ||
    !Array.isArray(payload.entries) ||
    !payload.entries.every((entry) => typeof entry === "string")
  ) {
    throw new Error("Invalid catalog entries response");
  }
  return payload.entries;
}

export async function fetchCatalogEntry(
  origin: string,
  name: string,
  fetcher: Fetcher = globalThis.fetch,
): Promise<CatalogEntryDetail> {
  const response = await fetcher(
    `/api/catalog/entry?origin=${encodeURIComponent(origin)}&name=${encodeURIComponent(name)}`,
  );
  const payload = (await response.json()) as Partial<CatalogEntryDetail>;
  if (
    !response.ok ||
    typeof payload.name !== "string" ||
    !Array.isArray(payload.includes) ||
    !payload.includes.every((include) => typeof include === "string") ||
    typeof payload.ruleCount !== "number"
  ) {
    throw new Error("Invalid catalog entry response");
  }
  return { name: payload.name, includes: payload.includes, ruleCount: payload.ruleCount };
}

export async function fetchCatalogDomains(
  origin: string,
  name: string,
  fetcher: Fetcher = globalThis.fetch,
): Promise<string[]> {
  const response = await fetcher(
    `/api/catalog/domains?origin=${encodeURIComponent(origin)}&name=${encodeURIComponent(name)}`,
  );
  const payload = (await response.json()) as { domains?: unknown };
  if (
    !response.ok ||
    !Array.isArray(payload.domains) ||
    !payload.domains.every((domain) => typeof domain === "string")
  ) {
    throw new Error("Invalid catalog domains response");
  }
  return payload.domains;
}

export function formatDomainRule(rule: string): string {
  if (rule.startsWith("DOMAIN-SUFFIX,")) return `+.${rule.slice("DOMAIN-SUFFIX,".length)}`;
  if (rule.startsWith("DOMAIN,")) return rule.slice("DOMAIN,".length);
  if (rule.startsWith("DOMAIN-KEYWORD,")) return `*${rule.slice("DOMAIN-KEYWORD,".length)}*`;
  return rule;
}

export interface CatalogSourceInfo {
  id: string;
  label: string;
  kind: "upstream" | "local";
  originKind?: string;
  count: number;
  syncedAt: number | null;
  browsable: boolean;
}

export async function fetchCatalogSources(fetcher: Fetcher = globalThis.fetch): Promise<CatalogSourceInfo[]> {
  const response = await fetcher("/api/catalog/sources");
  const payload = (await response.json()) as { sources?: unknown };
  if (!response.ok || !Array.isArray(payload.sources)) {
    throw new Error("Invalid catalog sources response");
  }
  return payload.sources as CatalogSourceInfo[];
}

export function formatSyncedAt(ms: number | null, nowMs: number): string {
  if (ms === null) return "";
  const days = Math.floor((nowMs - ms) / 86_400_000);
  if (days <= 0) return "今天同步";
  return `${days}天前同步`;
}

export async function syncCatalogVendor(fetcher: Fetcher = globalThis.fetch): Promise<string> {
  const response = await fetcher("/api/actions/sync-vendor", { method: "POST" });
  const payload = (await response.json()) as { ok?: boolean; output?: string };
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.output ?? "同步失败");
  }
  return payload.output ?? "";
}
