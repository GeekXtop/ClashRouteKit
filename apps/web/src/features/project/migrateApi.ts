import type { Diagnostic, MigrationPlan } from "@clash-route-kit/core";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** POST /api/project/migrate 响应（packages/local-server MigrationAnalysis）。 */
export interface MigrationAnalysisResult {
  currentSchemaVersion: 1 | 2;
  plan: MigrationPlan | null;
}

/** POST /api/project/migrate/apply 响应：200 成功 / 422 校验拒绝（均不产生部分写入）。 */
export type ApplyMigrationOutcome =
  | { ok: true; backupPath: string; yaml: string; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

interface ErrorPayload {
  ok?: unknown;
  output?: unknown;
}

function toFailureMessage(payload: unknown, status: number): string {
  const output = (payload as ErrorPayload | null)?.output;
  if (typeof output === "string" && output.trim()) return output;
  return `迁移请求失败（HTTP ${status}）`;
}

/** 只读迁移分析：不写盘，失败（解析错误等）以服务端 output 文案抛出。 */
export async function analyzeMigrationRequest(
  fetcher: Fetcher = globalThis.fetch,
): Promise<MigrationAnalysisResult> {
  const response = await fetcher("/api/project/migrate", { method: "POST" });
  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(toFailureMessage(payload, response.status));
  }
  const analysis = payload as MigrationAnalysisResult;
  if (
    (analysis.currentSchemaVersion !== 1 && analysis.currentSchemaVersion !== 2) ||
    typeof analysis.plan !== "object"
  ) {
    throw new Error("迁移分析响应格式无效");
  }
  return analysis;
}

/**
 * 复核确认后的迁移应用：把 analyze 返回的 plan 原样传回。
 * 200 → 成功（含备份路径）；422 → 校验拒绝（未写盘）；其余按失败抛出。
 */
export async function applyMigrationRequest(
  plan: MigrationPlan,
  fetcher: Fetcher = globalThis.fetch,
): Promise<ApplyMigrationOutcome> {
  const response = await fetcher("/api/project/migrate/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  const payload = (await response.json()) as unknown;
  if (response.status === 200 && (payload as ErrorPayload | null)?.ok === true) {
    return payload as { ok: true; backupPath: string; yaml: string; diagnostics: Diagnostic[] };
  }
  if (response.status === 422 && (payload as ErrorPayload | null)?.ok === false) {
    return payload as { ok: false; diagnostics: Diagnostic[] };
  }
  throw new Error(toFailureMessage(payload, response.status));
}
