import { appendDefaultValueDiagnostics } from "../defaults.js";
import type { DependencyGraph } from "../routing/dependencyGraph.js";
import { findDependencyCycles } from "../routing/dependencyGraph.js";
import type {
  CustomProxyGroup,
  RouteKitProjectConfig,
  RuleProviderConfig,
  RuleProviderSource,
} from "../types.js";
import type { Diagnostic } from "./diagnostics.js";

const BUILTIN_POLICIES = new Set(["DIRECT", "REJECT"]);

export function createLegacyProxyGroupGraph(
  groups: readonly CustomProxyGroup[],
): DependencyGraph {
  const names = new Set(groups.map((group) => group.name));
  return Object.fromEntries(groups.map((group) => [
    group.name,
    group.options.filter((option) => names.has(option)),
  ]));
}

function addDuplicateDiagnostics(
  values: readonly string[],
  code: string,
  path: string,
  diagnostics: Diagnostic[],
): void {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) {
      diagnostics.push({
        code,
        severity: "error",
        path: `${path}[${index}]`,
        message: `重复值：${value}`,
        related: [value],
      });
    }
    seen.add(value);
  }
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function isValidRegExp(value: string): boolean {
  try {
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
}

function providerEnabled(provider: RuleProviderConfig): boolean {
  return provider.enabled !== false;
}

function validateProviderSource(
  provider: RuleProviderConfig,
  source: RuleProviderSource,
  providerIndex: number,
  sourceIndex: number,
  severity: Diagnostic["severity"],
  diagnostics: Diagnostic[],
): void {
  const base = `ruleProviders[${providerIndex}].sources[${sourceIndex}]`;
  if (!source.name.trim()) {
    diagnostics.push({
      code: "provider.source.name-empty",
      severity,
      path: `${base}.name`,
      message: `Rule provider ${provider.name} 的 source 名称不能为空`,
    });
  }
  const pathValue = source.type === "domain-list-community"
    ? source.entry
    : source.path;
  if (!pathValue.trim()) {
    diagnostics.push({
      code: "provider.source.value-empty",
      severity,
      path: source.type === "domain-list-community"
        ? `${base}.entry`
        : `${base}.path`,
      message: `Rule provider ${provider.name} 的 source 值不能为空`,
    });
  }
  for (const [key, value] of [
    ["basePath", source.basePath],
    ["value", pathValue],
  ] as const) {
    if (!value) continue;
    const normalized = value.replace(/\\/g, "/");
    if (
      normalized.startsWith("/")
      || /^[A-Za-z]:\//.test(normalized)
      || normalized.split("/").includes("..")
    ) {
      diagnostics.push({
        code: "provider.source.path-unsafe",
        severity,
        path: `${base}.${key}`,
        message: "source 路径必须是项目内安全相对路径",
      });
    }
  }
}

function validateGroup(
  group: CustomProxyGroup,
  index: number,
  groupNames: ReadonlySet<string>,
  diagnostics: Diagnostic[],
): void {
  const base = `customProxyGroups[${index}]`;
  if (!group.name.trim()) {
    diagnostics.push({
      code: "group.name.empty",
      severity: "error",
      path: `${base}.name`,
      message: "custom_proxy_group 名称不能为空",
    });
  }
  const filters = group.nodeFilters ?? [];
  if (group.options.length === 0 && !filters.some((filter) => filter.trim())) {
    diagnostics.push({
      code: "group.members.empty",
      severity: "error",
      path: base,
      message: `custom_proxy_group ${group.name} 至少需要一个 option 或 node filter`,
    });
  }
  for (const [optionIndex, option] of group.options.entries()) {
    if (groupNames.has(option) || BUILTIN_POLICIES.has(option)) continue;
    diagnostics.push({
      code: "group.member.missing",
      severity: "error",
      path: `${base}.options[${optionIndex}]`,
      message: `custom_proxy_group ${group.name} 引用了不存在的成员：${option}`,
      related: [option],
    });
  }
  for (const [filterIndex, filter] of filters.entries()) {
    const path = `${base}.nodeFilters[${filterIndex}]`;
    if (!filter.trim()) {
      diagnostics.push({
        code: "group.node-filter.empty",
        severity: "error",
        path,
        message: `策略组 ${group.name} 的 node filter 不能为空`,
      });
      continue;
    }
    if (isHttpUrl(filter)) {
      diagnostics.push({
        code: "group.node-filter.url",
        severity: "error",
        path,
        message: `策略组 ${group.name} 的 node filter 不能是 HTTP/HTTPS URL`,
        related: [filter],
      });
      continue;
    }
    if (!isValidRegExp(filter)) {
      diagnostics.push({
        code: "group.node-filter.regex",
        severity: "error",
        path,
        message: `策略组 ${group.name} 的 node filter 不是有效正则表达式`,
        related: [filter],
      });
    }
  }
}

function validateProvider(
  provider: RuleProviderConfig,
  index: number,
  diagnostics: Diagnostic[],
): void {
  const base = `ruleProviders[${index}]`;
  const enabled = providerEnabled(provider);
  if (!provider.name.trim()) {
    diagnostics.push({
      code: "provider.name.empty",
      severity: "error",
      path: `${base}.name`,
      message: "Rule provider 名称不能为空",
    });
  }
  // Disabled placeholders are intentionally allowed to remain incomplete. An
  // empty output is still covered by the disabled non-YAML warning below, but
  // must not add the enabled-provider blocking diagnostic.
  if (enabled && !provider.output.trim()) {
    diagnostics.push({
      code: "provider.output.empty",
      severity: "error",
      path: `${base}.output`,
      message: `Rule provider ${provider.name} 输出不能为空`,
    });
  }

  if (provider.sources.length === 0) {
    diagnostics.push({
      code: enabled
        ? "provider.sources.empty"
        : "provider.sources.disabled-empty",
      severity: enabled ? "error" : "warning",
      path: `${base}.sources`,
      message: enabled
        ? `启用的规则源 ${provider.name} 至少需要一个数据源`
        : `禁用的规则源 ${provider.name} 尚未指定数据源`,
    });
  }
  if (!/\.yaml$/i.test(provider.output)) {
    diagnostics.push({
      code: enabled
        ? "provider.output.unsupported"
        : "provider.output.disabled-unsupported",
      severity: enabled ? "error" : "warning",
      path: `${base}.output`,
      message: `当前只支持 .yaml provider 输出：${provider.output}`,
    });
  }
  for (const [sourceIndex, source] of provider.sources.entries()) {
    validateProviderSource(
      provider,
      source,
      index,
      sourceIndex,
      enabled ? "error" : "warning",
      diagnostics,
    );
  }
}

export function validateLegacyProjectConfig(
  config: RouteKitProjectConfig,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  appendDefaultValueDiagnostics(config, diagnostics);

  const providers = config.ruleProviders ?? [];
  addDuplicateDiagnostics(
    config.customProxyGroups.map((group) => group.name),
    "group.name.duplicate",
    "customProxyGroups",
    diagnostics,
  );
  addDuplicateDiagnostics(
    config.ruleSets.map((ruleSet) => ruleSet.id),
    "route.id.duplicate",
    "ruleSets",
    diagnostics,
  );
  addDuplicateDiagnostics(
    providers.map((provider) => provider.name),
    "provider.name.duplicate",
    "ruleProviders",
    diagnostics,
  );
  addDuplicateDiagnostics(
    providers.map((provider) => provider.output),
    "provider.output.duplicate",
    "ruleProviders",
    diagnostics,
  );

  const groupNames = new Set(
    config.customProxyGroups.map((group) => group.name),
  );
  for (const [index, group] of config.customProxyGroups.entries()) {
    validateGroup(group, index, groupNames, diagnostics);
  }

  for (const cycle of findDependencyCycles(
    createLegacyProxyGroupGraph(config.customProxyGroups),
  )) {
    diagnostics.push({
      code: "group.cycle",
      severity: "error",
      path: "customProxyGroups",
      message: `custom_proxy_group 存在循环引用：${cycle.join(" -> ")}`,
      related: cycle,
    });
  }

  for (const [index, provider] of providers.entries()) {
    validateProvider(provider, index, diagnostics);
  }

  const enabledFinalRuleIds: string[] = [];
  for (const [index, ruleSet] of config.ruleSets.entries()) {
    const base = `ruleSets[${index}]`;
    const referenceSeverity = ruleSet.enabled === false ? "warning" : "error";
    if (!ruleSet.id.trim()) {
      diagnostics.push({
        code: "route.id.empty",
        severity: "error",
        path: `${base}.id`,
        message: "RuleSet ID 不能为空",
      });
    }
    if (!ruleSet.policy.trim()) {
      diagnostics.push({
        code: "route.policy.empty",
        severity: referenceSeverity,
        path: `${base}.policy`,
        message: `RuleSet ${ruleSet.id} 的目标 custom_proxy_group 不能为空`,
      });
    } else if (
      !groupNames.has(ruleSet.policy)
      && !BUILTIN_POLICIES.has(ruleSet.policy)
    ) {
      diagnostics.push({
        code: "route.policy.missing",
        severity: referenceSeverity,
        path: `${base}.policy`,
        message: `RuleSet ${ruleSet.id} 引用了不存在的 custom_proxy_group：${ruleSet.policy}`,
        related: [ruleSet.policy],
      });
    }

    const source = ruleSet.source;
    if (source.type === "geosite" && !source.value.trim()) {
      diagnostics.push({
        code: "route.geosite.empty",
        severity: referenceSeverity,
        path: `${base}.source.value`,
        message: `RuleSet ${ruleSet.id} 的 GEOSITE 不能为空`,
      });
    } else if (source.type === "geoip" && !source.value.trim()) {
      diagnostics.push({
        code: "route.geoip.empty",
        severity: referenceSeverity,
        path: `${base}.source.value`,
        message: `RuleSet ${ruleSet.id} 的 GEOIP 不能为空`,
      });
    }

    if (source.type === "final") {
      if (ruleSet.enabled === false) continue;
      enabledFinalRuleIds.push(ruleSet.id);
      continue;
    }
    if (source.type !== "rule-provider") continue;

    if (!source.file.trim()) {
      diagnostics.push({
        code: "route.provider.missing",
        severity: referenceSeverity,
        path: `${base}.source.file`,
        message: `RuleSet ${ruleSet.id} 的 provider 文件不能为空`,
        related: [source.file],
      });
      continue;
    }

    const provider = providers.find((candidate) => candidate.output === source.file);
    if (!provider) {
      diagnostics.push({
        code: "route.provider.missing",
        severity: referenceSeverity,
        path: `${base}.source.file`,
        message: `RuleSet ${ruleSet.id} 引用了不存在的 provider 输出：${source.file}`,
        related: [source.file],
      });
      continue;
    }
    if (ruleSet.enabled === false) continue;
    if (!providerEnabled(provider)) {
      diagnostics.push({
        code: "route.provider.disabled",
        severity: "error",
        path: `${base}.source.file`,
        message: `RuleSet ${ruleSet.id} 引用了禁用的 provider：${source.file}`,
        related: [source.file],
      });
      continue;
    }
    if (provider.behavior !== source.behavior) {
      diagnostics.push({
        code: "route.provider.behavior-mismatch",
        severity: "error",
        path: `${base}.source.behavior`,
        message: `RuleSet ${ruleSet.id} 的 behavior 与 provider ${provider.name} 不一致`,
        related: [source.file],
      });
    }
  }

  if (enabledFinalRuleIds.length === 0) {
    diagnostics.push({
      code: "route.final.missing",
      severity: "error",
      path: "ruleSets",
      message: "ruleSets 需要包含一条 FINAL 兜底规则",
    });
  } else if (enabledFinalRuleIds.length > 1) {
    diagnostics.push({
      code: "route.final.multiple",
      severity: "error",
      path: "ruleSets",
      message: "FINAL 兜底规则只能出现一次",
      related: enabledFinalRuleIds,
    });
  }

  return diagnostics;
}
