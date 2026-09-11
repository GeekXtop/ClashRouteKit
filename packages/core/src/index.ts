export {
  parseAuthorProjectConfig,
  parseRouteKitConfig,
  serializeRouteKitConfig,
} from "./configDocument.js";
export type { ParsedAuthorProjectConfig } from "./configDocument.js";
export {
  ConfigDiagnosticError,
  formatDiagnostic,
  hasDiagnosticErrors,
} from "./config/diagnostics.js";
export { parseAuthorProjectConfigV2 } from "./config/schemaV2/parser.js";
export { normalizeAuthorProjectConfig } from "./config/schemaV2/normalize.js";
export type {
  NormalizeResult,
  NormalizedMember,
  NormalizedPolicyTarget,
  NormalizedProject,
  NormalizedProxyGroup,
  NormalizedRoute,
} from "./config/schemaV2/normalize.js";
export {
  validateAuthorProjectConfigV2,
  validateNormalizedProject,
} from "./config/schemaV2/validate.js";
export { planLegacyMigration } from "./config/schemaV2/migrate.js";
export type {
  MigrationPlan,
  MigrationPlanSummary,
} from "./config/schemaV2/migrate.js";
export { toRouteKitConfig } from "./config/schemaV2/toRouteKitConfig.js";
export type { RenderRuntimeContext } from "./config/schemaV2/toRouteKitConfig.js";
export type {
  AuthorProjectConfigV2,
  BuiltinPolicy,
  ClashListSourceV2,
  ClashProviderSourceV2,
  DomainListCommunitySourceV2,
  MemberSet,
  NodeFilterV2,
  PolicyTarget,
  ProjectTemplateV2,
  ProjectV2,
  ProviderSourceV2,
  ProxyGroupTypeV2,
  ProxyGroupV2,
  RouteSourceV2,
  RouteV2,
  RuleProviderV2,
  SchemaVersionV2,
  TypedMember,
  VendorRepoV2,
} from "./config/schemaV2/types.js";
export type {
  Diagnostic,
  DiagnosticSeverity,
} from "./config/diagnostics.js";
export {
  createLegacyProxyGroupGraph,
  validateLegacyProjectConfig,
} from "./config/validateLegacy.js";
export { renderIni } from "./ini.js";
export { addVendorRepo, removeVendorRepo, updateVendorRepo } from "./configMutations.js";
export { parseIniToConfig } from "./import.js";
export { findDependencyCycles } from "./routing/dependencyGraph.js";
export type { DependencyGraph } from "./routing/dependencyGraph.js";
export {
  LEGACY_GEOIP_NO_RESOLVE,
  LEGACY_HEALTH_CHECK_INTERVAL,
  LEGACY_HEALTH_CHECK_URL,
  LEGACY_RULE_PROVIDER_INTERVAL,
  LEGACY_URL_TEST_TOLERANCE,
  resolveGeoipNoResolve,
  resolveProxyGroupHealthCheck,
  resolveRuleProviderInterval,
  validateDefaultAwareConfig,
} from "./defaults.js";
export type {
  ResolvedConfigValue,
  ResolvedConfigValueSource,
  ResolvedProxyGroupHealthCheck,
} from "./defaults.js";
export {
  collectClassicalProviderRules,
  collectDomainProviderRules,
  collectIpcidrProviderRules,
  collectRuleProviderRules,
  convertDomainListCommunity,
  generateClassicalProvider,
  generateDomainProvider,
  generateIpcidrProvider,
  generateRuleProvider,
  parseDomainListEntry,
  summarizeDomainProvider,
  summarizeRuleProvider,
} from "./rules.js";
export type {
  DomainListCommunityOptions,
  DomainProviderInput,
  DomainProviderRule,
  DomainProviderSummary,
  DomainListCommunitySource,
  DomainListEntryInfo,
  ImportedConfig,
  ClashListSource,
  ClashProviderSource,
  CustomProxyGroup,
  FinalRuleSetSource,
  GeositeRuleSetSource,
  GeoipRuleSetSource,
  ProviderBehavior,
  ProviderInput,
  ProviderRule,
  ProviderSummary,
  ProxyGroupDefaults,
  ProxyGroupHealthCheckDefaults,
  RenderIniOptions,
  RouteKitProjectConfig,
  RouteKitConfig,
  RouteKitDefaults,
  RuleSetDefaults,
  RuleProviderRuleSetSource,
  RuleSet,
  RuleSetSource,
  RuleProviderConfig,
  RuleProviderSource,
  SourceBase,
  VendorRepoConfig,
} from "./types.js";
