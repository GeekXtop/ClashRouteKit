import type {
  CustomProxyGroup,
  ImportedConfig,
  RouteKitProjectConfig,
  RuleProviderConfig,
  RuleProviderSource,
  RuleSet,
  RuleSetSource,
} from "@clash-route-kit/core";
export { addVendorRepo } from "@clash-route-kit/core";

type CustomProxyGroupListField = "options" | "nodeFilters";
type RuleProviderListField = "exclude" | "remove";

function normalizeList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function nextName(existing: string[], baseName: string): string {
  const names = new Set(existing);
  if (!names.has(baseName)) return baseName;

  let suffix = 2;
  while (names.has(`${baseName}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseName}-${suffix}`;
}

function cloneRuleSetSource(source: RuleSetSource): RuleSetSource {
  return { ...source };
}

function cloneRuleSet(ruleSet: RuleSet): RuleSet {
  return {
    ...ruleSet,
    source: cloneRuleSetSource(ruleSet.source),
  };
}

function createRuleSetSource(sourceType: RuleSetSource["type"]): RuleSetSource {
  if (sourceType === "rule-provider") {
    return { type: "rule-provider", behavior: "domain", file: "" };
  }
  if (sourceType === "geosite") {
    return { type: "geosite", value: "" };
  }
  if (sourceType === "geoip") {
    return { type: "geoip", value: "", noResolve: true };
  }
  return { type: "final" };
}

export function createRuleSet(
  config: RouteKitProjectConfig,
  options: { sourceType: RuleSetSource["type"] },
): RuleSet {
  return {
    id: nextName(config.ruleSets.map((ruleSet) => ruleSet.id), "ruleset"),
    policy: config.customProxyGroups[0]?.name ?? "DIRECT",
    source: createRuleSetSource(options.sourceType),
  };
}

export function addRuleSet(config: RouteKitProjectConfig, ruleSet: RuleSet): RouteKitProjectConfig {
  const id = ruleSet.id.trim();
  if (!id) {
    throw new Error("RuleSet id is required");
  }
  if (config.ruleSets.some((item) => item.id === id)) {
    throw new Error(`RuleSet "${id}" already exists`);
  }

  const finalIndex = config.ruleSets.findIndex((item) => item.source.type === "final");
  const insertIndex = ruleSet.source.type === "final" || finalIndex === -1 ? config.ruleSets.length : finalIndex;

  return {
    ...config,
    ruleSets: [
      ...config.ruleSets.slice(0, insertIndex),
      cloneRuleSet({ ...ruleSet, id }),
      ...config.ruleSets.slice(insertIndex),
    ],
  };
}

export function updateRuleSet(
  config: RouteKitProjectConfig,
  ruleSetId: string,
  patch: Partial<RuleSet>,
): RouteKitProjectConfig {
  let found = false;
  const ruleSets = config.ruleSets.map((ruleSet) => {
    if (ruleSet.id !== ruleSetId) return ruleSet;
    found = true;
    return cloneRuleSet({ ...ruleSet, ...patch });
  });

  return found ? { ...config, ruleSets } : config;
}

export function toggleRuleSet(config: RouteKitProjectConfig, ruleSetId: string): RouteKitProjectConfig {
  const ruleSet = config.ruleSets.find((item) => item.id === ruleSetId);
  if (!ruleSet) return config;
  return updateRuleSet(config, ruleSetId, { enabled: ruleSet.enabled === false });
}

export function deleteRuleSet(config: RouteKitProjectConfig, ruleSetId: string): RouteKitProjectConfig {
  if (!config.ruleSets.some((ruleSet) => ruleSet.id === ruleSetId)) return config;
  return {
    ...config,
    ruleSets: config.ruleSets.filter((ruleSet) => ruleSet.id !== ruleSetId),
  };
}

function cloneCustomProxyGroup(group: CustomProxyGroup): CustomProxyGroup {
  return {
    ...group,
    options: [...group.options],
    nodeFilters: group.nodeFilters ? [...group.nodeFilters] : undefined,
  };
}

export function createCustomProxyGroup(config: RouteKitProjectConfig): CustomProxyGroup {
  return {
    name: nextName(config.customProxyGroups.map((group) => group.name), "ProxyGroup"),
    type: "select",
    options: ["DIRECT"],
  };
}

export function addCustomProxyGroup(
  config: RouteKitProjectConfig,
  group: CustomProxyGroup,
): RouteKitProjectConfig {
  const name = group.name.trim();
  if (!name) {
    throw new Error("custom_proxy_group name is required");
  }
  if (config.customProxyGroups.some((item) => item.name === name)) {
    throw new Error(`custom_proxy_group "${name}" already exists`);
  }

  return {
    ...config,
    customProxyGroups: [...config.customProxyGroups, cloneCustomProxyGroup({ ...group, name })],
  };
}

export function updateCustomProxyGroup(
  config: RouteKitProjectConfig,
  groupName: string,
  patch: Partial<CustomProxyGroup>,
): RouteKitProjectConfig {
  let found = false;
  const customProxyGroups = config.customProxyGroups.map((group) => {
    if (group.name !== groupName) return group;
    found = true;
    return cloneCustomProxyGroup({ ...group, ...patch, name: patch.name ?? group.name });
  });

  return found ? { ...config, customProxyGroups } : config;
}

export function renameCustomProxyGroup(
  config: RouteKitProjectConfig,
  groupName: string,
  nextGroupName: string,
): RouteKitProjectConfig {
  const name = nextGroupName.trim();
  if (!name) {
    throw new Error("custom_proxy_group name is required");
  }
  if (name !== groupName && config.customProxyGroups.some((group) => group.name === name)) {
    throw new Error(`custom_proxy_group "${name}" already exists`);
  }

  return {
    ...config,
    customProxyGroups: config.customProxyGroups.map((group) =>
      group.name === groupName ? cloneCustomProxyGroup({ ...group, name }) : group,
    ),
    ruleSets: config.ruleSets.map((ruleSet) =>
      ruleSet.policy === groupName ? { ...ruleSet, policy: name } : ruleSet,
    ),
  };
}

export function deleteCustomProxyGroup(
  config: RouteKitProjectConfig,
  groupName: string,
): RouteKitProjectConfig {
  const referenced = config.ruleSets.some((ruleSet) => ruleSet.policy === groupName);
  if (referenced) {
    throw new Error(`custom_proxy_group is still referenced: ${groupName}`);
  }

  return {
    ...config,
    customProxyGroups: config.customProxyGroups.filter((group) => group.name !== groupName),
  };
}

export function setCustomProxyGroupListField(
  config: RouteKitProjectConfig,
  groupName: string,
  field: CustomProxyGroupListField,
  values: string[],
): RouteKitProjectConfig {
  return updateCustomProxyGroup(config, groupName, {
    [field]: normalizeList(values),
  });
}

function cloneRuleProviderSources(sources: RuleProviderSource[]): RuleProviderSource[] {
  return sources.map((source) => ({ ...source }));
}

function cloneRuleProvider(provider: RuleProviderConfig): RuleProviderConfig {
  return {
    ...provider,
    exclude: provider.exclude ? [...provider.exclude] : undefined,
    remove: provider.remove ? [...provider.remove] : undefined,
    sources: cloneRuleProviderSources(provider.sources),
  };
}

export function createRuleProvider(config: RouteKitProjectConfig): RuleProviderConfig {
  const name = nextName((config.ruleProviders ?? []).map((provider) => provider.name), "Provider");
  return {
    name,
    output: `${name}_Domain.yaml`,
    behavior: "domain",
    sources: [],
  };
}

export function addRuleProvider(
  config: RouteKitProjectConfig,
  provider: RuleProviderConfig,
): RouteKitProjectConfig {
  const name = provider.name.trim();
  const output = provider.output.trim();
  if (!name) {
    throw new Error("Rule provider name is required");
  }
  if (!output) {
    throw new Error("Rule provider output is required");
  }

  const providers = config.ruleProviders ?? [];
  if (providers.some((item) => item.name === name)) {
    throw new Error(`Rule provider "${name}" already exists`);
  }
  if (providers.some((item) => item.output === output)) {
    throw new Error(`Rule provider output already exists: ${output}`);
  }

  return {
    ...config,
    ruleProviders: [...providers, cloneRuleProvider({ ...provider, name, output })],
  };
}

export function updateRuleProvider(
  config: RouteKitProjectConfig,
  providerName: string,
  patch: Partial<RuleProviderConfig>,
): RouteKitProjectConfig {
  let found = false;
  const ruleProviders = (config.ruleProviders ?? []).map((provider) => {
    if (provider.name !== providerName) return provider;
    found = true;
    return cloneRuleProvider({ ...provider, ...patch });
  });

  return found ? { ...config, ruleProviders } : config;
}

export function deleteRuleProvider(config: RouteKitProjectConfig, providerName: string): RouteKitProjectConfig {
  return {
    ...config,
    ruleProviders: (config.ruleProviders ?? []).filter((provider) => provider.name !== providerName),
  };
}

export function setRuleProviderSources(
  config: RouteKitProjectConfig,
  providerName: string,
  sources: RuleProviderSource[],
): RouteKitProjectConfig {
  return updateRuleProvider(config, providerName, {
    sources: cloneRuleProviderSources(sources),
  });
}

export function setRuleProviderListField(
  config: RouteKitProjectConfig,
  providerName: string,
  field: RuleProviderListField,
  values: string[],
): RouteKitProjectConfig {
  return updateRuleProvider(config, providerName, {
    [field]: normalizeList(values),
  });
}

export function reorderRuleSets(
  config: RouteKitProjectConfig,
  orderedIds: string[],
): RouteKitProjectConfig {
  const byId = new Map(config.ruleSets.map((ruleSet) => [ruleSet.id, ruleSet]));
  const seen = new Set<string>();
  const ordered: RuleSet[] = [];
  for (const id of orderedIds) {
    const ruleSet = byId.get(id);
    if (ruleSet && !seen.has(id)) {
      ordered.push(ruleSet);
      seen.add(id);
    }
  }
  for (const ruleSet of config.ruleSets) {
    if (!seen.has(ruleSet.id)) ordered.push(ruleSet);
  }
  return { ...config, ruleSets: ordered };
}

export function setGlobalRemove(
  config: RouteKitProjectConfig,
  values: string[],
): RouteKitProjectConfig {
  return { ...config, globalRemove: normalizeList(values) };
}

export function setTemplateField(
  config: RouteKitProjectConfig,
  patch: Partial<RouteKitProjectConfig["template"]>,
): RouteKitProjectConfig {
  return { ...config, template: { ...config.template, ...patch } };
}

export function mergeImportedConfig(
  config: RouteKitProjectConfig,
  imported: ImportedConfig,
): RouteKitProjectConfig {
  const existingGroupNames = new Set(config.customProxyGroups.map((group) => group.name));
  const customProxyGroups = [
    ...config.customProxyGroups,
    ...imported.customProxyGroups.filter((group) => !existingGroupNames.has(group.name)),
  ];

  const existingIds = new Set(config.ruleSets.map((ruleSet) => ruleSet.id));
  const hasFinal = config.ruleSets.some((ruleSet) => ruleSet.source.type === "final");
  const incoming = imported.ruleSets.filter(
    (ruleSet) => !existingIds.has(ruleSet.id) && !(hasFinal && ruleSet.source.type === "final"),
  );
  const finalIndex = config.ruleSets.findIndex((ruleSet) => ruleSet.source.type === "final");
  const insertAt = finalIndex === -1 ? config.ruleSets.length : finalIndex;
  const ruleSets = [
    ...config.ruleSets.slice(0, insertAt),
    ...incoming,
    ...config.ruleSets.slice(insertAt),
  ];

  return { ...config, customProxyGroups, ruleSets };
}

export function replaceImportedConfig(
  config: RouteKitProjectConfig,
  imported: ImportedConfig,
): RouteKitProjectConfig {
  return {
    ...config,
    customProxyGroups: imported.customProxyGroups.map((group) => ({
      ...group,
      options: [...group.options],
      nodeFilters: group.nodeFilters ? [...group.nodeFilters] : undefined,
    })),
    ruleSets: imported.ruleSets.map((ruleSet) => ({ ...ruleSet, source: { ...ruleSet.source } })),
  };
}
