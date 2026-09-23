import { parseAuthorProjectConfig } from "@clash-route-kit/core";
import routesYaml from "virtual:routes-config-yaml";

export const bundledProjectConfigYaml = routesYaml;

/**
 * 模块级解析必须容错：config/routes.yaml 已不被 Git 跟踪，可能是损坏的
 * YAML。bundle 解析失败不炸掉 App 模块链，由 App 以 Schema v2 空白项目
 * 兜底渲染首屏，真实项目随后由 fetchProjectDocument 加载并提示错误。
 */
function parseBundledSchemaVersion(): 2 | null {
  try {
    parseAuthorProjectConfig(routesYaml);
    return 2;
  } catch {
    return null;
  }
}

export const bundledSchemaVersion = parseBundledSchemaVersion();
