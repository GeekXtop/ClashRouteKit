/**
 * AuthorProjectConfigV2 的不可变 mutation（plan Task 4 数据层）。
 *
 * 与 v1 `configMutations.ts` 对齐的模式：
 * - 全部纯函数：返回新对象，不修改输入；输入实体的嵌套数组深拷贝；
 * - 校验失败抛 `Error`（由调用方捕获写入项目状态消息），不返回诊断；
 * - `updateX` / `removeX` 找不到目标 ID 时返回原对象引用（no-op）；
 * - 被引用实体删除前抛错（`removeProxyGroup` / `removeMemberSet`）；
 *   `removeRuleProvider` 与 v1 `deleteRuleProvider` 一致：允许删除，
 *   悬空路由引用在保存校验链上报错。
 *
 * ID 分配照搬 core `schemaV2/migrate.ts` 的确定性规则（该模块未导出，这里按
 * 同一规则实现并用测试锁定）：显示名空白转 "-"、小写、去非法字符、折叠 "-"、
 * 去首尾 "-"；空/非法回退 `xxx-N` 序号名；冲突追加 "-2"、"-3"。
 * 与 migrate 一致，proxyGroups / memberSets / routes / ruleProviders 四个集合
 * 共用全局唯一 ID 空间（v2 validate 拦截跨集合撞名）；vendorRepos 不参与。
 */
import type {
  AuthorProjectConfigV2,
  MemberSet,
  PolicyTarget,
  ProxyGroupTypeV2,
  ProxyGroupV2,
  RouteSourceV2,
  RouteV2,
  RuleProviderV2,
  TypedMember,
} from "@clash-route-kit/core";

const V2_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * 确定性 slug：与 migrate.ts `slugifyName` 同规则。
 * 结果不满足 v2 ID 模式（含为空）时返回空串，由调用方回退序号命名。
 */
