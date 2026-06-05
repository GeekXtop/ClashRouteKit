export interface ProviderSubscription {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

export interface BuildSubconverterUrlInput {
  providers: ProviderSubscription[];
  publishBaseUrl: string;
  templateOutput: string;
  endpoint?: string;
  target?: string;
}

function stableProviderId(name: string, index: number): string {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  return normalized || `provider-${index + 1}`;
}

function normalizeEndpoint(endpoint?: string): URL {
  const raw = endpoint?.trim() || "http://10.0.0.3:25500/sub";
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  const url = new URL(withProtocol);
  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = "/sub";
  }
  return url;
}

function templateUrl(publishBaseUrl: string, templateOutput: string): string {
  return `${publishBaseUrl.replace(/\/+$/, "")}/templates/${templateOutput}`;
}

export function parseProviderLines(input: string): ProviderSubscription[] {
  return input
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line, index) => {
      const match = /^provider:([^,]+),(.+)$/i.exec(line);
      if (!match) return [];
      const name = match[1].trim();
      const url = match[2].trim();
      if (!name || !url) return [];
      return [{ id: stableProviderId(name, index), name, url, enabled: true }];
    });
}

export function serializeProviderSubscriptions(providers: ProviderSubscription[]): string {
  return providers
    .filter((provider) => provider.enabled && provider.name.trim() && provider.url.trim())
    .map((provider) => `provider:${provider.name.trim()},${provider.url.trim()}`)
    .join("|");
}

export function buildSubconverterUrl(input: BuildSubconverterUrlInput): string {
  const subscriptionUrl = serializeProviderSubscriptions(input.providers);
  const endpoint = normalizeEndpoint(input.endpoint);
  endpoint.searchParams.set("target", input.target ?? "clash");
  endpoint.searchParams.set("url", subscriptionUrl);
  endpoint.searchParams.set("config", templateUrl(input.publishBaseUrl, input.templateOutput));
  return endpoint.toString();
}
