export type ProviderBehavior = "domain" | "classical" | "ipcidr";

export interface ProviderReference {
  behavior: ProviderBehavior;
  file: string;
  interval?: number;
}

export interface RouteModule {
  id: string;
  enabled?: boolean;
  policy: string;
  geosite?: string[];
  geoip?: string[];
  providers?: ProviderReference[];
}

export interface ProxyGroup {
  name: string;
  type: "select" | "url-test" | "fallback" | "load-balance";
  options: string[];
  nodeFilters?: string[];
  url?: string;
  interval?: number;
  tolerance?: number;
}

export interface RouteKitConfig {
  publishBaseUrl: string;
  proxyGroups: ProxyGroup[];
  modules: RouteModule[];
  final: {
    policy: string;
  };
}

export interface SourceBase {
  basePath?: string;
}

export interface ClashListSource extends SourceBase {
  name: string;
  type: "clash-list";
  path: string;
}

export interface ClashProviderSource extends SourceBase {
  name: string;
  type: "clash-provider";
  path: string;
}

export interface DomainListCommunitySource extends SourceBase {
  name: string;
  type: "domain-list-community";
  entry: string;
}

export type RuleProviderSource = ClashListSource | ClashProviderSource | DomainListCommunitySource;

export interface RuleProviderConfig {
  name: string;
  output: string;
  behavior: "domain";
  sources: RuleProviderSource[];
}

export interface RouteKitProjectConfig extends RouteKitConfig {
  template: {
    output: string;
  };
  ruleProviders?: RuleProviderConfig[];
}

export interface DomainListCommunityOptions {
  sourceUrl: string;
  fetchText: (url: string) => Promise<string>;
}

export interface DomainProviderInput {
  source: string;
  rules: string[];
}
