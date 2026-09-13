/**
 * Schema v2 项目会话层（plan Task 4 数据层）：
 * - `loadV2Project`：parse → validateAuthorProjectConfigV2 → normalize →
 *   validateNormalizedProject 的完整装载链；结构错误抛 ConfigDiagnosticError，
 *   跨实体语义问题收集进 diagnostics（config 始终返回）；
 * - `serializeV2Project`：schemaVersion: 2 置顶序列化，与 local-server
 *   `serializeAuthorProjectV2` 同一算法（服务端会重排，前端保持一致）；
 * - `fetchProjectDocument`：GET /api/project/config 按 schemaVersion 分发
 *   v1/v2 响应（v2 响应无 config 字段，v1 旧响应无 schemaVersion 键时按
 *   config 字段存在性回退为 v1）；
 * - `saveV2Project`：PUT { schemaVersion: 2, yaml }；200 返回服务器规范化后
 *   的 yaml 与 warning 诊断，422/400 返回结构化 diagnostics，网络错误向上抛出。
 * fetch 封装风格与 `localProject.ts` 保持一致。
 */
import {
  normalizeAuthorProjectConfig,
  parseAuthorProjectConfigV2,
  validateAuthorProjectConfigV2,
  validateNormalizedProject,
  type AuthorProjectConfigV2,
  type Diagnostic,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";
import YAML from "yaml";

export interface V2NormalizedSummary {
  groups: number;
  routes: number;
  providers: number;
  memberSets: number;
}

export interface V2ProjectState {
  config: AuthorProjectConfigV2;
  diagnostics: Diagnostic[];
  normalizedSummary: V2NormalizedSummary;
}

/**
 * 对 v2 作者配置跑完整语义分析：validate（作者配置层）+ normalize +
 * validateNormalizedProject（规范化层）诊断合并返回。
 * 纯函数、不抛异常，供装载与每次 mutation 后重算使用。
 */
export function analyzeV2Config(config: AuthorProjectConfigV2): {
  diagnostics: Diagnostic[];
  normalizedSummary: V2NormalizedSummary;
} {
  const authorDiagnostics = validateAuthorProjectConfigV2(config);
  const normalized = normalizeAuthorProjectConfig(config);
  const normalizedDiagnostics = validateNormalizedProject(normalized.project);
  return {
    diagnostics: [...authorDiagnostics, ...normalized.diagnostics, ...normalizedDiagnostics],
    normalizedSummary: {
      groups: normalized.project.groups.length,
      routes: normalized.project.routes.length,
      providers: config.ruleProviders.length,
      memberSets: Object.keys(config.memberSets ?? {}).length,
    },
  };
}

/** 装载 v2 项目状态；YAML / 结构错误抛 ConfigDiagnosticError（含 error 诊断）。 */
export function loadV2Project(yaml: string): V2ProjectState {
  const config = parseAuthorProjectConfigV2(yaml);
  const { diagnostics, normalizedSummary } = analyzeV2Config(config);
  return { config, diagnostics, normalizedSummary };
}

/** schemaVersion: 2 置顶序列化，算法与 local-server serializeAuthorProjectV2 一致。 */
export function serializeV2Project(config: AuthorProjectConfigV2): string {
  const { schemaVersion: _version, ...rest } = config;
  return YAML.stringify({ schemaVersion: 2, ...rest }, { lineWidth: 0 }).replace(/\n?$/, "\n");
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** GET /api/project/config 的分发结果：v1 带 config，v2 只有 yaml。 */
export type ProjectDocument =
  | { schemaVersion: 1; yaml: string; config: RouteKitProjectConfig }
  | { schemaVersion: 2; yaml: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readDiagnostics(value: unknown): Diagnostic[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Diagnostic =>
      isRecord(item) &&
      typeof item.code === "string" &&
      typeof item.severity === "string" &&
      typeof item.message === "string",
  );
}

export async function fetchProjectDocument(
  fetcher: Fetcher = globalThis.fetch,
): Promise<ProjectDocument> {
  const response = await fetcher("/api/project/config");
  const payload = (await response.json()) as unknown;
  if (!response.ok || !isRecord(payload) || typeof payload.yaml !== "string") {
    throw new Error("Invalid local project response");
  }
  if (payload.schemaVersion === 2) {
    return { schemaVersion: 2, yaml: payload.yaml };
  }
  if (isRecord(payload.config)) {
    return {
      schemaVersion: 1,
      yaml: payload.yaml,
      config: payload.config as unknown as RouteKitProjectConfig,
    };
  }
  throw new Error("Invalid local project response");
}

export type SaveV2ProjectResult =
  | { ok: true; yaml: string; warnings: Diagnostic[] }
  | { ok: false; reason: string; diagnostics: Diagnostic[] };

/**
 * v2 保存：PUT { schemaVersion: 2, yaml }。
 * - 200：服务器重新序列化后的 yaml + 非 error 诊断（warnings）；
 * - 422 / 400：ok:false，reason 取服务器 output 或默认提示，diagnostics 为
 *   结构化校验诊断；
 * - 响应体非 JSON / 缺 yaml、网络错误：抛异常，由调用方按保存失败处理。
 */
export async function saveV2Project(
  yaml: string,
  fetcher: Fetcher = globalThis.fetch,
): Promise<SaveV2ProjectResult> {
  const response = await fetcher("/api/project/config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ schemaVersion: 2, yaml }),
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  if (response.ok && isRecord(payload) && typeof payload.yaml === "string") {
    return { ok: true, yaml: payload.yaml, warnings: readDiagnostics(payload.diagnostics) };
  }
  if (isRecord(payload)) {
    const reason =
      typeof payload.output === "string" && payload.output
        ? payload.output
        : "Schema v2 保存被拒绝";
    return { ok: false, reason, diagnostics: readDiagnostics(payload.diagnostics) };
  }
  throw new Error("Invalid v2 project save response");
}
