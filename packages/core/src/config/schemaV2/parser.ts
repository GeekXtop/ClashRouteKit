import YAML from "yaml";
import type {
  AuthorProjectConfigV2,
  MemberSet,
  NodeFilterV2,
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
import type {
  ProxyGroupDefaults,
  ProxyGroupHealthCheckDefaults,
  RouteKitDefaults,
  RuleSetDefaults,
} from "../../types.js";
import { ConfigDiagnosticError, type Diagnostic } from "../diagnostics.js";
import {
  assertKnownKeys,
  readArray,
  readEnum,
  readObject,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
  readString,
} from "../valueReaders.js";

const GROUP_TYPES = ["select", "url-test", "fallback", "load-balance"] as const;
const BEHAVIORS = ["domain", "classical", "ipcidr"] as const;
const BUILTIN_POLICIES = ["DIRECT", "REJECT"] as const;
const SOURCE_TYPES = ["clash-list", "clash-provider", "domain-list-community"] as const;
const CATALOG_KINDS = ["domain-list", "list-dir", "provider-yaml", "ini-template"] as const;
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;

const TOP_LEVEL_KEYS = [
  "schemaVersion",
  "project",
  "memberSets",
  "proxyGroups",
  "routes",
  "ruleProviders",
  "vendorRepos",
] as const;

const MEMBER_KEYS = ["group", "builtin", "preset"] as const;
const POLICY_KEYS = ["group", "builtin"] as const;

function fail(diagnostic: Diagnostic): never {
  throw new ConfigDiagnosticError([diagnostic]);
}

const READER_MESSAGES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^expected object$/, "期望对象"],
  [/^expected array$/, "期望数组"],
  [/^expected string$/, "期望字符串"],
  [/^expected boolean$/, "期望布尔值"],
  [/^expected number$/, "期望数字"],
  [/^unknown field$/, "未知字段"],
];

/**
 * 把 valueReaders 抛出的普通 Error（`<path>: expected xxx`）转成统一结构的
 * ConfigDiagnosticError，保持 path 记法与 legacyParser 一致。
 */
function toDiagnosticError(error: unknown): ConfigDiagnosticError {
  const message = error instanceof Error ? error.message : String(error);
  const separator = message.indexOf(": ");
  if (separator === -1) {
    return new ConfigDiagnosticError([
      { code: "config.field.invalid", severity: "error", message },
    ]);
  }
  const path = message.slice(0, separator);
  const detail = message.slice(separator + 2);
  let text: string = detail;
  for (const [pattern, replacement] of READER_MESSAGES) {
    if (pattern.test(detail)) {
      text = replacement;
      break;
    }
  }
  const enumMatch = /^expected one of (.+)$/.exec(detail);
  if (enumMatch) {
    text = `期望以下之一：${enumMatch[1]}`;
  }
  return new ConfigDiagnosticError([
    { code: "config.field.invalid", severity: "error", path, message: text },
  ]);
}

function readStringArray(value: unknown, path: string): string[] {
  return readArray(value, path).map((item, index) =>
    readString(item, `${path}[${index}]`),
  );
}

function requiredNumber(value: unknown, path: string): number | undefined {
  const parsed = readOptionalNumber(value, path);
  if (parsed === null) throw new Error(`${path}: expected number`);
  return parsed;
}

function readEntityId(value: unknown, path: string): string {
  const id = readString(value, path);
  if (id.length === 0 || !ID_PATTERN.test(id)) {
    fail({
      code: "config.id.invalid",
      severity: "error",
      path,
      message: `${path}: 无效 ID "${id}"，必须非空且匹配 /^[a-z0-9][a-z0-9_-]*$/i`,
    });
  }
  return id;
}

function readUniqueEntityId(
  value: unknown,
  path: string,
  seen: Set<string>,
  label: string,
): string {
  const id = readEntityId(value, path);
  if (seen.has(id)) {
    fail({
      code: "config.id.duplicate",
      severity: "error",
      path,
      message: `重复的${label} ID：${id}`,
      related: [id],
    });
  }
  seen.add(id);
  return id;
}

