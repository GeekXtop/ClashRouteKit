export { writeFileAtomic } from "./config/atomic.js";
export {
  projectConfigPath,
  readAuthorProject,
  readConfig,
  readProjectConfigFile,
  writeProjectConfigFile,
  type ProjectConfigFileOptions,
  type ProjectConfigFileResult,
  type ProjectOptions,
  type ReadText,
  type WriteProjectConfigFileOptions,
  type WriteText,
} from "./config/configRepository.js";
export type { ParsedAuthorProjectConfig } from "@clash-route-kit/core";
export {
  analyzeMigration,
  applyMigration,
  type AnalyzeMigrationOptions,
  type ApplyMigrationOptions,
  type ApplyMigrationRejection,
  type ApplyMigrationResult,
  type ApplyMigrationSuccess,
  type MigrationAnalysis,
} from "./config/migration.js";
export {
  loadLocalSettings,
  resolveLocalSettingsPath,
  LOCAL_SETTINGS_RELATIVE_PATH,
  type LoadLocalSettingsOptions,
  type LocalSettings,
  type ResolvedLocalSettings,
} from "./config/localSettings.js";
export {
  catalogOriginsFromConfig,
  clearCatalogIndexCache,
  findCatalogPath,
  listCatalogEntries,
  listCatalogEntriesWithMeta,
  listCatalogSources,
  readCatalogEntry,
  readCatalogEntryDomains,
  readCatalogTemplate,
  searchCatalog,
  type CatalogEntriesOptions,
  type CatalogEntryMeta,
  type CatalogEntryOptions,
  type CatalogPathOptions,
  type CatalogSearchHit,
  type CatalogSearchOptions,
  type CatalogSourceInfo,
  type CatalogSourcesOptions,
} from "./catalog/catalog.js";
export {
  assertNoErrors,
  checkConfig,
  projectDiagnostics,
  validateLegacyWorkspace,
} from "./check/checkConfig.js";
export {
  createDefaultDependencies,
  DEFAULT_PROJECT_CONFIG_FILE,
  type DefaultDependencies,
} from "./dependencies.js";
export {
  generateOutputs,
  resolveInputPath,
  type DuplicateRuleSummary,
  type GenerateResult,
  type ProviderDuplicateSummary,
  type ProviderOutputSummary,
  type ProviderOverlapSummary,
  type SourceContributionSummary,
} from "./generate/generateOutputs.js";
export {
  defaultRunCommand,
  readGitRemote,
  runRouteKitAction,
  type CheckConfigFn,
  type GenerateOutputsFn,
  type GenerateOutputsResult,
  type GitRemoteOptions,
  type RouteKitAction,
  type RouteKitActionDependencies,
  type RouteKitActionOptions,
  type RouteKitActionResult,
  type RunCommand,
  type SyncVendorFn,
  type VendorSyncActionResult,
} from "./git/gitActions.js";
export {
  deleteProjectRuleFile,
  listProjectRuleFiles,
  readProjectRuleFile,
  writeProjectRuleFile,
  type DeleteProjectRuleFileOptions,
  type DeleteProjectRuleFileResult,
  type ProjectRuleFileOptions,
  type ProjectRuleFileResult,
  type ProjectRuleFilesOptions,
  type ReadDirectory,
  type RemovePath,
  type WriteProjectRuleFileOptions,
} from "./rules/ruleFiles.js";
export {
  addProjectVendorRepo,
  normalizeVendorRepoInput,
  removeProjectVendorRepo,
  updateProjectVendorRepo,
  type VendorRepoInput,
  type VendorRepoMutationOptions,
  type VendorRepoUpdateResult,
} from "./vendor/vendorSync.js";
export {
  syncVendor,
  type SyncVendorOptions,
  type VendorSyncResult,
} from "./vendor/syncVendor.js";
export {
  createRouteKitApiHandler,
  type ApiHandlerOptions,
} from "./http/apiHandler.js";
export {
  createHostingHandler,
  type HostingOptions,
} from "./http/hostingHandler.js";
export {
  createLocalServerContext,
  type LocalServerContext,
  type LocalServerContextOptions,
  type LocalServerMiddleware,
} from "./http/localServer.js";
