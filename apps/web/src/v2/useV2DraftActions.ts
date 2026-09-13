/**
 * Schema v2 项目的编辑会话适配（plan Task 4 UI 半边）：
 * - 方法名与 `useProjectDraftActions`（v1）保持一致，页面与既有调用点可无差别
 *   传入两套实现（duck typing）；内部改调 `v2/mutations` + `applyV2Config`，
 *   自动保存由 App 既有 v2 分支完成；
 * - 显示名进、稳定 ID 出：按名称传入的 key 先解析为 ID（group / provider 支持
 *   id 或 name 命中），v1 形状实体（CustomProxyGroup / RuleSet / RuleProviderSource）
 *   在入口转换为 v2 形状；
 * - v2 无对应概念的 v1 动作（globalRemove、INI 导入、路由启用开关）为显式 no-op；
 * - 另提供 v2 抽屉专用的扩展动作：saveProxyGroup / saveRoute / upsertMemberSet /
 *   removeMemberSet（稳定 ID 直改，不做 v1 形状转换）。
 */
import type { Dispatch, SetStateAction } from "react";
import type {
  AuthorProjectConfigV2,
  BuiltinPolicy,
  CustomProxyGroup,
  ImportedConfig,
  PolicyTarget,
  ProjectV2,
  ProxyGroupV2,
  RouteKitDefaults,
  RouteSourceV2,
  RuleProviderConfig,
  RuleProviderSource,
  RuleSet,
  RuleSetSource,
  RouteV2,
  TypedMember,
} from "@clash-route-kit/core";
import {
  addProxyGroup,
  addRoute,
  addRuleProvider,
  allocateId,
  createProxyGroup,
  createRuleProvider,
  moveRoute,
  removeMemberSet,
  removeProxyGroup,
  removeRoute,
  removeRuleProvider,
  slugifyId,
  updateProject,
  updateProxyGroup,
  updateRoute,
  updateRuleProvider,
  upsertMemberSet,
} from "./mutations.js";
import {
  applyV2Config,
  setProjectSelection,
  type ProjectControllerState,
} from "../projectController.js";

const BUILTIN_POLICIES: BuiltinPolicy[] = ["DIRECT", "REJECT"];

type SelectionPatch = Partial<
  Pick<
    ProjectControllerState,
    | "selectedView"
    | "selectedRuleSetId"
    | "selectedCustomProxyGroupName"
    | "selectedProviderName"
  >
>;

function dirtyMessage(next: ProjectControllerState): ProjectControllerState {
  return {
    ...next,
    message: next.dirty ? "有未保存的本地配置修改" : next.message,
    status: next.status === "error" ? "ready" : next.status,
  };
}

function mutationError(current: ProjectControllerState, error: unknown): ProjectControllerState {
  return {
    ...current,
    status: "error",
    message: error instanceof Error ? error.message : String(error),
  };
}

function isBuiltinPolicy(value: string): value is BuiltinPolicy {
  return BUILTIN_POLICIES.includes(value as BuiltinPolicy);
}

/** group 支持 id 或显示名命中（v1 通路按名引用，v2 通路按 ID 引用）。 */
function findProxyGroup(
  config: AuthorProjectConfigV2,
  key: string,
): ProxyGroupV2 | undefined {
  return config.proxyGroups.find((group) => group.id === key || group.name === key);
}

function findProvider(
  config: AuthorProjectConfigV2,
  key: string,
) {
  return config.ruleProviders.find((provider) => provider.id === key || provider.name === key);
}

/** 策略名 → v2 PolicyTarget：DIRECT/REJECT → builtin；否则按显示名或 id 解析组。 */
function resolvePolicyTarget(config: AuthorProjectConfigV2, policy: string): PolicyTarget {
  if (isBuiltinPolicy(policy)) return { builtin: policy };
  const group = findProxyGroup(config, policy);
  if (!group) {
    throw new Error(`策略组 "${policy}" 不存在`);
  }
  return { group: group.id };
}

