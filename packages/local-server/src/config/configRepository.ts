import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  ConfigDiagnosticError,
  hasDiagnosticErrors,
  parseRouteKitConfig,
  serializeRouteKitConfig,
  validateLegacyProjectConfig,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";
import { writeFileAtomic } from "./atomic.js";

/**
 * 项目定位所需的最小字段集；与 apps/cli 的 ProgramOptions 结构一致，
 * 避免反向依赖 apps/* 源码。
 */
export interface ProjectOptions {
  root: string;
  configFile: string;
}

export type ReadText = (filePath: string) => Promise<string>;
export type WriteText = (filePath: string, text: string) => Promise<void>;

export interface ProjectConfigFileOptions extends ProjectOptions {
  readText?: ReadText;
  statMtime?: (filePath: string) => Promise<number>;
}

export interface WriteProjectConfigFileOptions extends ProjectOptions {
  config: RouteKitProjectConfig;
  writeText?: WriteText;
  statMtime?: (filePath: string) => Promise<number>;
}

export interface ProjectConfigFileResult {
  yaml: string;
  config: RouteKitProjectConfig;
  mtime: number;
}

export function projectConfigPath(options: ProjectOptions): string {
  return path.resolve(options.root, options.configFile);
}

/**
 * 读取项目配置（严格解析）并应用 CLASH_ROUTE_KIT_PUBLISH_BASE_URL 环境变量覆盖
 * publishBaseUrl（供 publish 构建使用）；自 apps/cli program.ts 原样下沉。
 */
export async function readConfig(options: ProjectOptions): Promise<RouteKitProjectConfig> {
  const text = await readFile(path.join(options.root, options.configFile), "utf8");
  const config = parseRouteKitConfig(text);
  const publishBaseUrl = process.env.CLASH_ROUTE_KIT_PUBLISH_BASE_URL;
  return publishBaseUrl ? { ...config, publishBaseUrl } : config;
}

export async function readProjectConfigFile(
  options: ProjectConfigFileOptions,
): Promise<ProjectConfigFileResult> {
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  const statMtime =
    options.statMtime ?? ((filePath: string) => stat(filePath).then((info) => info.mtimeMs).catch(() => 0));
  const configPath = projectConfigPath(options);
  const yaml = await readText(configPath);
  return {
    yaml,
    config: parseRouteKitConfig(yaml),
    mtime: await statMtime(configPath),
  };
}

export async function writeProjectConfigFile(
  options: WriteProjectConfigFileOptions,
): Promise<ProjectConfigFileResult> {
  const writeText = options.writeText ?? ((filePath: string, text: string) => writeFileAtomic(filePath, text));
  const statMtime =
    options.statMtime ?? ((filePath: string) => stat(filePath).then((info) => info.mtimeMs).catch(() => 0));
  const diagnostics = validateLegacyProjectConfig(options.config);
  if (hasDiagnosticErrors(diagnostics)) {
    throw new ConfigDiagnosticError(diagnostics);
  }
  const yaml = serializeRouteKitConfig(options.config);
  const configPath = projectConfigPath(options);
  await writeText(configPath, yaml);
  return {
    yaml,
    config: options.config,
    mtime: await statMtime(configPath),
  };
}