function parseTypedMember(value: unknown, path: string): TypedMember {
  const member = readObject(value, path);
  assertKnownKeys(member, MEMBER_KEYS, path);
  const present = MEMBER_KEYS.filter((key) => member[key] !== undefined);
  if (present.length !== 1) {
    fail({
      code: "member.keys.invalid",
      severity: "error",
      path,
      message: `${path} 必须恰好包含 group、builtin、preset 中的一个`,
    });
  }
  if (member.group !== undefined) {
    return { group: readString(member.group, `${path}.group`) };
  }
  if (member.preset !== undefined) {
    return { preset: readString(member.preset, `${path}.preset`) };
  }
  return { builtin: readEnum(member.builtin, BUILTIN_POLICIES, `${path}.builtin`) };
}

function parseMemberArray(value: unknown, path: string): TypedMember[] {
  return readArray(value, path).map((item, index) =>
    parseTypedMember(item, `${path}[${index}]`),
  );
}

function parsePolicyTarget(value: unknown, path: string): PolicyTarget {
  const target = readObject(value, path);
  assertKnownKeys(target, POLICY_KEYS, path);
  const present = POLICY_KEYS.filter((key) => target[key] !== undefined);
  if (present.length !== 1) {
    fail({
      code: "policy.keys.invalid",
      severity: "error",
      path,
      message: `${path} 必须恰好包含 group、builtin 中的一个`,
    });
  }
  if (target.group !== undefined) {
    return { group: readString(target.group, `${path}.group`) };
  }
  return { builtin: readEnum(target.builtin, BUILTIN_POLICIES, `${path}.builtin`) };
}

function parseNodeFilters(value: unknown, path: string): NodeFilterV2[] {
  return readArray(value, path).map((item, index) => {
    const filterPath = `${path}[${index}]`;
    const filter = readObject(item, filterPath);
    assertKnownKeys(filter, ["match"], filterPath);
    return { match: readString(filter.match, `${filterPath}.match`) };
  });
}

function parseProxyGroup(
  value: unknown,
  path: string,
  seenIds: Set<string>,
): ProxyGroupV2 {
  const group = readObject(value, path);
  assertKnownKeys(
    group,
    ["id", "name", "type", "members", "nodeFilters", "url", "interval", "timeout", "tolerance"],
    path,
  );
  return {
    id: readUniqueEntityId(group.id, `${path}.id`, seenIds, "策略组"),
    name: readString(group.name, `${path}.name`),
    type: readEnum(group.type, GROUP_TYPES, `${path}.type`),
    members: parseMemberArray(group.members, `${path}.members`),
    ...(group.nodeFilters === undefined
      ? {}
      : { nodeFilters: parseNodeFilters(group.nodeFilters, `${path}.nodeFilters`) }),
    ...(group.url === undefined
      ? {}
      : { url: readOptionalString(group.url, `${path}.url`) }),
    ...(group.interval === undefined
      ? {}
      : { interval: requiredNumber(group.interval, `${path}.interval`) }),
    ...(group.timeout === undefined
      ? {}
      : { timeout: readOptionalNumber(group.timeout, `${path}.timeout`) }),
    ...(group.tolerance === undefined
      ? {}
      : { tolerance: readOptionalNumber(group.tolerance, `${path}.tolerance`) }),
  };
}

function parseRouteSource(value: unknown, path: string): RouteSourceV2 {
  const source = readObject(value, path);
  const type = readEnum(
    source.type,
    ["geosite", "geoip", "rule-provider", "final"] as const,
    `${path}.type`,
  );
  if (type === "rule-provider") {
    assertKnownKeys(source, ["type", "provider"], path);
    return { type, provider: readString(source.provider, `${path}.provider`) };
  }
  if (type === "geosite") {
    assertKnownKeys(source, ["type", "value"], path);
    return { type, value: readString(source.value, `${path}.value`) };
  }
  if (type === "geoip") {
    assertKnownKeys(source, ["type", "value", "noResolve"], path);
    return {
      type,
      value: readString(source.value, `${path}.value`),
      ...(source.noResolve === undefined
        ? {}
        : { noResolve: readOptionalBoolean(source.noResolve, `${path}.noResolve`) }),
    };
  }
  assertKnownKeys(source, ["type"], path);
  return { type };
}

