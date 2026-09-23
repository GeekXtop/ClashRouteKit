/**
 * SubConverter INI 模板导入：直接产出 Schema v2 形状（不再经 v1 中间态与迁移器）。
 *
 * 语义（与迁移器删除前的 v1 INI 导入行为对齐）：
 * - 策略组：稳定 ID（slug 或 group-N，全局分配器跨 proxyGroups/memberSets/
 *   ruleProviders/routes 查重）；选项 → 类型化成员（DIRECT/REJECT → builtin、
 *   显示名 → 组引用、其余剔除 + warning）；重复成员提取为 memberSets；
 *   健康检查 url/interval/timeout/tolerance 原样透传。
 * - 路由：policy 显示名 → 组 ID（找不到则保留悬空引用 + warning，由 v2 校验拦截）；
 *   GEOSITE/GEOIP/FINAL 直映射；clash-* 规则源 → 占位 rule-provider
 *   （enabled: false、空 sources，output 为 basename，待规则库绑定数据源）。
 * - `.mrs` 引用是上游编译产物，basename 仅作关联键：按同 stem 归一为 `.yaml`
 *   并记 warning（数据源需绑定 vendor 内上游同发布的 yaml）。
 * - per-route interval 与 v2 模型不兼容：非默认值时丢弃并 warning。
 * - 不可表达事实一律 warnings 记录，不静默丢弃；阻断交给 v2 保存校验链。
 */
import type { ProviderBehavior } from "./types.js";
import {
  BUILTIN_POLICIES,
  cloneTypedMembers,
  createGlobalIdAllocator,
  extractMemberSets,
  providerNameFromOutput,
  slugifyName,
  toTypedMembers,
} from "./config/schemaV2/importConstruction.js";
import { LEGACY_RULE_PROVIDER_INTERVAL } from "./defaults.js";
import type { MemberSet, ProxyGroupV2, RouteSourceV2, RouteV2, RuleProviderV2, TypedMember } from "./config/schemaV2/types.js";

export interface ImportedConfig {
  memberSets: Record<string, MemberSet>;
  proxyGroups: ProxyGroupV2[];
  routes: RouteV2[];
  /** 悬空占位 rule-provider（enabled: false、空 sources），待规则库补全数据源。 */
  placeholderProviders: RuleProviderV2[];
  warnings: string[];
}

