export interface ProviderSubscription {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

export interface SubconverterConvertOptions {
  emoji?: boolean;
  udp?: boolean;
  skipCertVerify?: boolean;
  sort?: boolean;
  appendType?: boolean;
  ruleProvider?: boolean;
  ua?: string;
  include?: string[];
  exclude?: string[];
  customParams?: string[];
  filename?: string;
}

export interface BuildSubconverterUrlInput {
  providers: ProviderSubscription[];
  publishBaseUrl: string;
  templateOutput: string;
  subconverterUrl?: string;
  endpoint?: string;
  target?: string;
  configVersion?: string | number;
  /** 直接指定模板 URL（如 GitHub 远程模板）；缺省由 publishBaseUrl + templateOutput 构造 */
  templateUrl?: string;
  convert?: SubconverterConvertOptions;
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

function templateUrl(publishBaseUrl: string, templateOutput: string, configVersion?: string | number): string {
  const base = `${publishBaseUrl.replace(/\/+$/, "")}/templates/${templateOutput}`;
  return configVersion === undefined || configVersion === "" ? base : `${base}?v=${configVersion}`;
}

/**
 * Turn user-facing node filter tags into a SubConverter `include`/`exclude` regex.
 * Each tag is one alternative (OR, joined by `|`); within a tag `&` means "name must
 * contain all parts" and is expanded to chained lookaheads, e.g. `台湾&bgp` →
 * `(?=.*台湾)(?=.*bgp)`. Tags without `&` pass through unchanged (still a valid regex).
 */
function nodeFilterRegex(tags: string[]): string {
  return tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => {
      if (!tag.includes("&")) return tag;
      const parts = tag.split("&").map((part) => part.trim()).filter(Boolean);
      return parts.map((part) => `(?=.*${part})`).join("");
    })
    .filter(Boolean)
    .join("|");
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
  const endpoint = normalizeEndpoint(input.subconverterUrl ?? input.endpoint);
  endpoint.searchParams.set("target", input.target ?? "clash");
  endpoint.searchParams.set("url", subscriptionUrl);
  endpoint.searchParams.set(
    "config",
    input.templateUrl?.trim() || templateUrl(input.publishBaseUrl, input.templateOutput, input.configVersion),
  );
  const convert = input.convert;
  if (convert) {
    if (convert.emoji !== undefined) endpoint.searchParams.set("emoji", String(convert.emoji));
    if (convert.sort !== undefined) endpoint.searchParams.set("sort", String(convert.sort));
    if (convert.udp) endpoint.searchParams.set("udp", "true");
    if (convert.skipCertVerify !== undefined) endpoint.searchParams.set("scv", String(convert.skipCertVerify));
    if (convert.appendType !== undefined) endpoint.searchParams.set("append_type", String(convert.appendType));
    if (convert.ruleProvider) {
      endpoint.searchParams.set("expand", "false");
      endpoint.searchParams.set("classic", "true");
    }
    if (convert.ua?.trim()) endpoint.searchParams.set("ua", convert.ua.trim());
    if (convert.include?.length) {
      const regex = nodeFilterRegex(convert.include);
      if (regex) endpoint.searchParams.set("include", `(?i)${regex}`);
    }
    if (convert.exclude?.length) {
      const regex = nodeFilterRegex(convert.exclude);
      if (regex) endpoint.searchParams.set("exclude", `(?i)${regex}`);
    }
    if (convert.filename?.trim()) endpoint.searchParams.set("filename", convert.filename.trim());
    for (const param of convert.customParams ?? []) {
      const eq = param.indexOf("=");
      if (eq > 0) endpoint.searchParams.set(param.slice(0, eq).trim(), param.slice(eq + 1));
    }
  }
  return endpoint.toString();
}
