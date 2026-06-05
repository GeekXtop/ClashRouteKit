import type { RouteKitProjectConfig, RouteModule } from "@clash-route-kit/core";

function isModuleEnabled(module: RouteModule): boolean {
  return module.enabled !== false;
}

export function setModuleEnabled(
  config: RouteKitProjectConfig,
  moduleId: string,
  enabled: boolean,
): RouteKitProjectConfig {
  return {
    ...config,
    modules: config.modules.map((module) =>
      module.id === moduleId ? { ...module, enabled } : module,
    ),
  };
}

export function toggleModuleEnabled(
  config: RouteKitProjectConfig,
  moduleId: string,
): RouteKitProjectConfig {
  const module = config.modules.find((item) => item.id === moduleId);
  if (!module) return config;
  return setModuleEnabled(config, moduleId, !isModuleEnabled(module));
}