/** v1 路由来源 → v2 RouteSourceV2：rule-provider 按 output → name → id 解析 provider。 */
function convertRouteSource(
  config: AuthorProjectConfigV2,
  source: RuleSetSource,
): RouteSourceV2 {
  if (source.type === "rule-provider") {
    const provider = config.ruleProviders.find(
      (item) => item.output === source.file || item.name === source.file || item.id === source.file,
    );
    if (!provider) {
      throw new Error(`规则提供者 "${source.file}" 不存在，无法引用`);
    }
    return { type: "rule-provider", provider: provider.id };
  }
  return source;
}

function typedMemberFromOption(
  config: AuthorProjectConfigV2,
  selfId: string,
  option: string,
): TypedMember {
  if (isBuiltinPolicy(option)) return { builtin: option };
  const target = findProxyGroup(config, option);
  return { group: target && target.id !== selfId ? target.id : option };
}

/**
 * v1 来源数组 → v2 ProviderSourceV2：编辑器往返会保留已有 id（展开运算符透传），
 * 仅新增 / 重置的来源缺 id——按确定性 slug 分配并与既有 id 去重。
 */
function attachProviderSourceIds(
  existing: readonly { id: string }[],
  sources: readonly RuleProviderSource[],
) {
  const used = new Set(existing.map((source) => source.id));
  return sources.map((source, index) => {
    const candidate = source as RuleProviderSource & { id?: string };
    if (typeof candidate.id === "string" && candidate.id) {
      used.add(candidate.id);
      return candidate as RuleProviderSource & { id: string };
    }
    const base = slugifyId(source.name || source.type) || `src-${index + 1}`;
    const id = allocateId(used, base);
    used.add(id);
    return { ...source, id };
  });
}

/** 选中实体被删除后回退到首个实体，避免悬空选中态（对齐 v1 applyDraftConfig 行为）。 */
function withNormalizedSelection(
  state: ProjectControllerState,
  config: AuthorProjectConfigV2,
  patch: SelectionPatch,
): ProjectControllerState {
  const selection = {
    selectedRuleSetId: state.selectedRuleSetId,
    selectedCustomProxyGroupName: state.selectedCustomProxyGroupName,
    selectedProviderName: state.selectedProviderName,
    ...patch,
  };
  if (!config.routes.some((route) => route.id === selection.selectedRuleSetId)) {
    selection.selectedRuleSetId = config.routes[0]?.id ?? "";
  }
  if (!config.proxyGroups.some((group) => group.name === selection.selectedCustomProxyGroupName)) {
    selection.selectedCustomProxyGroupName = config.proxyGroups[0]?.name ?? "";
  }
  if (!config.ruleProviders.some((provider) => provider.name === selection.selectedProviderName)) {
    selection.selectedProviderName = config.ruleProviders[0]?.name ?? "";
  }
  return setProjectSelection(state, selection);
}

