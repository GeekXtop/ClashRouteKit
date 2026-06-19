import {
  serializeRouteKitConfig,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";
import { validateDraftConfig } from "./draftValidation.js";

export type ProjectView = "routing" | "library" | "publish";
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
  validation: ProjectValidationState;
  selectedView: ProjectView;
  selectedRuleSetId: string;
  selectedCustomProxyGroupName: string;
  selectedProviderName: string;
  selectedRuleFile: string;
}

export type SaveReadiness =
  | { ok: true }
  | {
      ok: false;
      reason: string;
    };

export interface ProjectConfigSnapshot {
  yaml: string;
  config: RouteKitProjectConfig;
}

function serializeConfig(config: RouteKitProjectConfig): string {
  return serializeRouteKitConfig(config);
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
    validation: {
      status: "idle",
      output: "尚未运行检查",
    },
    selectedView: "library",
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
  return {
    ...state,
    originalYaml: snapshot.yaml,
    originalConfig: snapshot.config,
    draftConfig: snapshot.config,
    draftYaml: serializeConfig(snapshot.config),
    dirty: false,
    status: "ready",
    message: "已保存 config/routes.yaml，可运行检查、生成和提交",
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
  if (!state.dirty) {
    return {
      ok: false,
      reason: "没有未保存的修改",
    };
  }

  const diagnostics = validateDraftConfig(state.draftConfig);
  if (diagnostics.length > 0) {
    return {
      ok: false,
      reason: diagnostics[0]!,
    };
  }

  return { ok: true };
}
