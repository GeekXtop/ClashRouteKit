import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  ConfigDiagnosticError,
  hasDiagnosticErrors,
  normalizeAuthorProjectConfig,
  parseAuthorProjectConfig,
  toRouteKitConfig,
  validateNormalizedProject,
  type AuthorProjectConfigV2,
  type Diagnostic,
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




export function projectConfigPath(options: ProjectOptions): string {
  return path.resolve(options.root, options.configFile);
}

/**
 * Schema v2 作者配置 → 渲染 DTO（readConfig 与 hostingHandler 共用的桥）：
 * normalize + 静态校验（error 抛 ConfigDiagnosticError）+ toRouteKitConfig 投影，
 * 并补全生成链所需工程字段（template / vendorRepos / ruleProviders）。
 */
export function renderedConfigFromAuthorProjectV2(
  v2: AuthorProjectConfigV2,
  publishBaseUrl: string,
): RouteKitProjectConfig {
  const normalized = normalizeAuthorProjectConfig(v2);
  const errors = [
    ...normalized.diagnostics,
    ...validateNormalizedProject(normalized.project),
  ].filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length > 0) {
    throw new ConfigDiagnosticError(errors);
  }
  const rendered = toRouteKitConfig(normalized.project, { publishBaseUrl });
  return {
    ...rendered,
    template: { output: v2.project?.template?.output ?? "Custom_Clash.ini" },
    vendorRepos: v2.vendorRepos ?? [],
    ruleProviders: v2.ruleProviders,
  };
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
  const config = renderedConfigFromAuthorProjectV2(
    parsed.v2,
    process.env.CLASH_ROUTE_KIT_PUBLISH_BASE_URL ?? "",
  );
  const publishBaseUrl = process.env.CLASH_ROUTE_KIT_PUBLISH_BASE_URL;
  return publishBaseUrl ? { ...config, publishBaseUrl } : config;
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
export interface ReadAuthorProjectFileResult {
  schemaVersion: 2;
  yaml: string;
  v2: AuthorProjectConfigV2;
  mtime: number;
}

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
  return { schemaVersion: 2, yaml, v2: parsed.v2, mtime };
}

export interface SaveAuthorProjectOptions extends ProjectOptions {
  /** 客户端提交的完整 v2 YAML 文本（顶层 schemaVersion: 2）。 */
  yaml: string;
  /** 写前比对的基础 mtime（与 GET 返回的 mtime 同源）；不匹配返回 conflict 不落盘。 */
  baseMtime: number;
  readText?: ReadText;
  writeText?: WriteText;
  statMtime?: (filePath: string) => Promise<number>;
}

export interface SaveAuthorProjectSuccess {
  ok: true;
  schemaVersion: 2;
  /**
   * 实际写入配置文件的 v2 YAML：提交文本以 schemaVersion: 2 开头时原样返回
   * （含注释与排版），否则为重序列化置顶文本。
   */
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

export interface SaveAuthorProjectConflict {
  ok: false;
  conflict: true;
  code: "config.conflict";
  /** 服务端当前 yaml 全文（供前端展示/重载）；文件不存在时为空串。 */
  currentYaml: string;
  /** 服务端当前 mtime（覆盖重试时作为新 base）。 */
  mtime: number;
}

export type SaveAuthorProjectResult =
  | SaveAuthorProjectSuccess
  | SaveAuthorProjectRejection
  | SaveAuthorProjectConflict;

/**
 * v2 作者配置保存（plan Task 4 服务端补全）：与迁移 apply 共用
 * authorProjectV2 的完整校验链，存在 error 级诊断返回 ok:false 且不写盘。
 * 注释保真：提交文本以 schemaVersion: 2 开头时原样写盘（校验链已在该文本上
 * 通过），保留作者注释与排版；其余情况（如 schemaVersion 不在首位）回退
 * 重序列化，维持"schemaVersion 置顶"的磁盘不变量——文件头注释会随重序列化
 * 丢失，为已知限制。写入经 writeFileAtomic 原子替换。
 * 写前比对 baseMtime（乐观锁）：不匹配返回 conflict + 服务端当前全文，不落盘。
 * 已知限制：文件系统 mtime 粒度较粗（部分 FS 秒级），极短间隔的连续外部写入
 * 可能漏检冲突；且 stat 比对与写入之间是 check-then-act 窗口（TOCTOU），并发
 * 写以最后落盘者为准、不产生半份文件——单用户本地工具可接受，需要更强保证时
 * 升级为内容 hash 或文件锁。
 * 解析失败（YAML 语法、v2 结构错误、schemaVersion 非 2）抛 ConfigDiagnosticError，
 * 由 API 层转换为 400 + diagnostics。
 */
export async function saveAuthorProject(
  options: SaveAuthorProjectOptions,
): Promise<SaveAuthorProjectResult> {
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  const writeText = options.writeText ?? ((filePath: string, text: string) => writeFileAtomic(filePath, text));
  const statMtime =
    options.statMtime ?? ((filePath: string) => stat(filePath).then((info) => info.mtimeMs).catch(() => 0));

  const validation = validateAuthorProjectV2Yaml(options.yaml);
  if (hasDiagnosticErrors(validation.diagnostics)) {
    return { ok: false, diagnostics: validation.diagnostics };
  }
  // 校验保证 schemaVersion: 2 存在；置顶与否决定能否原样保留注释。
  const yaml = options.yaml.startsWith("schemaVersion: 2")
    ? options.yaml
    : serializeAuthorProjectV2(validation.parsed);
  const configPath = projectConfigPath(options);
  const currentMtime = await statMtime(configPath);
  if (currentMtime !== options.baseMtime) {
    const currentYaml = await readText(configPath).catch(() => "");
    return { ok: false, conflict: true, code: "config.conflict", currentYaml, mtime: currentMtime };
  }
  await writeText(configPath, yaml);
  return {
    ok: true,
    schemaVersion: 2,
    yaml,
    mtime: await statMtime(configPath),
    diagnostics: validation.diagnostics.filter((diagnostic) => diagnostic.severity !== "error"),
  };
}
