import type {
  CustomProxyGroup,
  ImportedConfig,
  RouteKitDefaults,
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

export function addRoute(
  config: RouteKitProjectConfig,
  params: { source: RuleSetSource; policy: string; section?: string },
): RouteKitProjectConfig {
  const existing = new Set(config.ruleSets.map((ruleSet) => ruleSet.id));
  const hint =
    params.source.type === "geosite" || params.source.type === "geoip"
      ? params.source.value
      : params.source.type === "rule-provider"
        ? params.source.file
        : "final";
  const base = `${params.source.type}-${hint || "entry"}`.replace(/[^A-Za-z0-9_-]+/g, "-");
  let id = base;
  let suffix = 2;
  while (existing.has(id)) id = `${base}-${suffix++}`;
  const ruleSet: RuleSet = {
    id,
    policy: params.policy,
    source: params.source,
    ...(params.section ? { section: params.section } : {}),
  };
  return addRuleSet(config, ruleSet);
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

export function replaceRuleSet(
  config: RouteKitProjectConfig,
  originalId: string,
  nextRuleSet: RuleSet,
): RouteKitProjectConfig {
  const id = nextRuleSet.id.trim();
  if (!id) {
    throw new Error("RuleSet id is required");
  }
  if (id !== originalId && config.ruleSets.some((ruleSet) => ruleSet.id === id)) {
    throw new Error(`RuleSet "${id}" already exists`);
  }

  return {
    ...config,
    ruleSets: config.ruleSets.map((ruleSet) =>
      ruleSet.id === originalId
        ? cloneRuleSet({ ...nextRuleSet, id })
        : ruleSet,
    ),
  };
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

export function createCustomProxyGroup(
  config: RouteKitProjectConfig,
  type: CustomProxyGroup["type"] = "select",
): CustomProxyGroup {
  const names = config.customProxyGroups.map((group) => group.name);
  const name = nextName(names, "ProxyGroup");
  return type === "select"
    ? { name, type, options: ["DIRECT"] }
    : { name, type, options: [], nodeFilters: [".*"] };
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
      cloneCustomProxyGroup({
        ...group,
        name: group.name === groupName ? name : group.name,
        options: group.options.map((option) => (option === groupName ? name : option)),
      }),
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
  const parentGroup = config.customProxyGroups.find(
    (group) => group.name !== groupName && group.options.includes(groupName),
  );
  if (parentGroup) {
    throw new Error(
      `custom_proxy_group is still referenced by ${parentGroup.name}: ${groupName}`,
    );
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

export function replaceCustomProxyGroup(
  config: RouteKitProjectConfig,
  originalName: string,
  nextGroup: CustomProxyGroup,
): RouteKitProjectConfig {
  const name = nextGroup.name.trim();
  const renamed = renameCustomProxyGroup(config, originalName, name);
  return updateCustomProxyGroup(renamed, name, {
    ...nextGroup,
    name,
    options: [...nextGroup.options],
    nodeFilters: nextGroup.nodeFilters ? [...nextGroup.nodeFilters] : undefined,
  });
}

function providerNameFromOutput(output: string): string {
  return (
    output
      .replace(/\.(ya?ml)$/i, "")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "Provider"
  );
}

interface ImportedProviderDrafts {
  ruleProviders: RuleProviderConfig[];
  placeholderOutputs: Set<string>;
}

function importedProviderDrafts(
  config: RouteKitProjectConfig,
  imported: ImportedConfig,
): ImportedProviderDrafts {
  const existingProviders = (config.ruleProviders ?? []).map(cloneRuleProvider);
  const existingOutputs = new Set(existingProviders.map((provider) => provider.output));
  const names = existingProviders.map((provider) => provider.name);
  const placeholders: RuleProviderConfig[] = [];
  const placeholderOutputs = new Set<string>();

  for (const ruleSet of imported.ruleSets) {
    const source = ruleSet.source;
    if (source.type !== "rule-provider") continue;
    const output = source.file.trim();
    if (!output || existingOutputs.has(output)) continue;
    existingOutputs.add(output);
    placeholderOutputs.add(output);
    const name = nextName(names, providerNameFromOutput(output));
    names.push(name);
    placeholders.push({
      name,
      output,
      behavior: source.behavior,
      enabled: false,
      sources: [],
    });
  }

  return {
    ruleProviders: [...existingProviders, ...placeholders],
    placeholderOutputs,
  };
}

function disablePlaceholderRuleSets(
  ruleSets: readonly RuleSet[],
  placeholderOutputs: ReadonlySet<string>,
): RuleSet[] {
  return ruleSets.map((ruleSet) => cloneRuleSet({
    ...ruleSet,
    ...(ruleSet.source.type === "rule-provider" && placeholderOutputs.has(ruleSet.source.file)
      ? { enabled: false }
      : {}),
  }));
}

export function createRuleProvider(config: RouteKitProjectConfig): RuleProviderConfig {
  const name = nextName((config.ruleProviders ?? []).map((provider) => provider.name), "Provider");
  return {
    name,
    output: `${name}_Domain.yaml`,
    behavior: "domain",
    enabled: false,
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

function cloneRouteKitDefaults(defaults: RouteKitDefaults): RouteKitDefaults {
  return {
    ...(defaults.proxyGroups
      ? {
          proxyGroups: {
            ...(defaults.proxyGroups.healthCheck
              ? { healthCheck: { ...defaults.proxyGroups.healthCheck } }
              : {}),
            ...(defaults.proxyGroups.urlTest
              ? { urlTest: { ...defaults.proxyGroups.urlTest } }
              : {}),
          },
        }
      : {}),
    ...(defaults.ruleSets ? { ruleSets: { ...defaults.ruleSets } } : {}),
  };
}

export function setProjectDefaults(
  config: RouteKitProjectConfig,
  defaults: RouteKitDefaults | undefined,
): RouteKitProjectConfig {
  return {
    ...config,
    defaults: defaults === undefined ? undefined : cloneRouteKitDefaults(defaults),
  };
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
  const providerDrafts = importedProviderDrafts(config, imported);
  const incoming = disablePlaceholderRuleSets(imported.ruleSets, providerDrafts.placeholderOutputs).filter(
    (ruleSet) => !existingIds.has(ruleSet.id) && !(hasFinal && ruleSet.source.type === "final"),
  );
  const finalIndex = config.ruleSets.findIndex((ruleSet) => ruleSet.source.type === "final");
  const insertAt = finalIndex === -1 ? config.ruleSets.length : finalIndex;
  const ruleSets = [
    ...config.ruleSets.slice(0, insertAt),
    ...incoming,
    ...config.ruleSets.slice(insertAt),
  ];

  return {
    ...config,
    customProxyGroups,
    ruleSets,
    ruleProviders: providerDrafts.ruleProviders,
  };
}

export function replaceImportedConfig(
  config: RouteKitProjectConfig,
  imported: ImportedConfig,
): RouteKitProjectConfig {
  const providerDrafts = importedProviderDrafts(config, imported);
  return {
    ...config,
    customProxyGroups: imported.customProxyGroups.map((group) => ({
      ...group,
      options: [...group.options],
      nodeFilters: group.nodeFilters ? [...group.nodeFilters] : undefined,
    })),
    ruleSets: disablePlaceholderRuleSets(imported.ruleSets, providerDrafts.placeholderOutputs),
    ruleProviders: providerDrafts.ruleProviders,
  };
}
