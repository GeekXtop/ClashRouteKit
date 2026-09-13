import type {
  RouteKitProjectConfig,
  RuleProviderConfig,
  RuleProviderSource,
} from "@clash-route-kit/core";

export function providerSourceValue(source: RuleProviderSource): string {
  return source.type === "domain-list-community" ? source.entry : source.path;
}

/** provider 是否至少有一个取值非空的来源（sources 为空或缺路径都算“待补全”）。 */
export function providerHasUsableSource(provider: RuleProviderConfig): boolean {
  return provider.sources.some((source) => providerSourceValue(source).trim().length > 0);
}

/** 在拥有专用生成器前，.mrs 输出不支持生成（仅 .yaml 可作为 provider 输出）。 */
export function providerOutputIsMrs(provider: RuleProviderConfig): boolean {
  return provider.output.toLowerCase().endsWith(".mrs");
}

/** 空来源或 .mrs 输出的 provider 不能处于启用状态（保存时强制降级为禁用草稿）。 */
export function providerMustStayDisabled(provider: RuleProviderConfig): boolean {
  return !providerHasUsableSource(provider) || providerOutputIsMrs(provider);
}

export interface StaleProviderSource {
  providerName: string;
  path: string;
  reason: "local-file-missing" | "vendor-repo-missing";
}

function normalizeSlash(value: string): string {
  return value.replace(/\\/g, "/").trim();
}

/**
 * “失效来源”的 Web 侧最接近语义：Web 运行时拿不到文件系统，只判定两类可计算情况——
 * 1) basePath 缺省且 path 落在 config/rules/ 下，但该 .list 不在本地规则文件列表中；
 * 2) basePath 指向 vendor/<folder>，但该仓库已不在 vendorRepos 声明中（被移除或改名）。
 * domain-list-community 与其它无法验证的路径不参与判定，避免误报。
 */
export function findStaleProviderSources(
  config: RouteKitProjectConfig,
  listFiles: readonly string[],
): StaleProviderSource[] {
  const localFiles = new Set(listFiles);
  const vendorPaths = new Set(
    (config.vendorRepos ?? []).map((repo) => normalizeSlash(repo.path).replace(/\/+$/, "")),
  );
  const stale: StaleProviderSource[] = [];
  for (const provider of config.ruleProviders ?? []) {
    for (const source of provider.sources) {
      if (source.type === "domain-list-community") continue;
      const path = normalizeSlash(source.path);
      if (!path) continue;
      const basePath = source.basePath
        ? normalizeSlash(source.basePath).replace(/\/+$/, "")
        : "";
      if (basePath.startsWith("vendor/")) {
        if (!vendorPaths.has(basePath)) {
          stale.push({
            providerName: provider.name,
            path: source.path,
            reason: "vendor-repo-missing",
          });
        }
        continue;
      }
      if (!basePath && path.startsWith("config/rules/")) {
        const fileName = path.slice("config/rules/".length);
        if (!fileName.includes("/") && !localFiles.has(fileName)) {
          stale.push({
            providerName: provider.name,
            path: source.path,
            reason: "local-file-missing",
          });
        }
      }
    }
  }
  return stale;
}