function slugifyId(name: string): string {
  const slug = name
    .replace(/\s+/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return V2_ID_PATTERN.test(slug) ? slug : "";
}

/** 四集合已用 ID 快照（memberSets 的键也是实体 ID）。 */
function collectUsedIds(config: AuthorProjectConfigV2): Set<string> {
  return new Set([
    ...config.proxyGroups.map((group) => group.id),
    ...Object.keys(config.memberSets ?? {}),
    ...config.routes.map((route) => route.id),
    ...config.ruleProviders.map((provider) => provider.id),
  ]);
}

/** 冲突时追加 "-2"、"-3" 直至可用；同一输入集合下结果确定。 */
function allocateId(used: ReadonlySet<string>, candidate: string): string {
  if (!used.has(candidate)) return candidate;
  let suffix = 2;
  while (used.has(`${candidate}-${suffix}`)) suffix += 1;
  return `${candidate}-${suffix}`;
}

/** v1 configMutations `nextName` 同规则：显示名去重后缀 "-2"、"-3"。 */
function nextName(existing: string[], baseName: string): string {
  const names = new Set(existing);
  if (!names.has(baseName)) return baseName;
  let suffix = 2;
  while (names.has(`${baseName}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseName}-${suffix}`;
}

function assertValidEntityId(id: string, label: string): void {
  if (!id) {
    throw new Error(`${label} id is required`);
  }
  if (!V2_ID_PATTERN.test(id)) {
    throw new Error(
      `${label} id "${id}" 无效，必须非空且匹配 /^[a-z0-9][a-z0-9_-]*$/`,
    );
  }
}

function assertUniqueId(config: AuthorProjectConfigV2, id: string): void {
  if (collectUsedIds(config).has(id)) {
    throw new Error(`ID "${id}" already exists`);
  }
}

function cloneTypedMembers(members: readonly TypedMember[]): TypedMember[] {
  return members.map((member) => ({ ...member }));
}

function cloneProxyGroup(group: ProxyGroupV2): ProxyGroupV2 {
  return {
    ...group,
    members: cloneTypedMembers(group.members),
    nodeFilters: group.nodeFilters
      ? group.nodeFilters.map((filter) => ({ ...filter }))
      : undefined,
  };
}

function cloneRoute(route: RouteV2): RouteV2 {
  return {
    ...route,
    policy: { ...route.policy },
    source: { ...route.source },
  };
}

function cloneRuleProvider(provider: RuleProviderV2): RuleProviderV2 {
  return {
    ...provider,
    exclude: provider.exclude ? [...provider.exclude] : undefined,
    remove: provider.remove ? [...provider.remove] : undefined,
    sources: provider.sources.map((source) => ({ ...source })),
  };
}

function cloneMemberSet(set: MemberSet): MemberSet {
  return { members: cloneTypedMembers(set.members) };
}

// ---------------------------------------------------------------------------
// 策略组（ProxyGroupV2）
// ---------------------------------------------------------------------------

/**
 * 生成待添加的策略组草稿：id 经确定性 slug + 全局分配，显示名仿 v1
 * `createCustomProxyGroup`（"ProxyGroup"、冲突 "-2"）。select 组默认
 * members [{ builtin: "DIRECT" }]；url-test / fallback / load-balance 组为
 * 空 members + `.*` 节点过滤器（与 v1 语义一致：按过滤器选择订阅节点）。
 */
export function createProxyGroup(
  config: AuthorProjectConfigV2,
  type: ProxyGroupTypeV2 = "select",
): ProxyGroupV2 {
  const name = nextName(config.proxyGroups.map((group) => group.name), "ProxyGroup");
  const id = allocateId(
    collectUsedIds(config),
    slugifyId(name) || `group-${config.proxyGroups.length + 1}`,
  );
  const base: ProxyGroupV2 = { id, name, type, members: [{ builtin: "DIRECT" }] };
  return type === "select"
    ? base
    : { ...base, members: [], nodeFilters: [{ match: ".*" }] };
}

export function addProxyGroup(
  config: AuthorProjectConfigV2,
  group: ProxyGroupV2,
): AuthorProjectConfigV2 {
  const id = group.id.trim();
  assertValidEntityId(id, "ProxyGroup");
  assertUniqueId(config, id);
  return {
    ...config,
    proxyGroups: [...config.proxyGroups, cloneProxyGroup({ ...group, id })],
  };
}

/**
 * 按 ID 替换策略组字段。ID 是 v2 的稳定关系键：patch 中的 `id` 被忽略，
 * 引用（成员 / 路由 policy / memberSet）不会随之改写。
 */
export function updateProxyGroup(
  config: AuthorProjectConfigV2,
  groupId: string,
  patch: Partial<Omit<ProxyGroupV2, "id">>,
): AuthorProjectConfigV2 {
  let found = false;
  const proxyGroups = config.proxyGroups.map((group) => {
    if (group.id !== groupId) return group;
    found = true;
    return cloneProxyGroup({ ...group, ...patch, id: group.id });
  });
  return found ? { ...config, proxyGroups } : config;
}

/** 被路由 policy、其他策略组成员或 memberSet 成员引用时抛错，不删除。 */
export function removeProxyGroup(
  config: AuthorProjectConfigV2,
  groupId: string,
): AuthorProjectConfigV2 {
  if (!config.proxyGroups.some((group) => group.id === groupId)) return config;

  const route = config.routes.find(
    (item) => "group" in item.policy && item.policy.group === groupId,
  );
  if (route) {
    throw new Error(`proxy group is still referenced by route ${route.id}: ${groupId}`);
  }
  const memberGroup = config.proxyGroups.find(
    (group) => group.id !== groupId && group.members.some((member) => "group" in member && member.group === groupId),
  );
  if (memberGroup) {
    throw new Error(`proxy group is still referenced by ${memberGroup.id}: ${groupId}`);
  }
  for (const [setId, set] of Object.entries(config.memberSets ?? {})) {
    if (set.members.some((member) => "group" in member && member.group === groupId)) {
      throw new Error(`proxy group is still referenced by memberSet ${setId}: ${groupId}`);
    }
  }

  return {
    ...config,
    proxyGroups: config.proxyGroups.filter((group) => group.id !== groupId),
  };
}

// ---------------------------------------------------------------------------
// 路由（RouteV2）
// ---------------------------------------------------------------------------

export interface AddRouteParams {
  policy: PolicyTarget;
  source: RouteSourceV2;
  section?: string;
}

/**
 * 添加路由：ID 按 v1 `addRoute` 同规则从 source 确定性生成
 * （`<type>-<slug 提示>`，冲突追加 "-N"），插入位置仿 v1 `addRuleSet`：
 * 已存在 FINAL 时插到 FINAL 之前，FINAL 路由本身追加在末尾。
 */
export function addRoute(
  config: AuthorProjectConfigV2,
  params: AddRouteParams,
): AuthorProjectConfigV2 {
  const hint =
    params.source.type === "geosite" || params.source.type === "geoip"
      ? params.source.value
      : params.source.type === "rule-provider"
        ? params.source.provider
        : "final";
  const base = slugifyId(`${params.source.type}-${hint || "entry"}`);
  const id = allocateId(collectUsedIds(config), base || `route-${config.routes.length + 1}`);
  const route: RouteV2 = {
    id,
    policy: { ...params.policy },
    source: { ...params.source },
    ...(params.section ? { section: params.section } : {}),
  };

  const finalIndex = config.routes.findIndex((item) => item.source.type === "final");
  const insertIndex =
    route.source.type === "final" || finalIndex === -1 ? config.routes.length : finalIndex;
  return {
    ...config,
    routes: [
      ...config.routes.slice(0, insertIndex),
      cloneRoute(route),
      ...config.routes.slice(insertIndex),
    ],
  };
}

/** patch 中的 `id` 被忽略（稳定 ID）；目标不存在时返回原对象。 */
export function updateRoute(
  config: AuthorProjectConfigV2,
  routeId: string,
  patch: Partial<Omit<RouteV2, "id">>,
): AuthorProjectConfigV2 {
  let found = false;
  const routes = config.routes.map((route) => {
    if (route.id !== routeId) return route;
    found = true;
    return cloneRoute({ ...route, ...patch, id: route.id });
  });
  return found ? { ...config, routes } : config;
}

export function removeRoute(
  config: AuthorProjectConfigV2,
  routeId: string,
): AuthorProjectConfigV2 {
  if (!config.routes.some((route) => route.id === routeId)) return config;
  return { ...config, routes: config.routes.filter((route) => route.id !== routeId) };
}

/** 把路由移到目标下标（越界收紧到边界）；目标不存在时返回原对象。 */
export function moveRoute(
  config: AuthorProjectConfigV2,
  routeId: string,
  toIndex: number,
): AuthorProjectConfigV2 {
  const from = config.routes.findIndex((route) => route.id === routeId);
  if (from === -1) return config;
  const to = Math.max(0, Math.min(config.routes.length - 1, Math.trunc(toIndex)));
  if (to === from) return config;
  const routes = [...config.routes];
  const [moved] = routes.splice(from, 1);
  routes.splice(to, 0, moved!);
  return { ...config, routes };
}

// ---------------------------------------------------------------------------
// 规则提供者（RuleProviderV2）
// ---------------------------------------------------------------------------

/** 生成待添加的规则源草稿，形状仿 v1 `createRuleProvider`（禁用、无数据源）。 */
export function createRuleProvider(config: AuthorProjectConfigV2): RuleProviderV2 {
  const name = nextName(
    config.ruleProviders.map((provider) => provider.name),
    "Provider",
  );
  const id = allocateId(
    collectUsedIds(config),
    slugifyId(name) || `provider-${config.ruleProviders.length + 1}`,
  );
  return {
    id,
    name,
    output: `${name}_Domain.yaml`,
    behavior: "domain",
    enabled: false,
    sources: [],
  };
}

export function addRuleProvider(
  config: AuthorProjectConfigV2,
  provider: RuleProviderV2,
): AuthorProjectConfigV2 {
  const id = provider.id.trim();
  const name = provider.name.trim();
  const output = provider.output.trim();
  assertValidEntityId(id, "Rule provider");
  assertUniqueId(config, id);
  if (!name) {
    throw new Error("Rule provider name is required");
  }
  if (!output) {
    throw new Error("Rule provider output is required");
  }
  if (config.ruleProviders.some((item) => item.output === output)) {
    throw new Error(`Rule provider output already exists: ${output}`);
  }
  return {
    ...config,
    ruleProviders: [
      ...config.ruleProviders,
      cloneRuleProvider({ ...provider, id, name, output }),
    ],
  };
}

/** patch 中的 `id` 被忽略（稳定 ID）；目标不存在时返回原对象。 */
export function updateRuleProvider(
  config: AuthorProjectConfigV2,
  providerId: string,
  patch: Partial<Omit<RuleProviderV2, "id">>,
): AuthorProjectConfigV2 {
  let found = false;
  const ruleProviders = config.ruleProviders.map((provider) => {
    if (provider.id !== providerId) return provider;
    found = true;
    return cloneRuleProvider({ ...provider, ...patch, id: provider.id });
  });
  return found ? { ...config, ruleProviders } : config;
}

/**
 * 与 v1 `deleteRuleProvider` 一致：不做引用检查，直接移除；
 * 路由上悬空的 provider 引用由保存校验链（validate.reference.missing）拦截。
 */
export function removeRuleProvider(
  config: AuthorProjectConfigV2,
  providerId: string,
): AuthorProjectConfigV2 {
  return {
    ...config,
    ruleProviders: config.ruleProviders.filter((provider) => provider.id !== providerId),
  };
}

export function setRuleProviderEnabled(
  config: AuthorProjectConfigV2,
  providerId: string,
  enabled: boolean,
): AuthorProjectConfigV2 {
  return updateRuleProvider(config, providerId, { enabled });
}

// ---------------------------------------------------------------------------
// 成员集合（memberSets）
// ---------------------------------------------------------------------------

/** 键存在时整体替换 members（深拷贝），否则新增；ID 必须合法且全局唯一。 */
export function upsertMemberSet(
  config: AuthorProjectConfigV2,
  setId: string,
  members: TypedMember[],
): AuthorProjectConfigV2 {
  const id = setId.trim();
  assertValidEntityId(id, "memberSet");
  const memberSets = { ...(config.memberSets ?? {}) };
  if (!Object.hasOwn(memberSets, id)) {
    assertUniqueId(config, id);
  }
  memberSets[id] = { members: cloneTypedMembers(members) };
  return { ...config, memberSets };
}

/** 被策略组成员或其他 memberSet 的 preset 引用时报错，不删除；不存在时 no-op。 */
export function removeMemberSet(
  config: AuthorProjectConfigV2,
  setId: string,
): AuthorProjectConfigV2 {
  const memberSets = config.memberSets ?? {};
  if (!Object.hasOwn(memberSets, setId)) return config;

  const group = config.proxyGroups.find((item) =>
    item.members.some((member) => "preset" in member && member.preset === setId),
  );
  if (group) {
    throw new Error(`memberSet is still referenced by proxy group ${group.id}: ${setId}`);
  }
  for (const [otherId, set] of Object.entries(memberSets)) {
    if (otherId !== setId && set.members.some((member) => "preset" in member && member.preset === setId)) {
      throw new Error(`memberSet is still referenced by memberSet ${otherId}: ${setId}`);
    }
  }

  const next = { ...memberSets };
  delete next[setId];
  return {
    ...config,
    ...(Object.keys(next).length === 0 ? { memberSets: undefined } : { memberSets: next }),
  };
}
