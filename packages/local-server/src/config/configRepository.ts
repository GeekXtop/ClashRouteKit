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
