import { access, readdir } from "node:fs/promises";
import path from "node:path";
import type {
  Diagnostic,
  RouteKitProjectConfig,
  RuleProviderSource,
} from "@clash-route-kit/core";
import type { ProgramOptions } from "./program.js";

function sourcePath(root: string, source: RuleProviderSource): string {
  if (source.type === "domain-list-community") {
    return path.resolve(root, source.basePath ?? "vendor/domain-list-community/data", source.entry);
  }
  return path.resolve(root, source.basePath ?? ".", source.path);
}

export async function validateLegacyWorkspace(
  options: ProgramOptions,
  config: RouteKitProjectConfig,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const dataPath = path.join(options.root, "vendor/domain-list-community/data");
  let tags: Set<string> | undefined;
  try {
    tags = new Set((await readdir(dataPath, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name));
  } catch {
    tags = undefined;
  }

  for (const [index, ruleSet] of config.ruleSets.entries()) {
    if (ruleSet.enabled === false || ruleSet.source.type !== "geosite" || !tags) continue;
    const baseTag = ruleSet.source.value.split("@")[0] ?? ruleSet.source.value;
    if (!tags.has(baseTag)) {
      diagnostics.push({
        code: "workspace.geosite.missing",
        severity: "warning",
        path: `ruleSets[${index}].source.value`,
        message: `本地 GEOSITE Catalog 中未找到：${ruleSet.source.value}`,
        related: [ruleSet.source.value],
      });
    }
  }

  for (const [providerIndex, provider] of (config.ruleProviders ?? []).entries()) {
    if (provider.enabled === false) continue;
    for (const [sourceIndex, source] of provider.sources.entries()) {
      const filePath = sourcePath(options.root, source);
      try {
        await access(filePath);
      } catch {
        diagnostics.push({
          code: "workspace.provider-source.missing",
          severity: "error",
          path: `ruleProviders[${providerIndex}].sources[${sourceIndex}]`,
          message: `规则源文件不存在：${path.relative(options.root, filePath)}`,
        });
      }
    }
  }

  return diagnostics;
}