function basename(url: string): string {
  const noQuery = url.split(/[?#]/)[0];
  const segments = noQuery.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? noQuery;
}

type ParsedSource =
  | { kind: "geosite"; value: string }
  | { kind: "geoip"; value: string; noResolve: boolean }
  | { kind: "final" }
  | { kind: "provider"; behavior: ProviderBehavior; file: string; interval: number };

function parseRulesetSource(rest: string): { source: ParsedSource; warning?: string } | { warning: string } {
  if (rest.startsWith("[]GEOSITE,")) {
    return { source: { kind: "geosite", value: rest.slice("[]GEOSITE,".length).trim() } };
  }
  if (rest.startsWith("[]GEOIP,")) {
    const parts = rest.slice("[]GEOIP,".length).split(",").map((part) => part.trim());
    return {
      source: { kind: "geoip", value: parts[0], noResolve: parts.includes("no-resolve") },
    };
  }
  if (rest === "[]FINAL") {
    return { source: { kind: "final" } };
  }
  const provider = /^clash-(domain|classic|ipcidr):(.+),(\d+)\s*$/.exec(rest);
  if (provider) {
    const behavior =
      provider[1] === "domain" ? "domain" : provider[1] === "classic" ? "classical" : "ipcidr";
    let file = basename(provider[2]);
    let warning: string | undefined;
    if (file.toLowerCase().endsWith(".mrs")) {
      // .mrs 是上游编译产物，file 只是关联键（数据来自 config 声明的 vendor 源），
      // 按同 stem 归一为 .yaml 键；对不上 provider 时走禁用占位路径。
      file = `${file.slice(0, -4)}.yaml`;
      warning = `ruleset 引用为编译产物 .mrs：${file.replace(/\.yaml$/, ".mrs")}，` +
        "已按同 stem 归一为 .yaml 关联键，请为其绑定 vendor 内上游同发布的 yaml 数据源";
    }
    return {
      source: { kind: "provider", behavior, file, interval: Number(provider[3]) },
      ...(warning === undefined ? {} : { warning }),
    };
  }
  return { warning: `无法识别的 ruleset 源：${rest}` };
}

const GROUP_TYPES = new Set(["select", "url-test", "fallback", "load-balance"]);

interface RawGroup {
  name: string;
  type: ProxyGroupV2["type"];
  options: string[];
  nodeFilters: string[];
  url?: string;
  interval?: number;
  timeout?: number | null;
  tolerance?: number | null;
}

function parseProxyGroupLine(body: string, warnings: string[]): RawGroup | null {
  const parts = body.split("`");
  if (parts.length < 2) {
    warnings.push(`策略组格式不全：${body}`);
    return null;
  }
  const [name, type, ...rest] = parts;
  if (!GROUP_TYPES.has(type)) {
    warnings.push(`未知策略组类型：${type}`);
    return null;
  }
  const groupType = type as RawGroup["type"];

  let url: string | undefined;
  let interval: number | undefined;
  let timeout: number | null | undefined;
  let tolerance: number | null | undefined;
  let refsAndFilters = rest;
  if (groupType !== "select" && rest.length >= 2) {
    const intervalSpec = rest[rest.length - 1];
    url = rest[rest.length - 2];
    refsAndFilters = rest.slice(0, rest.length - 2);
    const segments = intervalSpec.split(",");
    timeout = null;
    tolerance = null;
    const parsedInterval = Number(segments[0]);
    if (!Number.isNaN(parsedInterval)) interval = parsedInterval;
    if (segments[1] !== undefined && segments[1] !== "") {
      const parsedTimeout = Number(segments[1]);
      if (!Number.isNaN(parsedTimeout)) timeout = parsedTimeout;
    }
    if (segments[2] !== undefined && segments[2] !== "") {
      const parsedTolerance = Number(segments[2]);
      if (!Number.isNaN(parsedTolerance)) tolerance = parsedTolerance;
    }
  }

  const options: string[] = [];
  const nodeFilters: string[] = [];
  for (const item of refsAndFilters) {
    if (item.startsWith("[]")) options.push(item.slice(2));
    else nodeFilters.push(item);
  }

  const group: RawGroup = { name, type: groupType, options, nodeFilters };
  if (nodeFilters.length > 0) {
    for (const filter of nodeFilters) {
      if (/^https?:\/\//i.test(filter)) {
        warnings.push(
          `策略组 ${name} 的节点过滤器是 HTTP/HTTPS URL（健康检查 URL 应放在组 url 字段），` +
            "已原样保留，v2 保存校验将报错",
        );
      }
    }
  }
  if (url) group.url = url;
  if (interval !== undefined) group.interval = interval;
  if (timeout !== undefined) group.timeout = timeout;
  if (tolerance !== undefined) group.tolerance = tolerance;
  return group;
}

export function parseIniToConfig(
  ini: string,
  existingProviders?: ReadonlyMap<string, { id: string; behavior: ProviderBehavior }>,
): ImportedConfig {
  const warnings: string[] = [];
  const rawGroups: RawGroup[] = [];
  const rawRules: { policy: string; source: ParsedSource; section?: string }[] = [];
  let currentSection: string | undefined;

  for (const rawLine of ini.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith(";") || line.startsWith("#")) {
      const text = line.replace(/^[;#]\s*/, "").trim();
      if (text && !/^Generated by/i.test(text)) currentSection = text;
      continue;
    }
    if (line.startsWith("[") && line.endsWith("]")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1);

    if (key === "ruleset") {
      const comma = value.indexOf(",");
      if (comma === -1) {
        warnings.push(`ruleset 缺少策略：${value}`);
        continue;
      }
      const policy = value.slice(0, comma).trim();
      const parsed = parseRulesetSource(value.slice(comma + 1).trim());
      if ("warning" in parsed && !("source" in parsed)) {
        warnings.push(parsed.warning);
        continue;
      }
      if (parsed.warning !== undefined) warnings.push(parsed.warning);
      rawRules.push({
        policy,
        source: (parsed as { source: ParsedSource }).source,
        ...(currentSection === undefined ? {} : { section: currentSection }),
      });
      currentSection = undefined;
    } else if (key === "custom_proxy_group") {
      const group = parseProxyGroupLine(value, warnings);
      if (group) rawGroups.push(group);
    }
  }

  // ID 分配顺序固定：proxyGroups → memberSets → ruleProviders → routes。
  const allocateId = createGlobalIdAllocator();
  const groupIds = rawGroups.map((group, index) =>
    allocateId(slugifyName(group.name) || `group-${index + 1}`),
  );
  const nameToId = new Map<string, string>();
  rawGroups.forEach((group, index) => {
    // 同名组以先出现者为准（INI 以显示名充当关系键）。
    if (!nameToId.has(group.name)) nameToId.set(group.name, groupIds[index]);
  });

  const typedMembersByGroup: TypedMember[][] = rawGroups.map((group, index) =>
    toTypedMembers(group.options, index, nameToId, warnings),
  );
  const { memberSets, setIdByGroupIndex } = extractMemberSets(typedMembersByGroup, allocateId);

  const proxyGroups: ProxyGroupV2[] = rawGroups.map((group, index) => {
    const setId = setIdByGroupIndex.get(index);
    const members = setId === undefined
      ? cloneTypedMembers(typedMembersByGroup[index])
      : [{ preset: setId }];
    return {
      id: groupIds[index],
      name: group.name,
      type: group.type,
      members,
      ...(group.nodeFilters.length === 0
        ? {}
        : { nodeFilters: group.nodeFilters.map((match) => ({ match })) }),
      ...(group.url === undefined ? {} : { url: group.url }),
      ...(group.interval === undefined ? {} : { interval: group.interval }),
      ...(group.timeout === undefined ? {} : { timeout: group.timeout }),
      ...(group.tolerance === undefined ? {} : { tolerance: group.tolerance }),
    };
  });

  // 占位 rule-provider：按 output 文件名去重，同一 file 的多条路由共享一个 provider。
  // existingProviders（output → 既有 v2 provider id/behavior）命中时不新建占位、
  // 直接引用既有 provider（behavior 冲突时以既有 provider 为准并 warning）。
  const providerRefByFile = new Map<
    string,
    { id: string; behavior: ProviderBehavior; placeholder: boolean }
  >();
  let providerCounter = 0;
  for (const rule of rawRules) {
    if (rule.source.kind !== "provider") continue;
    const { file, behavior } = rule.source;
    if (providerRefByFile.has(file)) continue;
    const existing = existingProviders?.get(file);
    if (existing !== undefined) {
      if (existing.behavior !== behavior) {
        warnings.push(
          `ruleset 声明 behavior "${behavior}"，与既有 rule-provider "${existing.id}" 的 ` +
            `"${existing.behavior}" 不一致；渲染以 provider 声明为准`,
        );
      }
      providerRefByFile.set(file, {
        id: existing.id,
        behavior: existing.behavior,
        placeholder: false,
      });
      continue;
    }
    providerCounter += 1;
    const stem = file.replace(/\.[^.]+$/, "");
    const id = allocateId(slugifyName(stem) || `provider-${providerCounter}`);
    providerRefByFile.set(file, { id, behavior, placeholder: true });
  }
  const placeholderProviders: RuleProviderV2[] = [...providerRefByFile.entries()]
    .filter(([, ref]) => ref.placeholder)
    .map(([file, ref]) => ({
      id: ref.id,
      name: providerNameFromOutput(file),
      output: file,
      behavior: ref.behavior,
      enabled: false,
      sources: [],
    }),
  );

  const routes: RouteV2[] = rawRules.map((rule, index) => {
    let policy: RouteV2["policy"];
    if (BUILTIN_POLICIES.has(rule.policy)) {
      policy = { builtin: rule.policy as "DIRECT" | "REJECT" };
    } else {
      const groupId = nameToId.get(rule.policy);
      if (groupId !== undefined) {
        policy = { group: groupId };
      } else {
        warnings.push(
          `routes[${index}].policy：策略 "${rule.policy}" 不匹配任何策略组显示名，` +
            "已保留为悬空组引用，v2 保存校验将报错",
        );
        policy = { group: slugifyName(rule.policy) || "missing-policy" };
      }
    }

    let source: RouteSourceV2;
    const parsedSource = rule.source;
    if (parsedSource.kind === "geosite") {
      source = { type: "geosite", value: parsedSource.value };
    } else if (parsedSource.kind === "geoip") {
      source = {
        type: "geoip",
        value: parsedSource.value,
        ...(parsedSource.noResolve ? { noResolve: true } : {}),
      };
    } else if (parsedSource.kind === "final") {
      source = { type: "final" };
    } else {
      if (parsedSource.interval !== LEGACY_RULE_PROVIDER_INTERVAL) {
        warnings.push(
          `routes[${index}].source：per-route interval ${parsedSource.interval} 与生效默认值 ` +
            `${LEGACY_RULE_PROVIDER_INTERVAL} 不同；v2 路由源不支持 per-route interval，已丢弃`,
        );
      }
      source = {
        type: "rule-provider",
        provider: providerRefByFile.get(parsedSource.file)!.id,
      };
    }

    const base =
      parsedSource.kind === "geosite"
        ? parsedSource.value
        : parsedSource.kind === "geoip"
          ? `geoip-${parsedSource.value}`
          : parsedSource.kind === "provider"
            ? parsedSource.file.replace(/\.[^.]+$/, "")
            : "final";

    return {
      id: allocateId(slugifyName(base) || `route-${index + 1}`),
      policy,
      source,
      ...(rule.section === undefined ? {} : { section: rule.section }),
    };
  });

  return { memberSets, proxyGroups, routes, placeholderProviders, warnings };
}