function parseRoute(value: unknown, path: string, seenIds: Set<string>): RouteV2 {
  const route = readObject(value, path);
  assertKnownKeys(route, ["id", "policy", "source", "section"], path);
  return {
    id: readUniqueEntityId(route.id, `${path}.id`, seenIds, "路由"),
    policy: parsePolicyTarget(route.policy, `${path}.policy`),
    source: parseRouteSource(route.source, `${path}.source`),
    ...(route.section === undefined
      ? {}
      : { section: readOptionalString(route.section, `${path}.section`) }),
  };
}

function parseProviderSource(
  value: unknown,
  path: string,
  seenIds: Set<string>,
): ProviderSourceV2 {
  const source = readObject(value, path);
  const type = readEnum(source.type, SOURCE_TYPES, `${path}.type`);
  const id = readUniqueEntityId(source.id, `${path}.id`, seenIds, "数据源");
  if (type === "domain-list-community") {
    assertKnownKeys(source, ["id", "name", "type", "entry", "basePath"], path);
    return {
      id,
      name: readString(source.name, `${path}.name`),
      type,
      entry: readString(source.entry, `${path}.entry`),
      ...(source.basePath === undefined
        ? {}
        : { basePath: readOptionalString(source.basePath, `${path}.basePath`) }),
    };
  }
  assertKnownKeys(source, ["id", "name", "type", "path", "basePath"], path);
  return {
    id,
    name: readString(source.name, `${path}.name`),
    type,
    path: readString(source.path, `${path}.path`),
    ...(source.basePath === undefined
      ? {}
      : { basePath: readOptionalString(source.basePath, `${path}.basePath`) }),
  };
}

function parseRuleProvider(
  value: unknown,
  path: string,
  seenIds: Set<string>,
): RuleProviderV2 {
  const provider = readObject(value, path);
  assertKnownKeys(
    provider,
    ["id", "name", "output", "behavior", "enabled", "exclude", "remove", "sources"],
    path,
  );
  const sourceIds = new Set<string>();
  return {
    id: readUniqueEntityId(provider.id, `${path}.id`, seenIds, "规则提供者"),
    name: readString(provider.name, `${path}.name`),
    output: readString(provider.output, `${path}.output`),
    behavior: readEnum(provider.behavior, BEHAVIORS, `${path}.behavior`),
    ...(provider.enabled === undefined
      ? {}
      : { enabled: readOptionalBoolean(provider.enabled, `${path}.enabled`) }),
    ...(provider.exclude === undefined
      ? {}
      : { exclude: readStringArray(provider.exclude, `${path}.exclude`) }),
    ...(provider.remove === undefined
      ? {}
      : { remove: readStringArray(provider.remove, `${path}.remove`) }),
    sources: readArray(provider.sources, `${path}.sources`).map((item, index) =>
      parseProviderSource(item, `${path}.sources[${index}]`, sourceIds),
    ),
  };
}

function parseCatalog(value: unknown, path: string): VendorRepoV2["catalog"] {
  const catalog = readObject(value, path);
  assertKnownKeys(catalog, ["dir", "kind"], path);
  return {
    dir: readString(catalog.dir, `${path}.dir`),
    kind: readEnum(catalog.kind, CATALOG_KINDS, `${path}.kind`),
  };
}

