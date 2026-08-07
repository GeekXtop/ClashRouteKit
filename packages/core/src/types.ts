export type ProviderBehavior = "domain" | "classical" | "ipcidr";

export interface RuleProviderRuleSetSource {
  type: "rule-provider";
  behavior: ProviderBehavior;
  file: string;
  interval?: number;
}

export interface GeositeRuleSetSource {
  type: "geosite";
  value: string;
}

export interface GeoipRuleSetSource {
  type: "geoip";
  value: string;
  noResolve?: boolean;
}

export interface FinalRuleSetSource {
  type: "final";
}

export type RuleSetSource =
  | RuleProviderRuleSetSource
  | GeositeRuleSetSource
  | GeoipRuleSetSource
  | FinalRuleSetSource;

export interface ProxyGroupHealthCheckDefaults {
  url?: string;
  interval?: number;
  timeout?: number;
}

export interface ProxyGroupDefaults {
  healthCheck?: ProxyGroupHealthCheckDefaults;
  urlTest?: {
    tolerance?: number;
  };
}

export interface RuleSetDefaults {
  ruleProviderInterval?: number;
  geoipNoResolve?: boolean;
}

export interface RouteKitDefaults {
  proxyGroups?: ProxyGroupDefaults;
  ruleSets?: RuleSetDefaults;
}

export interface RuleSet {
  id: string;
  enabled?: boolean;
  section?: string;
  policy: string;
  source: RuleSetSource;
}

export interface CustomProxyGroup {
  name: string;
  type: "select" | "url-test" | "fallback" | "load-balance";
  options: string[];
  nodeFilters?: string[];
  url?: string;
  interval?: number;
  timeout?: number | null;
  tolerance?: number | null;
}

export interface RouteKitConfig {
  publishBaseUrl: string;
  subconverterUrl?: string;
  defaults?: RouteKitDefaults;
  customProxyGroups: CustomProxyGroup[];
  ruleSets: RuleSet[];
}

export interface VendorRepoConfig {
  name: string;
  url: string;
  path: string;
  branch?: string;
  catalog?: {
    dir: string;
    kind: "domain-list" | "list-dir" | "provider-yaml" | "ini-template";
  };
  /** Optional directory of SubConverter `.ini` templates exposed as an import source. */
  templateDir?: string;
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
  behavior: ProviderBehavior;
  exclude?: string[];
  remove?: string[];
  sources: RuleProviderSource[];
}

export interface RouteKitProjectConfig extends RouteKitConfig {
  template: {
    output: string;
    enableRuleGenerator?: boolean;
    overwriteOriginalRules?: boolean;
    clashRuleBase?: string;
  };
  vendorRepos: VendorRepoConfig[];
  globalRemove?: string[];
  ruleProviders?: RuleProviderConfig[];
}

export interface DomainListCommunityOptions {
  sourceUrl: string;
  fetchText: (url: string) => Promise<string>;
}

export interface ProviderInput {
  source: string;
  rules: string[];
  exclude?: string[];
}

export interface ProviderSummary {
  inputRules: number;
  outputRules: number;
  excludedRules: number;
}

export interface DomainProviderSummary extends ProviderSummary {
  domainRules: number;
}

export interface ProviderRule {
  key: string;
  rule: string;
  payload: string;
}

export type DomainProviderInput = ProviderInput;
export type DomainProviderRule = ProviderRule;

export interface RenderIniOptions {
  enableRuleGenerator?: boolean;
  overwriteOriginalRules?: boolean;
  clashRuleBase?: string;
}

export interface DomainListEntryInfo {
  includes: string[];
  ruleCount: number;
}

export interface ImportedConfig {
  customProxyGroups: CustomProxyGroup[];
  ruleSets: RuleSet[];
  warnings: string[];
}
