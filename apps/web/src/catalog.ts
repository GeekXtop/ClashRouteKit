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
