import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  ConfigDiagnosticError,
  hasDiagnosticErrors,
  normalizeAuthorProjectConfig,
  parseAuthorProjectConfig,
  parseRouteKitConfig,
  serializeRouteKitConfig,
  toRouteKitConfig,
  validateLegacyProjectConfig,
  validateNormalizedProject,
  type AuthorProjectConfigV2,
  type Diagnostic,
  type ParsedAuthorProjectConfig,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";
import { writeFileAtomic } from "./atomic.js";
import { serializeAuthorProjectV2, validateAuthorProjectV2Yaml } from "./authorProjectV2.js";

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
 * 读取项目配置并应用 CLASH_ROUTE_KIT_PUBLISH_BASE_URL 环境变量覆盖
 * publishBaseUrl（供 publish 构建使用）；自 apps/cli program.ts 原样下沉。
 * 按顶层 schemaVersion 分发：v1 走严格 v1 parser；v2 经 normalize +
 * toRouteKitConfig 投影为渲染输入（check / generate / preview 等 CLI
 * 链路对 v2 项目自动生效），规范化存在 error 级诊断时抛 ConfigDiagnosticError。
 */
export async function readConfig(options: ProjectOptions): Promise<RouteKitProjectConfig> {
  const text = await readFile(path.join(options.root, options.configFile), "utf8");
  const parsed = parseAuthorProjectConfig(text);
  let config: RouteKitProjectConfig;
  if (parsed.schemaVersion === 2 && parsed.v2) {
    const normalized = normalizeAuthorProjectConfig(parsed.v2);
    const errors = [
      ...normalized.diagnostics,
      ...validateNormalizedProject(normalized.project),
    ].filter((diagnostic) => diagnostic.severity === "error");
    if (errors.length > 0) {
      throw new ConfigDiagnosticError(errors);
    }
    const rendered = toRouteKitConfig(normalized.project, {
      publishBaseUrl: process.env.CLASH_ROUTE_KIT_PUBLISH_BASE_URL ?? "",
    });
    // 补全 v1 校验与生成链所需的工程字段：template、vendorRepos、ruleProviders
    //（workspace 校验检查路由引用的 provider 输出与来源文件存在性）。
    config = {
      ...rendered,
      template: { output: parsed.v2.project?.template?.output ?? "Custom_Clash.ini" },
      vendorRepos: parsed.v2.vendorRepos ?? [],
      ruleProviders: parsed.v2.ruleProviders,
    };
  } else if (parsed.v1) {
    config = parsed.v1;
  } else {
    config = parseRouteKitConfig(text);
  }
  const publishBaseUrl = process.env.CLASH_ROUTE_KIT_PUBLISH_BASE_URL;
  return publishBaseUrl ? { ...config, publishBaseUrl } : config;
}

/**
 * 经 core parseAuthorProjectConfig 按顶层 schemaVersion 分发读取作者配置
 * （v1 → v1 config，schemaVersion: 2 → v2 config）。
 * 供迁移端点与 v2 编辑路径使用；既有 readConfig / readProjectConfigFile
 * 保持 v1 形状不变，v1 编辑路径零回归。
 */
