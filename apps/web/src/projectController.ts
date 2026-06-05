import {
  serializeRouteKitConfig,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";

export type ProjectView = "project" | "modules" | "policies" | "providers" | "preview" | "publish";
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
  selectedModuleId: string;
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

function firstModuleId(config: RouteKitProjectConfig): string {
  return config.modules[0]?.id ?? "";
}

function hasSelectedModule(config: RouteKitProjectConfig, moduleId: string): boolean {
  return config.modules.some((module) => module.id === moduleId);
}

export function createProjectController(snapshot: ProjectConfigSnapshot): ProjectControllerState {
  return {
    originalYaml: snapshot.yaml,
    originalConfig: snapshot.config,
    draftConfig: snapshot.config,
    draftYaml: serializeConfig(snapshot.config),
    dirty: false,
    status: "ready",
    message: "已读取本地 config/modules.yaml",
    validation: {
      status: "idle",
      output: "尚未运行检查",
    },
    selectedView: "modules",
    selectedModuleId: firstModuleId(snapshot.config),
  };
}

export function applyDraftConfig(
  state: ProjectControllerState,
  draftConfig: RouteKitProjectConfig,
): ProjectControllerState {
  const selectedModuleId = hasSelectedModule(draftConfig, state.selectedModuleId)
    ? state.selectedModuleId
    : firstModuleId(draftConfig);

  return {
    ...state,
    draftConfig,
    draftYaml: serializeConfig(draftConfig),
    dirty: computeDirty(state.originalConfig, draftConfig),
    status: state.status === "saving" ? "ready" : state.status,
    selectedModuleId,
  };
}

export function setProjectSelection(
  state: ProjectControllerState,
  selection: Partial<Pick<ProjectControllerState, "selectedView" | "selectedModuleId">>,
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
    message: "已保存 config/modules.yaml，可运行检查、生成和提交",
    selectedModuleId: hasSelectedModule(snapshot.config, state.selectedModuleId)
      ? state.selectedModuleId
      : firstModuleId(snapshot.config),
  };
}

export function canSaveProject(state: ProjectControllerState): SaveReadiness {
  if (!state.dirty) {
    return {
      ok: false,
      reason: "没有未保存的修改",
    };
  }

  for (const module of state.draftConfig.modules) {
    if (!module.id.trim()) {
      return {
        ok: false,
        reason: "模块 ID 不能为空",
      };
    }
    if (!module.policy.trim()) {
      return {
        ok: false,
        reason: `模块 ${module.id} 的策略不能为空`,
      };
    }
  }

  if (!state.draftConfig.final.policy.trim()) {
    return {
      ok: false,
      reason: "FINAL 策略不能为空",
    };
  }

  return { ok: true };
}
