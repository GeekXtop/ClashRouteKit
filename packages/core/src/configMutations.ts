import type { RouteKitProjectConfig, VendorRepoConfig } from "./types.js";

export function addVendorRepo(
  config: RouteKitProjectConfig,
  repo: VendorRepoConfig,
): RouteKitProjectConfig {
  const name = repo.name.trim();
  if (!name) {
    throw new Error("vendor repo name is required");
  }
  if (config.vendorRepos.some((item) => item.name === name)) {
    throw new Error(`vendor repo "${name}" already exists`);
  }
  if (config.vendorRepos.some((item) => item.path === repo.path)) {
    throw new Error(`vendor repo path already exists: ${repo.path}`);
  }
  return { ...config, vendorRepos: [...config.vendorRepos, { ...repo, name }] };
}

export function updateVendorRepo(
  config: RouteKitProjectConfig,
  name: string,
  patch: Partial<VendorRepoConfig>,
): RouteKitProjectConfig {
  const index = config.vendorRepos.findIndex((item) => item.name === name);
  if (index === -1) {
    throw new Error(`vendor repo "${name}" not found`);
  }
  const next: VendorRepoConfig = { ...config.vendorRepos[index]!, ...patch };
  const nextName = next.name.trim();
  if (!nextName) {
    throw new Error("vendor repo name is required");
  }
  next.name = nextName;
  if (config.vendorRepos.some((item, i) => i !== index && item.name === nextName)) {
    throw new Error(`vendor repo "${nextName}" already exists`);
  }
  if (config.vendorRepos.some((item, i) => i !== index && item.path === next.path)) {
    throw new Error(`vendor repo path already exists: ${next.path}`);
  }
  const vendorRepos = [...config.vendorRepos];
  vendorRepos[index] = next;
  return { ...config, vendorRepos };
}

export function removeVendorRepo(config: RouteKitProjectConfig, name: string): RouteKitProjectConfig {
  if (!config.vendorRepos.some((item) => item.name === name)) {
    throw new Error(`vendor repo "${name}" not found`);
  }
  return { ...config, vendorRepos: config.vendorRepos.filter((item) => item.name !== name) };
}
