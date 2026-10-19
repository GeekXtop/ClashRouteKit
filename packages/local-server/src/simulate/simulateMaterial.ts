import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { convertDomainListCommunity } from "@clash-route-kit/core";
import type { AuthorProjectConfigV2 } from "@clash-route-kit/core";
import YAML from "yaml";
import type { ProjectOptions } from "../config/configRepository.js";
import type { DomainRouteInput } from "@clash-route-kit/core";

export interface SimulateMaterials {
  providerEntries: DomainRouteInput["providerEntries"];
  geositeEntries: DomainRouteInput["geositeEntries"];
}

/**
 * 命中模拟的评估材料加载（spec §5）：provider 读 output/rules/<output> 载荷，
 * geosite 读 vendor/domain-list-community/data/<tag> 并经 core 转换为规则串。
 * 所有读取失败都不致命——对应条目落 null，由评估器在轨迹里记 skipped。
 */
export async function loadSimulateMaterials(
  options: ProjectOptions,
  config: AuthorProjectConfigV2,
): Promise<SimulateMaterials> {
  const providerEntries: SimulateMaterials["providerEntries"] = {};
  for (const provider of config.ruleProviders) {
    if (provider.enabled === false) continue;
    try {
      const text = await readFile(path.resolve(options.root, "output/rules", provider.output), "utf8");
      const parsed = YAML.parse(text) as { payload?: unknown };
      providerEntries[provider.id] = {
        behavior: provider.behavior,
        entries: Array.isArray(parsed.payload)
          ? parsed.payload.filter((entry): entry is string => typeof entry === "string")
          : null,
      };
    } catch {
      providerEntries[provider.id] = { behavior: provider.behavior, entries: null };
    }
  }

  const geositeEntries: SimulateMaterials["geositeEntries"] = {};
  const tags = new Set<string>();
  for (const route of config.routes) {
    if (route.source.type !== "geosite") continue;
    const baseTag = route.source.value.split("@")[0] ?? route.source.value;
    if (baseTag) tags.add(baseTag);
  }
  const dataDir = path.resolve(options.root, "vendor/domain-list-community/data");
  for (const tag of tags) {
    try {
      const filePath = path.join(dataDir, tag);
      const text = await readFile(filePath, "utf8");
      const sourceUrl = pathToFileURL(filePath).toString();
      geositeEntries[tag] = await convertDomainListCommunity(text, {
        sourceUrl,
        fetchText: async (url) => readFile(fileURLToPath(url), "utf8"),
      });
    } catch {
      geositeEntries[tag] = null;
    }
  }

  return { providerEntries, geositeEntries };
}
