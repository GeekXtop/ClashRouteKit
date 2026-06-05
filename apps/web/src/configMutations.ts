import type { ProviderReference, RouteKitProjectConfig, RouteModule } from "@clash-route-kit/core";

type ModuleTagField = "geosite" | "geoip";

export interface CreateModuleOptions {
  baseId?: string;
  policy?: string;
}

function cloneProviders(providers: ProviderReference[] | undefined): ProviderReference[] | undefined {
  return providers?.map((provider) => ({ ...provider }));
}

function cloneModule(module: RouteModule): RouteModule {
  return {
    ...module,
    geosite: module.geosite ? [...module.geosite] : undefined,
    geoip: module.geoip ? [...module.geoip] : undefined,
    providers: cloneProviders(module.providers),
  };
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
}

function nextModuleId(config: RouteKitProjectConfig, baseId: string): string {
  const ids = new Set(config.modules.map((module) => module.id));
  if (!ids.has(baseId)) return baseId;

  let suffix = 2;
  while (ids.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
}

export function createModule(
  config: RouteKitProjectConfig,
  options: CreateModuleOptions = {},
): RouteModule {
  const baseId = options.baseId?.trim() || "module";
  return {
    id: nextModuleId(config, baseId),
    enabled: true,
    policy: options.policy ?? config.proxyGroups[0]?.name ?? config.final.policy,
    geosite: [],
    geoip: [],
    providers: [],
  };
}

export function updateModule(
  config: RouteKitProjectConfig,
  moduleId: string,
  patch: Partial<RouteModule>,
): RouteKitProjectConfig {
  let found = false;
  const modules = config.modules.map((module) => {
    if (module.id !== moduleId) return module;
    found = true;
    return cloneModule({ ...module, ...patch });
  });

  return found ? { ...config, modules } : config;
}

export function toggleModule(config: RouteKitProjectConfig, moduleId: string): RouteKitProjectConfig {
  const module = config.modules.find((item) => item.id === moduleId);
  if (!module) return config;
  return updateModule(config, moduleId, { enabled: module.enabled === false });
}

export function addModule(config: RouteKitProjectConfig, module: RouteModule): RouteKitProjectConfig {
  const id = module.id.trim();
  if (!id) {
    throw new Error("Module id is required");
  }
  if (config.modules.some((item) => item.id === id)) {
    throw new Error(`Module "${id}" already exists`);
  }

  return {
    ...config,
    modules: [...config.modules, cloneModule({ ...module, id })],
  };
}

export function deleteModule(config: RouteKitProjectConfig, moduleId: string): RouteKitProjectConfig {
  if (!config.modules.some((module) => module.id === moduleId)) return config;
  return {
    ...config,
    modules: config.modules.filter((module) => module.id !== moduleId),
  };
}

export function setModuleTags(
  config: RouteKitProjectConfig,
  moduleId: string,
  field: ModuleTagField,
  tags: string[],
): RouteKitProjectConfig {
  return updateModule(config, moduleId, {
    [field]: normalizeTags(tags),
  });
}

export function setModuleProviderRefs(
  config: RouteKitProjectConfig,
  moduleId: string,
  providers: ProviderReference[],
): RouteKitProjectConfig {
  return updateModule(config, moduleId, {
    providers: cloneProviders(providers) ?? [],
  });
}