export function useV2DraftActions(setProject: Dispatch<SetStateAction<ProjectControllerState>>) {
  function applyMutation(
    mutator: (config: AuthorProjectConfigV2) => AuthorProjectConfigV2,
    select?: (nextConfig: AuthorProjectConfigV2, prevConfig: AuthorProjectConfigV2) => SelectionPatch,
  ) {
    setProject((current) => {
      if (current.schemaVersion !== 2 || !current.v2) return current;
      try {
        const next = applyV2Config(current, mutator(current.v2.config));
        if (!next.v2) return next;
        const patch = select?.(next.v2.config, current.v2.config);
        return dirtyMessage(withNormalizedSelection(next, next.v2.config, patch ?? {}));
      } catch (error: unknown) {
        return mutationError(current, error);
      }
    });
  }

  return {
    createRuleSet(sourceType: RuleSetSource["type"] = "geosite") {
      applyMutation(
        (config) => {
          const policy: PolicyTarget = config.proxyGroups[0]
            ? { group: config.proxyGroups[0].id }
            : { builtin: "DIRECT" };
          const source: RouteSourceV2 =
            sourceType === "geoip"
              ? { type: "geoip", value: "" }
              : sourceType === "rule-provider"
                ? { type: "rule-provider", provider: config.ruleProviders[0]?.id ?? "" }
                : sourceType === "final"
                  ? { type: "final" }
                  : { type: "geosite", value: "" };
          return addRoute(config, { policy, source });
        },
        (nextConfig, prevConfig) => {
          const before = new Set(prevConfig.routes.map((route) => route.id));
          const added = nextConfig.routes.find((route) => !before.has(route.id));
          return added ? { selectedRuleSetId: added.id, selectedView: "routing" } : {};
        },
      );
    },
    createCustomProxyGroup(type: CustomProxyGroup["type"] = "select") {
      applyMutation(
        (config) => addProxyGroup(config, createProxyGroup(config, type)),
        (nextConfig, prevConfig) => {
          const before = new Set(prevConfig.proxyGroups.map((group) => group.id));
          const added = nextConfig.proxyGroups.find((group) => !before.has(group.id));
          return added
            ? { selectedCustomProxyGroupName: added.name, selectedView: "routing" }
            : {};
        },
      );
    },
    createProvider() {
      applyMutation(
        (config) => addRuleProvider(config, createRuleProvider(config)),
        (nextConfig, prevConfig) => {
          const before = new Set(prevConfig.ruleProviders.map((provider) => provider.id));
          const added = nextConfig.ruleProviders.find((provider) => !before.has(provider.id));
          return added
            ? { selectedProviderName: added.name, selectedView: "library" }
            : {};
        },
      );
    },
    deleteRuleSet(ruleSetId: string) {
      applyMutation((config) => removeRoute(config, ruleSetId));
    },
    deleteCustomProxyGroup(groupName: string) {
      applyMutation((config) => {
        const group = findProxyGroup(config, groupName);
        return group ? removeProxyGroup(config, group.id) : config;
      });
    },
    deleteProvider(providerName: string) {
      applyMutation((config) => {
        const provider = findProvider(config, providerName);
        return provider ? removeRuleProvider(config, provider.id) : config;
      });
    },
    /** v1 形状整组替换：options / nodeFilters 转换为 TypedMember / { match }。 */
    saveCustomProxyGroup(originalName: string, nextGroup: CustomProxyGroup) {
      applyMutation((config) => {
        const target = findProxyGroup(config, originalName);
        if (!target) return config;
        return updateProxyGroup(config, target.id, {
          name: nextGroup.name.trim(),
          type: nextGroup.type,
          members: nextGroup.options.map((option) =>
            typedMemberFromOption(config, target.id, option),
          ),
          ...(nextGroup.nodeFilters
            ? { nodeFilters: nextGroup.nodeFilters.map((match) => ({ match })) }
            : { nodeFilters: undefined }),
          ...(nextGroup.url !== undefined ? { url: nextGroup.url } : {}),
          ...(nextGroup.interval !== undefined ? { interval: nextGroup.interval } : {}),
          ...(nextGroup.timeout !== undefined ? { timeout: nextGroup.timeout } : {}),
          ...(nextGroup.tolerance !== undefined ? { tolerance: nextGroup.tolerance } : {}),
        });
      });
    },
    /** v2 抽屉专用：按稳定 ID 整组替换（patch.id 被 updateProxyGroup 忽略）。 */
    saveProxyGroup(groupId: string, nextGroup: ProxyGroupV2) {
      applyMutation((config) => updateProxyGroup(config, groupId, nextGroup));
    },
    selectRuleSet(selectedRuleSetId: string) {
      setProject((current) => setProjectSelection(current, { selectedRuleSetId }));
    },
    /** v2 路由无 enabled 语义，路由列表启用开关在 v2 模式下隐藏，此动作为 no-op。 */
    setGlobalRemove(values: string[]) {
      void values;
    },
    setProjectDefaults(defaults: RouteKitDefaults | undefined) {
      applyMutation((config) => updateProject(config, { defaults }));
    },
    setTemplateField(patch: Partial<NonNullable<ProjectV2["template"]>>) {
      applyMutation((config) => {
        const template = { ...config.project?.template, ...patch };
        return updateProject(config, {
          template: Object.keys(template).length > 0 ? template : undefined,
        });
      });
    },
    setProviderListField(providerName: string, field: "exclude" | "remove", values: string[]) {
      applyMutation((config) => {
        const provider = findProvider(config, providerName);
        return provider
          ? updateRuleProvider(config, provider.id, { [field]: values })
          : config;
      });
    },
    setProviderSources(providerName: string, sources: RuleProviderSource[]) {
      applyMutation((config) => {
        const provider = findProvider(config, providerName);
        if (!provider) return config;
        return updateRuleProvider(config, provider.id, {
          sources: attachProviderSourceIds(provider.sources, sources),
        });
      });
    },
    reorderRuleSets(orderedIds: string[]) {
      applyMutation((config) => {
        const present = new Set(config.routes.map((route) => route.id));
        let next = config;
        orderedIds
          .filter((id) => present.has(id))
          .forEach((id, index) => {
            const currentOrder = next.routes.map((route) => route.id);
            if (currentOrder[index] !== id) {
              next = moveRoute(next, id, index);
            }
          });
        return next;
      });
    },
    addRoute(source: RuleSetSource, policy: string, section?: string) {
      applyMutation((config) =>
        addRoute(config, {
          policy: resolvePolicyTarget(config, policy),
          source: convertRouteSource(config, source),
          ...(section ? { section } : {}),
        }),
      );
    },
    addGeositeRoute(value: string, policy: string, section?: string) {
      applyMutation((config) =>
        addRoute(config, {
          policy: resolvePolicyTarget(config, policy),
          source: { type: "geosite", value: value.trim() },
          ...(section ? { section } : {}),
        }),
      );
    },
    /** v2 作者配置不经 INI 导入，维持 no-op（不污染 v2 状态与保存基线）。 */
    importIni(text: string) {
      void text;
    },
    importTemplate(imported: ImportedConfig) {
      void imported;
    },
    /** v2 路由无 enabled 语义：路由列表启用开关在 v2 模式下隐藏，此动作为 no-op。 */
    toggleRuleSet(ruleSetId: string) {
      void ruleSetId;
    },
    /** v1 形状整条替换：policy 按名解析、来源转换；路由 ID 保持稳定（不随草稿改名）。 */
    saveRuleSet(originalId: string, nextRuleSet: RuleSet) {
      applyMutation((config) => {
        const target = config.routes.find((route) => route.id === originalId);
        if (!target) return config;
        return updateRoute(config, originalId, {
          policy: resolvePolicyTarget(config, nextRuleSet.policy),
          source: convertRouteSource(config, nextRuleSet.source),
          ...(nextRuleSet.section ? { section: nextRuleSet.section } : { section: undefined }),
        });
      });
    },
    /** v2 抽屉专用：按稳定 ID 整条替换（patch.id 被 updateRoute 忽略）。 */
    saveRoute(routeId: string, nextRoute: RouteV2) {
      applyMutation((config) => updateRoute(config, routeId, nextRoute));
    },
    updateProvider(providerName: string, patch: Partial<RuleProviderConfig>) {
      applyMutation((config) => {
        const provider = findProvider(config, providerName);
        if (!provider) return config;
        const { sources, ...rest } = patch;
        return updateRuleProvider(config, provider.id, {
          ...rest,
          ...(sources ? { sources: attachProviderSourceIds(provider.sources, sources) } : {}),
        });
      });
    },
    upsertMemberSet(setId: string, members: TypedMember[]) {
      applyMutation((config) => upsertMemberSet(config, setId, members));
    },
    removeMemberSet(setId: string) {
      applyMutation((config) => removeMemberSet(config, setId));
    },
  };
}
