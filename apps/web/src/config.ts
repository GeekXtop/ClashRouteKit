import {
  parseAuthorProjectConfig,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";
import routesYaml from "virtual:routes-config-yaml";

export const bundledProjectConfigYaml = routesYaml;

/**
 * 模块级解析必须容错：config/routes.yaml 已不被 Git 跟踪，可能是 v2
 * 或损坏的 YAML。bundle 解析失败不再炸掉整个 App 模块链（此前 v1 严格
 * parser 遇到 v2 文本直接抛错导致白屏），由 App 按分发结果选择初始控制器。
 */
function parseBundledProject(): {
  schemaVersion: 1 | 2 | null;
  v1?: RouteKitProjectConfig;
} {
  try {
    const parsed = parseAuthorProjectConfig(routesYaml);
    if (parsed.schemaVersion === 2) return { schemaVersion: 2 };
    if (parsed.v1) return { schemaVersion: 1, v1: parsed.v1 };
    return { schemaVersion: null };
  } catch {
    return { schemaVersion: null };
  }
}

const bundled = parseBundledProject();

export const bundledSchemaVersion = bundled.schemaVersion;
export const bundledProjectConfig: RouteKitProjectConfig | undefined = bundled.v1;