function parseVendorRepo(
  value: unknown,
  path: string,
  seenIds: Set<string>,
): VendorRepoV2 {
  const repo = readObject(value, path);
  assertKnownKeys(
    repo,
    ["id", "name", "url", "path", "branch", "catalog", "templateDir"],
    path,
  );
  return {
    id: readUniqueEntityId(repo.id, `${path}.id`, seenIds, "上游仓库"),
    name: readString(repo.name, `${path}.name`),
    url: readString(repo.url, `${path}.url`),
    path: readString(repo.path, `${path}.path`),
    ...(repo.branch === undefined
      ? {}
      : { branch: readOptionalString(repo.branch, `${path}.branch`) }),
    ...(repo.catalog === undefined
      ? {}
      : { catalog: parseCatalog(repo.catalog, `${path}.catalog`) }),
    ...(repo.templateDir === undefined
      ? {}
      : { templateDir: readOptionalString(repo.templateDir, `${path}.templateDir`) }),
  };
}

function parseProjectTemplate(value: unknown, path: string): ProjectV2["template"] {
  const template = readObject(value, path);
  assertKnownKeys(template, ["output"], path);
  return {
    ...(template.output === undefined
      ? {}
      : { output: readString(template.output, `${path}.output`) }),
  };
}

function parseHealthCheckDefaults(
  value: unknown,
  path: string,
): ProxyGroupHealthCheckDefaults {
  const node = readObject(value, path);
  assertKnownKeys(node, ["url", "interval", "timeout"], path);
  return {
    ...(node.url === undefined
      ? {}
      : { url: readString(node.url, `${path}.url`) }),
    ...(node.interval === undefined
      ? {}
      : { interval: requiredNumber(node.interval, `${path}.interval`) }),
    ...(node.timeout === undefined
      ? {}
      : { timeout: requiredNumber(node.timeout, `${path}.timeout`) }),
  };
}

function parseUrlTestDefaults(value: unknown, path: string): { tolerance?: number } {
  const node = readObject(value, path);
  assertKnownKeys(node, ["tolerance"], path);
  return {
    ...(node.tolerance === undefined
      ? {}
      : { tolerance: requiredNumber(node.tolerance, `${path}.tolerance`) }),
  };
}

function parseProxyGroupDefaults(value: unknown, path: string): ProxyGroupDefaults {
  const node = readObject(value, path);
  assertKnownKeys(node, ["healthCheck", "urlTest"], path);
  const healthCheck = node.healthCheck === undefined
    ? undefined
    : parseHealthCheckDefaults(node.healthCheck, `${path}.healthCheck`);
  const urlTest = node.urlTest === undefined
    ? undefined
    : parseUrlTestDefaults(node.urlTest, `${path}.urlTest`);
  return {
    ...(healthCheck ? { healthCheck } : {}),
    ...(urlTest ? { urlTest } : {}),
  };
}

function parseRuleSetDefaults(value: unknown, path: string): RuleSetDefaults {
  const node = readObject(value, path);
  assertKnownKeys(node, ["ruleProviderInterval", "geoipNoResolve"], path);
  return {
    ...(node.ruleProviderInterval === undefined
      ? {}
      : {
          ruleProviderInterval: requiredNumber(
            node.ruleProviderInterval,
            `${path}.ruleProviderInterval`,
          ),
        }),
    ...(node.geoipNoResolve === undefined
      ? {}
      : {
          geoipNoResolve: readOptionalBoolean(
            node.geoipNoResolve,
            `${path}.geoipNoResolve`,
          ),
        }),
  };
}

function parseDefaults(value: unknown, path: string): RouteKitDefaults {
  const defaults = readObject(value, path);
  assertKnownKeys(defaults, ["proxyGroups", "ruleSets"], path);
  const proxyGroups = defaults.proxyGroups === undefined
    ? undefined
    : parseProxyGroupDefaults(defaults.proxyGroups, `${path}.proxyGroups`);
  const ruleSets = defaults.ruleSets === undefined
    ? undefined
    : parseRuleSetDefaults(defaults.ruleSets, `${path}.ruleSets`);
  return {
    ...(proxyGroups ? { proxyGroups } : {}),
    ...(ruleSets ? { ruleSets } : {}),
  };
}

