import type {
  RouteKitProjectConfig,
  RuleProviderConfig,
  RuleProviderSource,
} from "@clash-route-kit/core";

function addDuplicateDiagnostics(values: string[], label: string, diagnostics: string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    if (seen.has(value)) {
      diagnostics.push(`${label}不能重复：${value}`);
      continue;
    }
    seen.add(value);
  }
}

function isConfigRuleListPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return /^config\/rules\/[^/]+\.list$/.test(normalized);
}

function isSafeRelativePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").trim();
  if (!normalized) return false;
  if (normalized.startsWith("/") || normalized.startsWith("//")) return false;
  if (/^[A-Za-z]:\//.test(normalized)) return false;
  return !normalized.split("/").includes("..");
}

function validateSourceBasePath(
  provider: RuleProviderConfig,
  source: RuleProviderSource,
  diagnostics: string[],
): void {
  if (source.basePath && !isSafeRelativePath(source.basePath)) {
    diagnostics.push(`Rule provider ${provider.name} 的 source ${source.name} basePath 不能包含绝对路径或 ..：${source.basePath}`);
  }
}

function validateSourcePath(
  provider: RuleProviderConfig,
  source: Extract<RuleProviderSource, { path: string }>,
  diagnostics: string[],
): void {
  if (!source.path.trim()) {
    diagnostics.push(`Rule provider ${provider.name} 的 source ${source.name} path 不能为空`);
    return;
  }

  const normalized = source.path.replace(/\\/g, "/");
  if (normalized.startsWith("config/rules/") && !isConfigRuleListPath(source.path)) {
    diagnostics.push(`Rule provider ${provider.name} 的 source ${source.name} 必须位于 config/rules/*.list：${source.path}`);
    return;
  }

  if (!isSafeRelativePath(source.path)) {
    diagnostics.push(`Rule provider ${provider.name} 的 source ${source.name} path 不能包含绝对路径或 ..：${source.path}`);
  }
}

function validateRuleProviderSource(
  provider: RuleProviderConfig,
  source: RuleProviderSource,
  diagnostics: string[],
): void {
  if (!source.name.trim()) {
    diagnostics.push(`Rule provider ${provider.name} 的 source 名称不能为空`);
  }
  validateSourceBasePath(provider, source, diagnostics);

  if (source.type === "clash-list" || source.type === "clash-provider") {
    validateSourcePath(provider, source, diagnostics);
    return;
  }

  if (source.type === "domain-list-community" && !source.entry.trim()) {
    diagnostics.push(`Rule provider ${provider.name} 的 source ${source.name} entry 不能为空`);
  }
}

export function validateDraftConfig(config: RouteKitProjectConfig): string[] {
  const diagnostics: string[] = [];
  const policies = new Set(config.customProxyGroups.map((group) => group.name));
  const builtInPolicies = new Set(["DIRECT", "REJECT"]);
  const providerOutputs = new Set((config.ruleProviders ?? []).map((provider) => provider.output));
  let finalRuleCount = 0;

  addDuplicateDiagnostics(config.customProxyGroups.map((group) => group.name), "custom_proxy_group 名称", diagnostics);
  addDuplicateDiagnostics(config.ruleSets.map((ruleSet) => ruleSet.id), "RuleSet ID ", diagnostics);
  addDuplicateDiagnostics((config.ruleProviders ?? []).map((provider) => provider.name), "Rule provider 名称", diagnostics);
  addDuplicateDiagnostics((config.ruleProviders ?? []).map((provider) => provider.output), "Rule provider 输出", diagnostics);

  for (const group of config.customProxyGroups) {
    if (!group.name.trim()) {
      diagnostics.push("custom_proxy_group 名称不能为空");
    }
    if (group.options.length === 0 && (group.nodeFilters ?? []).length === 0) {
      diagnostics.push(`custom_proxy_group ${group.name} 至少需要一个 option 或 node filter`);
    }
  }

  for (const ruleSet of config.ruleSets) {
    if (ruleSet.enabled !== false && ruleSet.source.type === "final") {
      finalRuleCount += 1;
    }
    if (!ruleSet.id.trim()) {
      diagnostics.push("RuleSet ID 不能为空");
    }
    if (!ruleSet.policy.trim()) {
      diagnostics.push(`RuleSet ${ruleSet.id} 的目标 custom_proxy_group 不能为空`);
    }
    if (ruleSet.policy.trim() && !policies.has(ruleSet.policy) && !builtInPolicies.has(ruleSet.policy)) {
      diagnostics.push(`RuleSet ${ruleSet.id} 引用了不存在的 custom_proxy_group：${ruleSet.policy}`);
    }

    const source = ruleSet.source;
    if (source.type === "rule-provider") {
      if (!source.file.trim()) {
        diagnostics.push(`RuleSet ${ruleSet.id} 的 provider 文件不能为空`);
      } else if (!providerOutputs.has(source.file)) {
        diagnostics.push(`RuleSet ${ruleSet.id} 引用了不存在的 provider 输出：${source.file}`);
      }
    } else if (source.type === "geosite") {
      if (!source.value.trim()) {
        diagnostics.push(`RuleSet ${ruleSet.id} 的 GEOSITE 不能为空`);
      }
    } else if (source.type === "geoip") {
      if (!source.value.trim()) {
        diagnostics.push(`RuleSet ${ruleSet.id} 的 GEOIP 不能为空`);
      }
    }
  }

  if (finalRuleCount === 0) {
    diagnostics.push("ruleSets 需要包含一条 FINAL 兜底规则");
  } else if (finalRuleCount > 1) {
    diagnostics.push("FINAL 兜底规则只能出现一次");
  }

  for (const provider of config.ruleProviders ?? []) {
    if (!provider.name.trim()) {
      diagnostics.push("Rule provider 名称不能为空");
    }
    if (!provider.output.trim()) {
      diagnostics.push(`Rule provider ${provider.name} 输出不能为空`);
    }
    if (provider.sources.length === 0) {
      diagnostics.push(`Rule provider ${provider.name} 至少需要一个 source`);
    }
    for (const source of provider.sources) {
      validateRuleProviderSource(provider, source, diagnostics);
    }
  }

  return diagnostics;
}
