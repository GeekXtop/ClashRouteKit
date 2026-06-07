export interface RuleFileResponse {
  file: string;
  text: string;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isRuleFileResponse(value: unknown): value is RuleFileResponse {
  const candidate = value as RuleFileResponse;
  return typeof candidate?.file === "string" && typeof candidate.text === "string";
}

async function readJson(response: Response): Promise<unknown> {
  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error("Invalid rule file response");
  }
  return payload;
}

export async function listRuleFiles(fetcher: Fetcher = globalThis.fetch): Promise<string[]> {
  const payload = (await readJson(await fetcher("/api/project/rules"))) as { files?: unknown };
  if (!Array.isArray(payload.files) || !payload.files.every((file) => typeof file === "string")) {
    throw new Error("Invalid rule file response");
  }
  return payload.files;
}

export async function loadRuleFile(
  file: string,
  fetcher: Fetcher = globalThis.fetch,
): Promise<RuleFileResponse> {
  const payload = await readJson(await fetcher(`/api/project/rules/${encodeURIComponent(file)}`));
  if (!isRuleFileResponse(payload)) {
    throw new Error("Invalid rule file response");
  }
  return payload;
}

export async function saveRuleFile(
  file: string,
  text: string,
  fetcher: Fetcher = globalThis.fetch,
): Promise<RuleFileResponse> {
  const payload = await readJson(
    await fetcher(`/api/project/rules/${encodeURIComponent(file)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    }),
  );
  if (!isRuleFileResponse(payload)) {
    throw new Error("Invalid rule file response");
  }
  return payload;
}
