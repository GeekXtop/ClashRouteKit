import { checkConfig, generateOutputs, syncVendor, type ProgramOptions } from "./program.js";
import {
  createRouteKitApiHandler as createRouteKitApiHandlerCore,
  runRouteKitAction as runRouteKitActionCore,
  type RouteKitAction,
  type RouteKitActionDependencies,
  type RouteKitActionResult,
} from "@clash-route-kit/local-server";

export { readProjectConfigFile, writeProjectConfigFile } from "@clash-route-kit/local-server";
export type {
  ProjectConfigFileOptions,
  ProjectConfigFileResult,
  WriteProjectConfigFileOptions,
} from "@clash-route-kit/local-server";

export type {
  CheckConfigFn,
  GenerateOutputsFn,
  GenerateOutputsResult,
  GitRemoteOptions,
  RouteKitActionDependencies,
  RouteKitActionOptions,
  SyncVendorFn,
  VendorSyncActionResult,
} from "@clash-route-kit/local-server";
export type { ReadDirectory, RemovePath } from "@clash-route-kit/local-server";
export { defaultRunCommand } from "@clash-route-kit/local-server";

export type {
  DeleteProjectRuleFileOptions,
  DeleteProjectRuleFileResult,
  ProjectRuleFileOptions,
  ProjectRuleFileResult,
  ProjectRuleFilesOptions,
  WriteProjectRuleFileOptions,
} from "@clash-route-kit/local-server";
export {
  deleteProjectRuleFile,
  listProjectRuleFiles,
  readProjectRuleFile,
  writeProjectRuleFile,
} from "@clash-route-kit/local-server";

export type {
  CatalogEntriesOptions,
  CatalogEntryMeta,
  CatalogEntryOptions,
  CatalogPathOptions,
  CatalogSearchHit,
  CatalogSearchOptions,
  CatalogSourceInfo,
  CatalogSourcesOptions,
} from "@clash-route-kit/local-server";
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
} from "@clash-route-kit/local-server";

export type {
  VendorRepoInput,
  VendorRepoMutationOptions,
  VendorRepoUpdateResult,
} from "@clash-route-kit/local-server";
export {
  addProjectVendorRepo,
  normalizeVendorRepoInput,
  removeProjectVendorRepo,
  updateProjectVendorRepo,
} from "@clash-route-kit/local-server";

export type { RouteKitAction, RouteKitActionResult };
export { readGitRemote } from "@clash-route-kit/local-server";

/**
 * CLI 组装层：把 program.ts 的默认实现注入 local-server 的 action 编排器，
 * 保持既有"可选注入 + CLI 默认"语义。
 */
export async function runRouteKitAction(
  action: RouteKitAction,
  options: ProgramOptions & RouteKitActionDependencies,
): Promise<RouteKitActionResult> {
  return runRouteKitActionCore(action, {
    ...options,
    checkConfig: options.checkConfig ?? checkConfig,
    generateOutputs: options.generateOutputs ?? generateOutputs,
    syncVendor: options.syncVendor ?? syncVendor,
  });
}

/**
 * HTTP 路由装配已迁至 @clash-route-kit/local-server（src/http/apiHandler.ts）。
 * CLI 这里保留组合语义：为 action 依赖补上 program.ts 的默认实现，
 * 路由、方法、响应形状与状态码由 local-server 统一保证。
 */
export function createRouteKitApiHandler(options: ProgramOptions & RouteKitActionDependencies) {
  return createRouteKitApiHandlerCore({
    ...options,
    checkConfig: options.checkConfig ?? checkConfig,
    generateOutputs: options.generateOutputs ?? generateOutputs,
    syncVendor: options.syncVendor ?? syncVendor,
  });
}
