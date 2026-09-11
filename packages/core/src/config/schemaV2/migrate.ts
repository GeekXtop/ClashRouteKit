/**
 * v1 → v2 迁移分析（事实源：docs/superpowers/specs/2026-08-10-web-console-workflow-redesign-design.md 第 5.4 节）。
 *
 * 只读分析三段式（分析 → 复核 → 原子写入）的第一段：纯函数、无 Node IO、不抛异常，
 * 产出 MigrationPlan（v2 草稿 + YAML 文本 + 结构化问题 + 摘要）；写盘由 CLI/Web
 * 调用方在用户确认后执行，本模块绝不落盘。
 *
 * 确定性规则（可复现，测试锁定）：
 * - slug：显示名（或 v1 id）空白转 "-"、小写、去掉非 [a-z0-9_-] 字符、折叠连续 "-"、
 *   去首尾 "-"；结果不满足 v2 ID 模式则回退 "group-N" / "provider-N" / "route-N"
 *   （N 为 v1 原序号，1 起）；冲突追加 "-2"、"-3"。各实体集合独立去重。
 * - 重复成员提取：≥2 个策略组拥有完全相同的非空有序 options（解析为 typed members
 *   后比较）时，按首次出现顺序提取为 memberSet "set-1"、"set-2"…，这些组的 members
 *   改为 [{ preset: "set-N" }]；空 options（url-test 叶子组的常态）与仅一组的列表
 *   保持内联。memberSet 展开顺序与原 options 严格一致。
 * - ruleSets[].policy 显示名 → { group: <组 id> }；DIRECT/REJECT → { builtin }；
 *   rule-provider 的 file → { type: "rule-provider", provider: <provider id> }。
 * - 不可表达的 v1 事实（enabled: false 路由、与默认值不同的 per-route interval、
 *   globalRemove、渲染开关）不静默丢弃，一律生成 migrate.* 诊断。
 *
 * 与 v2 类型相关的两个已知取舍（类型缺口，见 MigrationPlan 注释）：
 * - RouteV2 无 enabled 字段：enabled: false 的规则不进入 draft（否则 renderIni 会
 *   多渲染一行、破坏 INI 等价），产生 warning migrate.route.disabled。
 * - RouteSourceV2 的 rule-provider 变体无 interval 字段：per-route interval 与生效
 *   默认值（defaults.ruleSets.ruleProviderInterval，缺省 28800）不同时报
 *   error migrate.interval.dropped；相同时丢弃无损，不报。
 */
import YAML from "yaml";
import type { Diagnostic } from "../diagnostics.js";
import { LEGACY_RULE_PROVIDER_INTERVAL } from "../../defaults.js";
import type {
  CustomProxyGroup,
  ProviderBehavior,
  RouteKitProjectConfig,
  RuleProviderConfig,
  RuleSet,
  VendorRepoConfig,
} from "../../types.js";
import type {
  AuthorProjectConfigV2,
  BuiltinPolicy,
  MemberSet,
  PolicyTarget,
  ProjectV2,
  ProviderSourceV2,
  ProxyGroupV2,
  RouteSourceV2,
  RouteV2,
  RuleProviderV2,
  TypedMember,
  VendorRepoV2,
} from "./types.js";

const V2_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const BUILTIN_POLICIES = new Set(["DIRECT", "REJECT"]);
const HTTP_URL_PATTERN = /^https?:\/\//i;

/** 迁移摘要：计数均针对产出的 draft（已剔除无法表达的条目）。 */
export interface MigrationPlanSummary {
  groups: number;
  routes: number;
  providers: number;
  memberSets: number;
  issues: number;
}

/**
 * 迁移分析结果。draft/yaml 为可直接复核的 v2 作者配置；issues 使用统一
 * Diagnostic 结构（code 以 "migrate." 前缀），path 采用 v1 记法
 * （如 ruleSets[2].policy、customProxyGroups[0].options[1]）。
 */
export interface MigrationPlan {
  draft: AuthorProjectConfigV2;
  yaml: string;
  issues: Diagnostic[];
  summary: MigrationPlanSummary;
}

