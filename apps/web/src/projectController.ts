import type {
  AuthorProjectConfigV2,
  Diagnostic,
  RouteKitProjectConfig,
} from "@clash-route-kit/core";
import {
  analyzeV2Config,
  loadV2Project,
  serializeV2Project,
  type RuntimeUrls,
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
  /** 只读渲染投影（v2 → 渲染 DTO 的兜底输入），编辑 mutation 不经过它。 */
  originalConfig: RouteKitProjectConfig;
  draftConfig: RouteKitProjectConfig;
  draftYaml: string;
  dirty: boolean;
  status: ProjectStatus;
  message: string;
  /** 作者配置 schema 版本；v1 磁盘格式已移除支持，恒为 2。 */
  schemaVersion: 2;
  /**
   * Schema v2 项目状态：v2 文档成功装载时存在（config + 诊断 + 摘要）。
   * 装载失败（结构错误）时为 undefined，此时 canSaveProject 拒绝保存并提示。
   */
  v2?: V2ProjectState;
  /**
   * 本地设置解析出的运行时 URL（spec 5.3）：v2 作者配置不携带这两个字段，
   * 装载时从 GET /api/project/config 响应透传，渲染投影据此填充。
   */
  runtimeUrls?: RuntimeUrls;
  /**
   * 服务端文件 mtime 基线：保存时作为 baseMtime 回传做冲突检测，
   * 装载时取自 GET 响应，保存成功后以响应中的写后 mtime 更新。
   */
  baseMtime?: number;
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

/**
 * Schema v2 项目控制器：装载失败（YAML / 结构错误）时不抛出，
 * v2 状态留空并置 error 状态提示；canSaveProject 会拒绝保存。
 * draftConfig 是只读投影（渲染各页面的兜底输入），编辑 mutation
 * 均经 useV2DraftActions 走 v2.config + applyV2Config，永不写投影。
 */
function v2ReadOnlyProjection(templateOutput: string, runtimeUrls?: RuntimeUrls): RouteKitProjectConfig {
  return {
    publishBaseUrl: runtimeUrls?.publishBaseUrl ?? "",
    subconverterUrl: runtimeUrls?.subconverterUrl,
    template: { output: templateOutput },
    vendorRepos: [],
    customProxyGroups: [],
    ruleSets: [],
    ruleProviders: [],
  };
}

/** Schema v2 项目控制器工厂：yaml 经 loadV2Project 完整装载链进入 v2 状态。 */
export function createV2ProjectController(
  yaml: string,
  runtimeUrls?: RuntimeUrls,
  baseMtime?: number,
): ProjectControllerState {
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
    runtimeUrls,
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
    runtimeUrls,
    baseMtime,
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

/**
 * 应用一次 v2 mutation 结果：重算诊断与摘要、重新序列化草稿 yaml，
 * 并以序列化结果对比装载基线计算脏状态。
 */
export function applyV2Config(
  state: ProjectControllerState,
  config: AuthorProjectConfigV2,
): ProjectControllerState {
  if (!state.v2) return state;
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

/** v2 保存成功后的基线重置：以服务器规范化后的 yaml 与写后 mtime 为新基线。 */
export function markV2ProjectSaved(
  state: ProjectControllerState,
  yaml: string,
  mtime?: number,
): ProjectControllerState {
  if (!state.v2) return state;
  const warnings = state.v2.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning",
  );
  return {
    ...state,
    originalYaml: yaml,
    draftYaml: yaml,
    dirty: false,
    baseMtime: mtime ?? state.baseMtime,
    status: "ready",
    message:
      warnings.length > 0
        ? `已保存，${warnings.length} 条配置警告待处理`
        : "已保存 config/routes.yaml，可运行检查、生成和提交",
  };
}

export function canSaveProject(state: ProjectControllerState): SaveReadiness {
  const v2 = state.v2;
  if (!v2) {
    return {
      ok: false,
      reason: "Schema v2 配置未成功装载，无法保存",
      diagnostics: [],
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
