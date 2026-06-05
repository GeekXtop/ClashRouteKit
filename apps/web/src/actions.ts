export type LocalRouteKitAction = "check" | "generate";

export interface LocalActionResponse {
  action: LocalRouteKitAction;
  ok: boolean;
  output: string;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isLocalActionResponse(value: unknown): value is LocalActionResponse {
  const candidate = value as LocalActionResponse;
  return (
    (candidate?.action === "check" || candidate?.action === "generate") &&
    typeof candidate.ok === "boolean" &&
    typeof candidate.output === "string"
  );
}

export async function requestLocalAction(
  action: LocalRouteKitAction,
  fetcher: Fetcher = globalThis.fetch,
): Promise<LocalActionResponse> {
  const response = await fetcher(`/api/actions/${action}`, { method: "POST" });
  const payload = (await response.json()) as unknown;
  if (!isLocalActionResponse(payload)) {
    throw new Error("Invalid local action response");
  }
  return {
    ...payload,
    ok: response.ok && payload.ok,
  };
}