export async function readAuthorProject(options: ProjectOptions): Promise<ParsedAuthorProjectConfig> {
  const text = await readFile(path.join(options.root, options.configFile), "utf8");
  return parseAuthorProjectConfig(text);
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

export interface AuthorProjectFileOptions extends ProjectOptions {
  readText?: ReadText;
  statMtime?: (filePath: string) => Promise<number>;
}

/**
 * readAuthorProjectFile 结果：按顶层 schemaVersion 分发——
 * v1 保留既有响应形状（yaml / config / mtime）并追加 schemaVersion: 1；
 * v2 返回 { schemaVersion: 2, yaml, mtime, v2 }，v2 为解析后的作者配置对象
 * （catalog origins 与 vendor mutation 的 v2 消费方使用；HTTP 响应不得整体
 * 透传本结果，需按 schemaVersion 挑选字段）。
 */
export type ReadAuthorProjectFileResult =
  | { schemaVersion: 1; yaml: string; config: RouteKitProjectConfig; mtime: number }
  | { schemaVersion: 2; yaml: string; v2: AuthorProjectConfigV2; mtime: number };

/**
 * GET /api/project/config 的读取路径：经 parseAuthorProjectConfig 分发 v1/v2，
 * 修复"迁移后 GET 返回错误"的缺口。既有 readProjectConfigFile（vendorSync、
 * catalog 端点消费，依赖 v1 config）保持不变。
 */
export async function readAuthorProjectFile(
  options: AuthorProjectFileOptions,
): Promise<ReadAuthorProjectFileResult> {
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  const statMtime =
    options.statMtime ?? ((filePath: string) => stat(filePath).then((info) => info.mtimeMs).catch(() => 0));
  const configPath = projectConfigPath(options);
  const yaml = await readText(configPath);
  const parsed = parseAuthorProjectConfig(yaml);
  const mtime = await statMtime(configPath);
  if (parsed.schemaVersion === 2) {
    if (parsed.v2 === undefined) {
      throw new Error("parseAuthorProjectConfig returned schemaVersion 2 without a v2 config");
    }
    return { schemaVersion: 2, yaml, v2: parsed.v2, mtime };
  }
  if (parsed.v1 === undefined) {
    throw new Error("parseAuthorProjectConfig returned schemaVersion 1 without a v1 config");
  }
  return { schemaVersion: 1, yaml, config: parsed.v1, mtime };
}

export interface SaveAuthorProjectOptions extends ProjectOptions {
  /** 客户端提交的完整 v2 YAML 文本（顶层 schemaVersion: 2）。 */
  yaml: string;
  writeText?: WriteText;
  statMtime?: (filePath: string) => Promise<number>;
}

export interface SaveAuthorProjectSuccess {
  ok: true;
  schemaVersion: 2;
  /** 实际写入配置文件的 v2 YAML（schemaVersion: 2 固定在文件顶部）。 */
  yaml: string;
  mtime: number;
  /** 校验链中 warning 及以下的诊断。 */
  diagnostics: Diagnostic[];
}

export interface SaveAuthorProjectRejection {
  ok: false;
  /** 全部校验诊断（含 error）；此时未写盘。 */
  diagnostics: Diagnostic[];
}

export type SaveAuthorProjectResult = SaveAuthorProjectSuccess | SaveAuthorProjectRejection;

/**
 * v2 作者配置保存（plan Task 4 服务端补全）：与迁移 apply 共用
 * authorProjectV2 的完整校验链，存在 error 级诊断返回 ok:false 且不写盘；
 * 通过后以 schemaVersion: 2 置顶重新序列化并经 writeFileAtomic 原子写入。
 * 解析失败（YAML 语法、v2 结构错误、schemaVersion 非 2）抛 ConfigDiagnosticError，
 * 由 API 层转换为 400 + diagnostics。
 */
export async function saveAuthorProject(
  options: SaveAuthorProjectOptions,
): Promise<SaveAuthorProjectResult> {
  const writeText = options.writeText ?? ((filePath: string, text: string) => writeFileAtomic(filePath, text));
  const statMtime =
    options.statMtime ?? ((filePath: string) => stat(filePath).then((info) => info.mtimeMs).catch(() => 0));

  const validation = validateAuthorProjectV2Yaml(options.yaml);
  if (hasDiagnosticErrors(validation.diagnostics)) {
    return { ok: false, diagnostics: validation.diagnostics };
  }
  const yaml = serializeAuthorProjectV2(validation.parsed);
  const configPath = projectConfigPath(options);
  await writeText(configPath, yaml);
  return {
    ok: true,
    schemaVersion: 2,
    yaml,
    mtime: await statMtime(configPath),
    diagnostics: validation.diagnostics.filter((diagnostic) => diagnostic.severity !== "error"),
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
