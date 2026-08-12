import type { Diagnostic } from "@clash-route-kit/core";

export type LocalRouteKitAction = "check" | "generate" | "git-status" | "git-commit" | "git-push";

export interface LocalActionResponse {
  action: LocalRouteKitAction;
  ok: boolean;
  output: string;
  diagnostics?: Diagnostic[];
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isLocalActionResponse(value: unknown): value is LocalActionResponse {
  const candidate = value as LocalActionResponse;
  const actions: LocalRouteKitAction[] = ["check", "generate", "git-status", "git-commit", "git-push"];
  return (
    actions.includes(candidate?.action) &&
    typeof candidate.ok === "boolean" &&
    typeof candidate.output === "string" &&
    (candidate.diagnostics === undefined || Array.isArray(candidate.diagnostics))
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
