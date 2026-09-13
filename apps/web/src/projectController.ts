import {
  serializeRouteKitConfig,
  validateLegacyProjectConfig,
  type Diagnostic,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";
import { detectSchemaVersion, type ProjectSchemaVersion } from "./features/project/projectMeta.js";

export type ProjectView = "project" | "library" | "routing" | "output";
export type ProjectStatus = "loading" | "ready" | "saving" | "error";
export type ProjectValidationStatus = "idle" | "running" | "success" | "error";

export interface ProjectValidationState {
  status: ProjectValidationStatus;
  output: string;
}

export interface ProjectControllerState {
  originalYaml: string;
  originalConfig: RouteKitProjectConfig;
  draftConfig: RouteKitProjectConfig;
  draftYaml: string;
  dirty: boolean;
  status: ProjectStatus;
  message: string;
  /** 项目作者配置的 schema 版本（1 = 无 schemaVersion 的 v1 文档）。 */
  schemaVersion: ProjectSchemaVersion;
  validation: ProjectValidationState;
  selectedView: ProjectView;
  selectedRuleSetId: string;
  selectedCustomProxyGroupName: string;
  selectedProviderName: string;
  selectedRuleFile: string;
}

export type SaveReadiness =
  | { ok: true; warnings: Diagnostic[] }
  | {
      ok: false;
      reason: string;
      diagnostics: Diagnostic[];
      warnings: Diagnostic[];
    };

export interface ProjectConfigSnapshot {
  yaml: string;
  config: RouteKitProjectConfig;
}

function serializeConfig(config: RouteKitProjectConfig): string {
  return serializeRouteKitConfig(config);
}

function projectDiagnostics(config: RouteKitProjectConfig): Diagnostic[] {
  return validateLegacyProjectConfig(config);
}

function computeDirty(originalConfig: RouteKitProjectConfig, draftConfig: RouteKitProjectConfig): boolean {
  return serializeConfig(originalConfig) !== serializeConfig(draftConfig);
}

function firstRuleSetId(config: RouteKitProjectConfig): string {
  return config.ruleSets[0]?.id ?? "";
}

function firstCustomProxyGroupName(config: RouteKitProjectConfig): string {
  return config.customProxyGroups[0]?.name ?? "";
}

function firstProviderName(config: RouteKitProjectConfig): string {
  return config.ruleProviders?.[0]?.name ?? "";
}

function hasSelectedRuleSet(config: RouteKitProjectConfig, ruleSetId: string): boolean {
  return config.ruleSets.some((ruleSet) => ruleSet.id === ruleSetId);
}

function hasSelectedCustomProxyGroup(config: RouteKitProjectConfig, groupName: string): boolean {
  return config.customProxyGroups.some((group) => group.name === groupName);
}

function hasSelectedProvider(config: RouteKitProjectConfig, providerName: string): boolean {
  return (config.ruleProviders ?? []).some((provider) => provider.name === providerName);
}

export function createProjectController(snapshot: ProjectConfigSnapshot): ProjectControllerState {
  return {
    originalYaml: snapshot.yaml,
    originalConfig: snapshot.config,
    draftConfig: snapshot.config,
    draftYaml: serializeConfig(snapshot.config),
    dirty: false,
    status: "ready",
    message: "已读取本地 config/routes.yaml",
    schemaVersion: detectSchemaVersion(snapshot.yaml),
    validation: {
      status: "idle",
      output: "尚未运行检查",
    },
    selectedView: "project",
    selectedRuleSetId: firstRuleSetId(snapshot.config),
    selectedCustomProxyGroupName: firstCustomProxyGroupName(snapshot.config),
    selectedProviderName: firstProviderName(snapshot.config),
    selectedRuleFile: "",
  };
}

export function applyDraftConfig(
  state: ProjectControllerState,
  draftConfig: RouteKitProjectConfig,
): ProjectControllerState {
  const selectedRuleSetId = hasSelectedRuleSet(draftConfig, state.selectedRuleSetId)
    ? state.selectedRuleSetId
    : firstRuleSetId(draftConfig);

  return {
    ...state,
    draftConfig,
    draftYaml: serializeConfig(draftConfig),
    dirty: computeDirty(state.originalConfig, draftConfig),
    status: state.status === "saving" ? "ready" : state.status,
    schemaVersion: state.schemaVersion,
    selectedRuleSetId,
    selectedCustomProxyGroupName: hasSelectedCustomProxyGroup(draftConfig, state.selectedCustomProxyGroupName)
      ? state.selectedCustomProxyGroupName
      : firstCustomProxyGroupName(draftConfig),
    selectedProviderName: hasSelectedProvider(draftConfig, state.selectedProviderName)
      ? state.selectedProviderName
      : firstProviderName(draftConfig),
    selectedRuleFile: state.selectedRuleFile,
  };
}

export function setProjectSelection(
  state: ProjectControllerState,
  selection: Partial<
    Pick<
      ProjectControllerState,
      | "selectedView"
      | "selectedRuleSetId"
      | "selectedCustomProxyGroupName"
      | "selectedProviderName"
      | "selectedRuleFile"
    >
  >,
): ProjectControllerState {
  return {
    ...state,
    ...selection,
  };
}

export function updateProjectValidation(
  state: ProjectControllerState,
  validation: ProjectValidationState,
): ProjectControllerState {
  return {
    ...state,
    validation,
  };
}

export function setProjectStatus(
  state: ProjectControllerState,
  status: ProjectStatus,
  message: string,
): ProjectControllerState {
  return {
    ...state,
    status,
    message,
  };
}

export function markProjectSaved(
  state: ProjectControllerState,
  snapshot: ProjectConfigSnapshot,
): ProjectControllerState {
  const warnings = projectDiagnostics(snapshot.config).filter(
    (diagnostic) => diagnostic.severity === "warning",
  );
  return {
    ...state,
    originalYaml: snapshot.yaml,
    originalConfig: snapshot.config,
    draftConfig: snapshot.config,
    draftYaml: serializeConfig(snapshot.config),
    dirty: false,
    status: "ready",
    message:
      warnings.length > 0
        ? `已保存，${warnings.length} 条配置警告待处理`
        : "已保存 config/routes.yaml，可运行检查、生成和提交",
    schemaVersion: detectSchemaVersion(snapshot.yaml),
    selectedRuleSetId: hasSelectedRuleSet(snapshot.config, state.selectedRuleSetId)
      ? state.selectedRuleSetId
      : firstRuleSetId(snapshot.config),
    selectedCustomProxyGroupName: hasSelectedCustomProxyGroup(snapshot.config, state.selectedCustomProxyGroupName)
      ? state.selectedCustomProxyGroupName
      : firstCustomProxyGroupName(snapshot.config),
    selectedProviderName: hasSelectedProvider(snapshot.config, state.selectedProviderName)
      ? state.selectedProviderName
      : firstProviderName(snapshot.config),
    selectedRuleFile: state.selectedRuleFile,
  };
}

export function canSaveProject(state: ProjectControllerState): SaveReadiness {
  const diagnostics = projectDiagnostics(state.draftConfig);
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning");
  if (state.schemaVersion === 2) {
    // v2 项目文件不能被 v1 序列化覆盖写回；v2 实体编辑由后续任务提供。
    return {
      ok: false,
      reason: "Schema v2 项目暂不支持 v1 编辑保存",
      diagnostics,
      warnings,
    };
  }
  if (!state.dirty) {
    return {
      ok: false,
      reason: "没有未保存的修改",
      diagnostics,
      warnings,
    };
  }

  const error = diagnostics.find((diagnostic) => diagnostic.severity === "error");
  if (error) {
    return {
      ok: false,
      reason: error.message,
      diagnostics,
      warnings,
    };
  }

  return { ok: true, warnings };
}

/**
 * 迁移复核应用成功后的本地标记：把快照切到 Schema v2 并清空脏状态，
 * 阻断后续 v1 自动保存。配置重载由 App 层 refresh 链路负责。
 */
export function markProjectMigrated(state: ProjectControllerState): ProjectControllerState {
  return {
    ...state,
    schemaVersion: 2,
    dirty: false,
    status: "ready",
    message: "已迁移到 Schema v2（v2 实体编辑即将支持）",
  };
}