/**
 * 确定性 slug：空白转 "-"、小写、去非法字符、折叠 "-"、去首尾 "-"。
 * 结果不满足 v2 ID 模式（含为空）时返回空串，由调用方回退到序号命名。
 */
function slugifyName(name: string): string {
  const slug = name
    .replace(/\s+/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return V2_ID_PATTERN.test(slug) ? slug : "";
}

/**
 * 集合内唯一 id 分配器：slug 为空时用 fallback(index)（N 为 v1 原序号），
 * 冲突时追加 "-2"、"-3" 直至可用。
 */
function createIdAllocator(fallback: (index: number) => string) {
  const used = new Set<string>();
  return (slug: string, index: number): string => {
    let candidate = slug === "" ? fallback(index) : slug;
    if (used.has(candidate)) {
      let suffix = 2;
      while (used.has(`${candidate}-${suffix}`)) suffix += 1;
      candidate = `${candidate}-${suffix}`;
    }
    used.add(candidate);
    return candidate;
  };
}

function cloneTypedMembers(members: readonly TypedMember[]): TypedMember[] {
  return members.map((member) => ({ ...member }));
}

interface ProviderInfo {
  id: string;
  behavior: ProviderBehavior;
}

function pushRuntimeSettingIssue(
  issues: Diagnostic[],
  path: string,
  message: string,
): void {
  issues.push({ code: "migrate.runtime-setting", severity: "info", path, message });
}

function toProxyGroupIds(
  groups: CustomProxyGroup[],
  issues: Diagnostic[],
): { ids: string[]; nameToId: Map<string, string> } {
  const allocateId = createIdAllocator((index) => `group-${index + 1}`);
  const ids = groups.map((group, index) => allocateId(slugifyName(group.name), index));
  const nameToId = new Map<string, string>();
  groups.forEach((group, index) => {
    // 同名组以先出现者为准（v1 以显示名充当关系键，INI 渲染两者同名）。
    if (!nameToId.has(group.name)) nameToId.set(group.name, ids[index]);
  });
  return { ids, nameToId };
}

function toTypedMembers(
  group: CustomProxyGroup,
  groupIndex: number,
  nameToId: Map<string, string>,
  issues: Diagnostic[],
): TypedMember[] {
  const members: TypedMember[] = [];
  group.options.forEach((option, optionIndex) => {
    if (BUILTIN_POLICIES.has(option)) {
      members.push({ builtin: option as BuiltinPolicy });
      return;
    }
    const groupId = nameToId.get(option);
    if (groupId !== undefined) {
      members.push({ group: groupId });
      return;
    }
    issues.push({
      code: "migrate.option.unresolved",
      severity: "error",
      path: `customProxyGroups[${groupIndex}].options[${optionIndex}]`,
      message: `成员 "${option}" 既不是策略组显示名也不是 DIRECT/REJECT，` +
        "无法表达为 v2 类型化成员，已从 draft 中剔除",
      related: [option],
    });
  });
  return members;
}

function toNodeFilters(
  group: CustomProxyGroup,
  groupIndex: number,
  issues: Diagnostic[],
): ProxyGroupV2["nodeFilters"] {
  if (group.nodeFilters === undefined) return undefined;
  return group.nodeFilters.map((filter, filterIndex) => {
    if (HTTP_URL_PATTERN.test(filter)) {
      issues.push({
        code: "migrate.node-filter.url",
        severity: "error",
        path: `customProxyGroups[${groupIndex}].nodeFilters[${filterIndex}]`,
        message: "节点过滤器不允许 HTTP/HTTPS URL（健康检查 URL 应放在组 url 字段），" +
          "draft 中原样保留，由 v2 validate 层报错",
      });
    }
    return { match: filter };
  });
}

/**
 * 重复成员提取：按 typed members 的 JSON 键分组，出现 ≥2 次的非空列表
 * 依首次出现顺序提取为 "set-N"。返回每个组对应的 setId（未提取的组无条目）。
 */
function extractMemberSets(
  typedMembersByGroup: readonly TypedMember[][],
): { memberSets: Record<string, MemberSet>; setIdByGroupIndex: Map<number, string> } {
  const indexesByKey = new Map<string, number[]>();
  typedMembersByGroup.forEach((members, index) => {
    if (members.length === 0) return;
    const key = JSON.stringify(members);
    const bucket = indexesByKey.get(key);
    if (bucket === undefined) indexesByKey.set(key, [index]);
    else bucket.push(index);
  });

  const memberSets: Record<string, MemberSet> = {};
  const setIdByGroupIndex = new Map<number, string>();
  let setCounter = 0;
  for (const indexes of indexesByKey.values()) {
    if (indexes.length < 2) continue;
    setCounter += 1;
    const setId = `set-${setCounter}`;
    memberSets[setId] = { members: cloneTypedMembers(typedMembersByGroup[indexes[0]]) };
    for (const index of indexes) setIdByGroupIndex.set(index, setId);
  }
  return { memberSets, setIdByGroupIndex };
}

function toProxyGroups(
  config: RouteKitProjectConfig,
  nameToId: Map<string, string>,
  ids: readonly string[],
  setIdByGroupIndex: ReadonlyMap<number, string>,
  typedMembersByGroup: readonly TypedMember[][],
  issues: Diagnostic[],
): ProxyGroupV2[] {
  return config.customProxyGroups.map((group, index) => {
    const setId = setIdByGroupIndex.get(index);
    const nodeFilters = toNodeFilters(group, index, issues);
    return {
      id: ids[index],
      name: group.name,
      type: group.type,
      members: setId === undefined
        ? cloneTypedMembers(typedMembersByGroup[index])
        : [{ preset: setId }],
      ...(nodeFilters === undefined ? {} : { nodeFilters }),
      ...(group.url === undefined ? {} : { url: group.url }),
      ...(group.interval === undefined ? {} : { interval: group.interval }),
      ...(group.timeout === undefined ? {} : { timeout: group.timeout }),
      ...(group.tolerance === undefined ? {} : { tolerance: group.tolerance }),
    };
  });
}

function toRuleProviders(
  config: RouteKitProjectConfig,
  issues: Diagnostic[],
): { providers: RuleProviderV2[]; outputToProvider: Map<string, ProviderInfo> } {
  const allocateId = createIdAllocator((index) => `provider-${index + 1}`);
  const providers: RuleProviderV2[] = [];
  const outputToProvider = new Map<string, ProviderInfo>();
  (config.ruleProviders ?? []).forEach((provider, index) => {
    const id = allocateId(slugifyName(provider.name), index);
    const sourceIdSeen = new Set<string>();
    const sources: ProviderSourceV2[] = provider.sources.map((source, sourceIndex) => {
      let candidate = slugifyName(source.name);
      if (candidate === "") candidate = `source-${sourceIndex + 1}`;
      if (sourceIdSeen.has(candidate)) {
        let suffix = 2;
        while (sourceIdSeen.has(`${candidate}-${suffix}`)) suffix += 1;
        candidate = `${candidate}-${suffix}`;
      }
      sourceIdSeen.add(candidate);
      const common = {
        id: candidate,
        name: source.name,
        type: source.type,
        ...(source.basePath === undefined ? {} : { basePath: source.basePath }),
      };
      return source.type === "domain-list-community"
        ? { ...common, type: source.type, entry: source.entry }
        : { ...common, type: source.type, path: source.path };
    });

    if (provider.output.toLowerCase().endsWith(".mrs")) {
      issues.push({
        code: "migrate.output.mrs",
        severity: "error",
        path: `ruleProviders[${index}].output`,
        message: `rule-provider ${provider.name} 的输出 "${provider.output}" 为 .mrs；` +
          "v2 仅允许 .yaml，draft 保留原值由 validate 层报错，迁移不静默改写",
        related: [provider.output],
      });
    }
    if (provider.enabled !== false && sources.length === 0) {
      issues.push({
        code: "migrate.sources.empty",
        severity: "error",
        path: `ruleProviders[${index}].sources`,
        message: `启用的 rule-provider ${provider.name} 没有任何数据源`,
        related: [provider.name],
      });
    }
    if (!outputToProvider.has(provider.output)) {
      outputToProvider.set(provider.output, { id, behavior: provider.behavior });
    }
    providers.push({
      id,
      name: provider.name,
      output: provider.output,
      behavior: provider.behavior,
      ...(provider.enabled === undefined ? {} : { enabled: provider.enabled }),
      ...(provider.exclude === undefined ? {} : { exclude: provider.exclude }),
      ...(provider.remove === undefined ? {} : { remove: provider.remove }),
      sources,
    });
  });
  return { providers, outputToProvider };
}

function toPolicyTarget(
  ruleSet: RuleSet,
  ruleSetIndex: number,
  nameToId: Map<string, string>,
  issues: Diagnostic[],
): PolicyTarget {
  if (BUILTIN_POLICIES.has(ruleSet.policy)) {
    return { builtin: ruleSet.policy as BuiltinPolicy };
  }
  const groupId = nameToId.get(ruleSet.policy);
  if (groupId !== undefined) return { group: groupId };
  issues.push({
    code: "migrate.policy.missing",
    severity: "error",
    path: `ruleSets[${ruleSetIndex}].policy`,
    message: `策略 "${ruleSet.policy}" 不匹配任何策略组显示名，` +
      "draft 中保留为悬空 group 引用，需人工映射后才能通过校验",
    related: [ruleSet.policy],
  });
  return { group: slugifyName(ruleSet.policy) || "missing-policy" };
}

function toRouteSource(
  ruleSet: RuleSet,
  ruleSetIndex: number,
  outputToProvider: ReadonlyMap<string, ProviderInfo>,
  config: RouteKitProjectConfig,
  issues: Diagnostic[],
): RouteSourceV2 {
  const source = ruleSet.source;
  if (source.type === "geosite") return { type: "geosite", value: source.value };
  if (source.type === "geoip") {
    return {
      type: "geoip",
      value: source.value,
      ...(source.noResolve === undefined ? {} : { noResolve: source.noResolve }),
    };
  }
  if (source.type === "final") return { type: "final" };

  const provider = outputToProvider.get(source.file);
  if (provider === undefined) {
    issues.push({
      code: "migrate.provider.missing",
      severity: "error",
      path: `ruleSets[${ruleSetIndex}].source.file`,
      message: `找不到输出文件为 "${source.file}" 的 rule-provider，路由仍生成但引用悬空`,
      related: [source.file],
    });
    return {
      type: "rule-provider",
      provider: slugifyName(source.file) || "missing-provider",
    };
  }
  if (provider.behavior !== source.behavior) {
    issues.push({
      code: "migrate.provider.behavior.mismatch",
      severity: "error",
      path: `ruleSets[${ruleSetIndex}].source.behavior`,
      message: `规则 ${ruleSet.id} 声明 behavior "${source.behavior}"，与 rule-provider ` +
        `"${provider.id}" 的 "${provider.behavior}" 不一致；v2 渲染取 provider 的 behavior`,
      related: [source.file],
    });
  }
  if (source.interval !== undefined) {
    const effective = config.defaults?.ruleSets?.ruleProviderInterval
      ?? LEGACY_RULE_PROVIDER_INTERVAL;
    if (source.interval !== effective) {
      issues.push({
        code: "migrate.interval.dropped",
        severity: "error",
        path: `ruleSets[${ruleSetIndex}].source.interval`,
        message: `规则 ${ruleSet.id} 的 interval ${source.interval} 与生效默认值 ` +
          `${effective} 不同；v2 路由 source 不支持 per-route interval，` +
          "迁移后渲染将使用默认值",
        related: [ruleSet.id],
      });
    }
  }
  return { type: "rule-provider", provider: provider.id };
}

function toRoutes(
  config: RouteKitProjectConfig,
  nameToId: Map<string, string>,
  outputToProvider: ReadonlyMap<string, ProviderInfo>,
  issues: Diagnostic[],
): RouteV2[] {
  const allocateId = createIdAllocator((index) => `route-${index + 1}`);
  const routes: RouteV2[] = [];
  config.ruleSets.forEach((ruleSet, index) => {
    if (ruleSet.enabled === false) {
      issues.push({
        code: "migrate.route.disabled",
        severity: "warning",
        path: `ruleSets[${index}]`,
        message: `规则 ${ruleSet.id} 为 enabled: false；v2 路由模型暂无 enabled 字段，` +
          "为保持 INI 等价未带入 draft，如需保留请迁移后手动处理",
        related: [ruleSet.id],
      });
      return;
    }
    routes.push({
      id: allocateId(slugifyName(ruleSet.id), index),
      policy: toPolicyTarget(ruleSet, index, nameToId, issues),
      source: toRouteSource(ruleSet, index, outputToProvider, config, issues),
      ...(ruleSet.section === undefined ? {} : { section: ruleSet.section }),
    });
  });
  return routes;
}

function toVendorRepos(repos: VendorRepoConfig[], issues: Diagnostic[]): VendorRepoV2[] {
  const allocateId = createIdAllocator((index) => `vendor-${index + 1}`);
  return repos.map((repo, index) => ({
    ...repo,
    id: allocateId(slugifyName(repo.name), index),
  }));
}

function collectProjectLevelIssues(config: RouteKitProjectConfig, issues: Diagnostic[]): void {
  pushRuntimeSettingIssue(
    issues,
    "publishBaseUrl",
    `v1 publishBaseUrl（${config.publishBaseUrl}）属于本地运行设置，` +
      "迁移复核时应移入 .clashroutekit/local.yaml，不带入 v2 作者配置",
  );
  if (config.subconverterUrl !== undefined) {
    pushRuntimeSettingIssue(
      issues,
      "subconverterUrl",
      "v1 subconverterUrl 属于本地运行设置，不带入 v2 作者配置",
    );
  }
  const templateFlags = [
    ["enableRuleGenerator", config.template.enableRuleGenerator],
    ["overwriteOriginalRules", config.template.overwriteOriginalRules],
    ["clashRuleBase", config.template.clashRuleBase],
  ] as const;
  for (const [field, value] of templateFlags) {
    if (value === undefined) continue;
    pushRuntimeSettingIssue(
      issues,
      `template.${field}`,
      `v1 模板渲染开关 template.${field} 不进入 v2 作者配置；` +
        "渲染时通过 renderIni 选项 / 调用方设置提供",
    );
  }
  if (config.globalRemove !== undefined) {
    issues.push({
      code: "migrate.field.unsupported",
      severity: "warning",
      path: "globalRemove",
      message: "v1 globalRemove 在 v2 作者配置中暂无对应字段，未带入 draft",
    });
  }
}

/**
 * 对 v1 项目配置做只读迁移分析，产出 v2 草稿、YAML 文本、结构化问题与摘要。
 * 纯函数：无 IO、不抛异常、不修改输入；所有问题收集为 migrate.* 诊断。
 * error 级问题需用户复核后才能通过 v2 validate 并写盘。
 */
export function planLegacyMigration(config: RouteKitProjectConfig): MigrationPlan {
  const issues: Diagnostic[] = [];
  collectProjectLevelIssues(config, issues);

  const { ids: groupIds, nameToId } = toProxyGroupIds(config.customProxyGroups, issues);
  const typedMembersByGroup = config.customProxyGroups.map((group, index) =>
    toTypedMembers(group, index, nameToId, issues),
  );
  const { memberSets, setIdByGroupIndex } = extractMemberSets(typedMembersByGroup);

  const { providers, outputToProvider } = toRuleProviders(config, issues);
  const routes = toRoutes(config, nameToId, outputToProvider, issues);

  const project: ProjectV2 = {
    template: { output: config.template.output },
    ...(config.defaults === undefined ? {} : { defaults: config.defaults }),
  };

  const draft: AuthorProjectConfigV2 = {
    schemaVersion: 2,
    project,
    ...(Object.keys(memberSets).length === 0 ? {} : { memberSets }),
    proxyGroups: toProxyGroups(
      config,
      nameToId,
      groupIds,
      setIdByGroupIndex,
      typedMembersByGroup,
      issues,
    ),
    routes,
    ruleProviders: providers,
    ...(config.vendorRepos.length === 0
      ? {}
      : { vendorRepos: toVendorRepos(config.vendorRepos, issues) }),
  };

  return {
    draft,
    yaml: YAML.stringify(draft, { lineWidth: 0 }).replace(/\n?$/, "\n"),
    issues,
    summary: {
      groups: draft.proxyGroups.length,
      routes: draft.routes.length,
      providers: draft.ruleProviders.length,
      memberSets: Object.keys(memberSets).length,
      issues: issues.length,
    },
  };
}
