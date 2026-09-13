import {
  serializeRouteKitConfig,
  validateLegacyProjectConfig,
  type AuthorProjectConfigV2,
  type Diagnostic,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";
import { detectSchemaVersion, type ProjectSchemaVersion } from "./features/project/projectMeta.js";
import {
  analyzeV2Config,
  loadV2Project,
  serializeV2Project,
  type ProjectDocument,
  type V2ProjectState,
} from "./v2/v2Project.js";

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
  /**
   * Schema v2 项目状态：v2 文档成功装载时存在（config + 诊断 + 摘要）。
   * v1 项目恒为 undefined；装载失败（结构错误）时也为 undefined，
   * 此时 canSaveProject 拒绝保存并提示。
   */
  v2?: V2ProjectState;
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

/**
 * Schema v2 项目控制器：装载失败（YAML / 结构错误）时不抛出，
 * v2 状态留空并置 error 状态提示；canSaveProject 会拒绝保存。
 * draftConfig 是 v1 只读投影（渲染各页面的兜底输入），编辑 mutation
 * 均经 useV2DraftActions 走 v2.config + applyV2Config，永不写投影。
 */
function v2ReadOnlyProjection(templateOutput: string): RouteKitProjectConfig {
  return {
    publishBaseUrl: "",
    template: { output: templateOutput },
    vendorRepos: [],
    customProxyGroups: [],
    ruleSets: [],
    ruleProviders: [],
  };
}

/**
 * Schema v2 项目控制器：装载失败（YAML / 结构错误）时不抛出，
 * v2 状态留空并置 error 状态提示；canSaveProject 会拒绝保存。
 */
export function createV2ProjectController(yaml: string): ProjectControllerState {
  let v2: V2ProjectState | undefined;
  let status: ProjectStatus = "ready";
  let message = "已读取本地 config/routes.yaml（Schema v2）";
  try {
    v2 = loadV2Project(yaml);
  } catch (error) {
    status = "error";
    message = error instanceof Error ? error.message : String(error);
  }
  const projection = v2ReadOnlyProjection(
    v2?.config.project?.template?.output ?? "Custom_Clash.ini",
  );
  return {
    originalYaml: yaml,
    originalConfig: projection,
    draftConfig: projection,
    draftYaml: yaml,
    dirty: false,
    status,
    message,
    schemaVersion: 2,
    v2,
    validation: {
      status: "idle",
      output: "尚未运行检查",
    },
    selectedView: "project",
    selectedRuleSetId: v2?.config.routes[0]?.id ?? "",
    selectedCustomProxyGroupName: "",
    selectedProviderName: "",
    selectedRuleFile: "",
  };
}

/** 按 GET /api/project/config 的分发结果创建对应版本的控制器。 */
export function createProjectControllerFromDocument(
  document: ProjectDocument,
): ProjectControllerState {
  return document.schemaVersion === 2
    ? createV2ProjectController(document.yaml)
    : createProjectController(document);
}

/**
 * 应用一次 v2 mutation 结果：重算诊断与摘要、重新序列化草稿 yaml，
 * 并以序列化结果对比装载基线计算脏状态。
 */
export function applyV2Config(
  state: ProjectControllerState,
  config: AuthorProjectConfigV2,
): ProjectControllerState {
  if (state.schemaVersion !== 2 || !state.v2) return state;
  const { diagnostics, normalizedSummary } = analyzeV2Config(config);
  const yaml = serializeV2Project(config);
  return {
    ...state,
    v2: { config, diagnostics, normalizedSummary },
    draftYaml: yaml,
    dirty: yaml !== state.originalYaml,
    status: state.status === "saving" ? "ready" : state.status,
  };
}

/** v2 保存成功后的基线重置：以服务器规范化后的 yaml 为新基线。 */
export function markV2ProjectSaved(state: ProjectControllerState, yaml: string): ProjectControllerState {
  if (state.schemaVersion !== 2 || !state.v2) return state;
  const warnings = state.v2.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning",
  );
  return {
    ...state,
    originalYaml: yaml,
    draftYaml: yaml,
    dirty: false,
    status: "ready",
    message:
      warnings.length > 0
        ? `已保存，${warnings.length} 条配置警告待处理`
        : "已保存 config/routes.yaml，可运行检查、生成和提交",
  };
}

export function canSaveProject(state: ProjectControllerState): SaveReadiness {
  if (state.schemaVersion === 2) {
    const v2 = state.v2;
    if (!v2) {
      return {
        ok: false,
        reason: "Schema v2 配置未成功装载，无法保存",
        diagnostics: projectDiagnostics(state.draftConfig),
        warnings: [],
      };
    }
    const warnings = v2.diagnostics.filter((diagnostic) => diagnostic.severity === "warning");
    if (!state.dirty) {
      return {
        ok: false,
        reason: "没有未保存的修改",
        diagnostics: v2.diagnostics,
        warnings,
      };
    }
    const error = v2.diagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (error) {
      return {
        ok: false,
        reason: error.message,
        diagnostics: v2.diagnostics,
        warnings,
      };
    }
    return { ok: true, warnings };
  }

  const diagnostics = projectDiagnostics(state.draftConfig);
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning");
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