function parseProject(value: unknown, path: string): ProjectV2 {
  const project = readObject(value, path);
  assertKnownKeys(project, ["template", "defaults"], path);
  return {
    ...(project.template === undefined
      ? {}
      : { template: parseProjectTemplate(project.template, `${path}.template`) }),
    ...(project.defaults === undefined
      ? {}
      : { defaults: parseDefaults(project.defaults, `${path}.defaults`) }),
  };
}

function parseMemberSets(value: unknown, path: string): Record<string, MemberSet> {
  const sets = readObject(value, path);
  const result: Record<string, MemberSet> = {};
  for (const [key, raw] of Object.entries(sets)) {
    readEntityId(key, `${path}.${key}`);
    const set = readObject(raw, `${path}.${key}`);
    assertKnownKeys(set, ["members"], `${path}.${key}`);
    result[key] = {
      members: parseMemberArray(set.members, `${path}.${key}.members`),
    };
  }
  return result;
}

function describeSchemaVersion(value: unknown): string {
  if (value === undefined) return "缺少";
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}

function parseDocument(value: unknown): AuthorProjectConfigV2 {
  const project = readObject(value, "config");
  const rawVersion: unknown = project.schemaVersion;
  if (typeof rawVersion !== "number" || !Number.isFinite(rawVersion) || rawVersion !== 2) {
    fail({
      code: "schema.version.unsupported",
      severity: "error",
      path: "config.schemaVersion",
      message: `作者配置 v2 要求 schemaVersion: 2，当前为 ${describeSchemaVersion(rawVersion)}`,
    });
  }
  assertKnownKeys(project, TOP_LEVEL_KEYS, "config");
  const groupIds = new Set<string>();
  const routeIds = new Set<string>();
  const providerIds = new Set<string>();
  const vendorRepoIds = new Set<string>();
  return {
    schemaVersion: 2,
    ...(project.project === undefined
      ? {}
      : { project: parseProject(project.project, "project") }),
    ...(project.memberSets === undefined
      ? {}
      : { memberSets: parseMemberSets(project.memberSets, "memberSets") }),
    proxyGroups: readArray(project.proxyGroups, "proxyGroups").map((item, index) =>
      parseProxyGroup(item, `proxyGroups[${index}]`, groupIds),
    ),
    routes: readArray(project.routes, "routes").map((item, index) =>
      parseRoute(item, `routes[${index}]`, routeIds),
    ),
    ruleProviders: readArray(
      project.ruleProviders,
      "ruleProviders",
    ).map((item, index) => parseRuleProvider(item, `ruleProviders[${index}]`, providerIds)),
    ...(project.vendorRepos === undefined
      ? {}
      : {
          vendorRepos: readArray(project.vendorRepos, "vendorRepos").map((item, index) =>
            parseVendorRepo(item, `vendorRepos[${index}]`, vendorRepoIds),
          ),
        }),
  };
}

/**
 * 严格解析 Schema v2 作者配置 YAML 文本。
 *
 * 只做结构与枚举校验：ID 格式与集合内唯一、判别联合恰好一个键、未知键拒绝；
 * 引用存在性、preset 环、URL nodeFilter 等跨实体语义校验属于 validate 层。
 * 结构错误抛 ConfigDiagnosticError。
 */
export function parseAuthorProjectConfigV2(text: string): AuthorProjectConfigV2 {
  let value: unknown;
  try {
    value = YAML.parse(text);
  } catch (error) {
    throw new ConfigDiagnosticError([
      {
        code: "config.yaml.invalid",
        severity: "error",
        path: "config",
        message: `YAML 解析失败：${error instanceof Error ? error.message : String(error)}`,
      },
    ]);
  }
  try {
    return parseDocument(value);
  } catch (error) {
    if (error instanceof ConfigDiagnosticError) throw error;
    throw toDiagnosticError(error);
  }
}
