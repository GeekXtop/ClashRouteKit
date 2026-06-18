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
