import type { RouteKitProjectConfig } from "@clash-route-kit/core";

export interface LocalProjectConfigResponse {
  yaml: string;
  config: RouteKitProjectConfig;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isLocalProjectConfigResponse(value: unknown): value is LocalProjectConfigResponse {
  const candidate = value as LocalProjectConfigResponse;
  return (
    typeof candidate?.yaml === "string" &&
    typeof candidate.config === "object" &&
    candidate.config !== null
  );
}

async function readProjectResponse(response: Response): Promise<LocalProjectConfigResponse> {
  const payload = (await response.json()) as unknown;
  if (!response.ok || !isLocalProjectConfigResponse(payload)) {
    throw new Error("Invalid local project response");
  }
  return {
    yaml: payload.yaml,
    config: payload.config,
  };
}

export async function loadLocalProjectConfig(
  fetcher: Fetcher = globalThis.fetch,
): Promise<LocalProjectConfigResponse> {
  return readProjectResponse(await fetcher("/api/project/config"));
}

export async function saveLocalProjectConfig(
  config: RouteKitProjectConfig,
  fetcher: Fetcher = globalThis.fetch,
): Promise<LocalProjectConfigResponse> {
  return readProjectResponse(
    await fetcher("/api/project/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config }),
    }),
  );
}
