import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { formatDiagnostic, hasDiagnosticErrors, type Diagnostic } from "@clash-route-kit/core";
import type { ProjectOptions } from "../config/configRepository.js";
import { clearCatalogIndexCache } from "../catalog/catalog.js";

const execFileAsync = promisify(execFile);

export type RunCommand = (command: string, args: string[], cwd: string) => Promise<string>;

export async function defaultRunCommand(command: string, args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync(command, args, { cwd });
  return [result.stdout, result.stderr].filter(Boolean).join("");
}

export type RouteKitAction = "check" | "generate" | "sync-vendor" | "git-status" | "git-commit" | "git-push";

export interface RouteKitActionResult {
  action: RouteKitAction;
  ok: boolean;
  output: string;
  diagnostics?: Diagnostic[];
}

/** 门禁校验依赖：默认实现由 createDefaultDependencies 提供（checkConfig 已下沉本包），可显式注入覆盖。 */
export type CheckConfigFn = (options: ProjectOptions) => Promise<Diagnostic[]>;

export interface GenerateOutputsResult {
  templatePath: string;
  rulePaths: string[];
  reportPath: string;
  providers: Array<{
    name: string;
    path: string;
    outputRules: number;
    excludedRules: number;
    sources: Array<{ name: string; inputRules: number; outputRules: number }>;
  }>;
  duplicates: Array<{ provider: string; rules: Array<{ rule: string; sources: string[] }> }>;
  overlaps: Array<{ rule: string; providers: string[] }>;
}

/** 输出生成依赖：默认实现由 createDefaultDependencies 提供（generateOutputs 已下沉本包），可显式注入覆盖。 */
export type GenerateOutputsFn = (options: ProjectOptions) => Promise<GenerateOutputsResult>;

export interface VendorSyncActionResult {
  name: string;
  action: "clone" | "pull" | "error";
  path: string;
  error?: string;
}

/** 上游同步依赖：默认实现由 createDefaultDependencies 提供（syncVendor 已下沉本包），可显式注入覆盖。 */
export type SyncVendorFn = (options: ProjectOptions & { only?: string }) => Promise<VendorSyncActionResult[]>;

export interface RouteKitActionDependencies {
  checkConfig?: CheckConfigFn;
  generateOutputs?: GenerateOutputsFn;
  syncVendor?: SyncVendorFn;
  runCommand?: RunCommand;
  only?: string;
}

export type RouteKitActionOptions = ProjectOptions & RouteKitActionDependencies;

function formatGenerateOutput(result: GenerateOutputsResult): string {
  const lines = [`[generate] template: ${result.templatePath}`];
  for (const provider of result.providers) {
    const sources = provider.sources
      .map((source) => `${source.name}:${source.outputRules}/${source.inputRules}`)
      .join(", ");
    lines.push(`[generate] rules: ${provider.path}`);
    lines.push(
      `[generate] summary: ${provider.name} output=${provider.outputRules} excluded=${provider.excludedRules} sources=[${sources}]`,
    );
  }
  const duplicateRuleCount = result.duplicates.reduce((count, provider) => count + provider.rules.length, 0);
  lines.push(`[generate] duplicates: providers=${result.duplicates.length} rules=${duplicateRuleCount}`);
  lines.push(`[generate] overlaps: rules=${result.overlaps.length}`);
  lines.push(`[generate] report: ${result.reportPath}`);
  return lines.join("\n");
}

function formatCheckOutput(diagnostics: readonly Diagnostic[]): string {
  return diagnostics.length === 0
    ? "[check] ok"
    : diagnostics.map((diagnostic) => `[check] ${formatDiagnostic(diagnostic)}`).join("\n");
}

/** local-server 不导入 apps/*：默认实现来自 createDefaultDependencies，显式传入 undefined 时快速失败。 */
function injected<T>(value: T | undefined, name: string): T {
  if (!value) {
    throw new Error(`runRouteKitAction(${name}) requires an injected ${name} dependency`);
  }
  return value;
}

export async function runRouteKitAction(
  action: RouteKitAction,
  options: RouteKitActionOptions,
): Promise<RouteKitActionResult> {
  const runCommand = options.runCommand ?? defaultRunCommand;

  if (action === "check") {
    const diagnostics = await injected(options.checkConfig, "check")(options);
    return {
      action,
      ok: !hasDiagnosticErrors(diagnostics),
      output: formatCheckOutput(diagnostics),
      diagnostics,
    };
  }

  if (action === "sync-vendor") {
    const results = await injected(options.syncVendor, "sync-vendor")(options);
    clearCatalogIndexCache();
    const lines = results.map((result) =>
      result.action === "error"
        ? `[sync-vendor] error: ${result.name} -> ${result.error ?? "unknown error"}`
        : `[sync-vendor] ${result.action}: ${result.name} -> ${result.path}`,
    );
    return { action, ok: true, output: lines.length > 0 ? lines.join("\n") : "[sync-vendor] 无 vendorRepos" };
  }

  if (action === "git-status") {
    const output = await runCommand("git", ["status", "--short"], options.root);
    return {
      action,
      ok: true,
      output: output || "[git] working tree clean",
    };
  }

  if (action === "git-commit") {
    const diagnostics = await injected(options.checkConfig, "git-commit")(options);
    if (hasDiagnosticErrors(diagnostics)) {
      return {
        action,
        ok: false,
        output: formatCheckOutput(diagnostics),
        diagnostics,
      };
    }
    await runCommand("git", ["add", "config/modules.yaml", "config/rules"], options.root);
    const output = await runCommand("git", ["commit", "-m", "chore: update route config"], options.root);
    return {
      action,
      ok: true,
      output: output || "[git] committed route config",
      diagnostics,
    };
  }

  if (action === "git-push") {
    const diagnostics = await injected(options.checkConfig, "git-push")(options);
    if (hasDiagnosticErrors(diagnostics)) {
      return {
        action,
        ok: false,
        output: formatCheckOutput(diagnostics),
        diagnostics,
      };
    }
    const output = await runCommand("git", ["push"], options.root);
    return {
      action,
      ok: true,
      output: output || "[git] pushed current branch",
      diagnostics,
    };
  }

  const result = await injected(options.generateOutputs, "generate")(options);
  return {
    action,
    ok: true,
    output: formatGenerateOutput(result),
  };
}

export interface GitRemoteOptions extends ProjectOptions {
  runCommand?: RunCommand;
}

export async function readGitRemote(options: GitRemoteOptions): Promise<string> {
  const runCommand = options.runCommand ?? defaultRunCommand;
  const output = await runCommand("git", ["remote", "get-url", "origin"], options.root);
  return output.trim();
}

/** HTTP fetch 注入点：默认 global fetch；测试注入 mock，避免真实网络调用。 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** workflow 查询选项：runCommand 解析 remote，fetchImpl 查询 GitHub API，env 提供 token。 */
export interface WorkflowRunOptions extends GitRemoteOptions {
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
}

export type WorkflowRunState =
  | "success"
  | "in-progress"
  | "queued"
  | "failed"
  | "unknown"
  | "unsupported";

export interface WorkflowRunStatus {
  state: WorkflowRunState;
  runUrl?: string;
  createdAt?: string;
  conclusion?: string;
}

export interface PublishStatusResult {
  branch: string;
  workflow: WorkflowRunStatus;
}

/** 从 git remote URL 解析 GitHub owner/repo，支持 https 与 git@ 形式；其余返回 null。 */
export function parseGitHubOwnerRepo(remote: string): { owner: string; repo: string } | null {
  const trimmed = remote.trim();
  const ssh = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i.exec(trimmed);
  if (ssh) return { owner: ssh[1]!, repo: ssh[2]! };
  const https = /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/i.exec(trimmed);
  if (https) return { owner: https[1]!, repo: https[2]! };
  return null;
}

/** 当前分支：detached HEAD 或命令失败时抛带说明的错误，由上层端点转 JSON。 */
export async function getGitBranch(options: GitRemoteOptions): Promise<string> {
  const runCommand = options.runCommand ?? defaultRunCommand;
  let output: string;
  try {
    output = await runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], options.root);
  } catch (error: unknown) {
    throw new Error(`无法读取当前分支：${error instanceof Error ? error.message : String(error)}`);
  }
  const branch = output.trim();
  if (!branch || branch === "HEAD") {
    throw new Error("当前处于 detached HEAD 状态，无法确认发布分支");
  }
  return branch;
}

function mapWorkflowRunState(status: unknown, conclusion: unknown): WorkflowRunState {
  if (status === "in_progress") return "in-progress";
  if (status === "queued" || status === "waiting" || status === "pending") return "queued";
  if (conclusion === "success") return "success";
  if (
    conclusion === "failure"
    || conclusion === "timed_out"
    || conclusion === "cancelled"
    || conclusion === "startup_failure"
  ) {
    return "failed";
  }
  return "unknown";
}

/**
 * 查询 publish workflow 最近一次运行。非 GitHub remote、网络失败或非 2xx 一律降级为
 * unsupported（不抛错）；token 仅从环境变量读取并只用于 Authorization 头，不写日志。
 */
export async function getWorkflowRunStatus(options: WorkflowRunOptions): Promise<WorkflowRunStatus> {
  const unsupported: WorkflowRunStatus = { state: "unsupported" };
  let remote: string;
  try {
    remote = await readGitRemote(options);
  } catch {
    return unsupported;
  }
  const repo = parseGitHubOwnerRepo(remote);
  if (!repo) {
    return unsupported;
  }

  const fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "clash-route-kit-local-server",
  };
  const env = options.env ?? process.env;
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN;
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetchImpl(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/actions/workflows/publish.yml/runs?per_page=1`,
      { headers },
    );
    if (!response.ok) {
      return unsupported;
    }
    const payload = (await response.json()) as {
      workflow_runs?: Array<{
        html_url?: unknown;
        created_at?: unknown;
        status?: unknown;
        conclusion?: unknown;
      }>;
    };
    const run = payload.workflow_runs?.[0];
    if (!run) {
      return { state: "unknown" };
    }
    return {
      state: mapWorkflowRunState(run.status, run.conclusion),
      ...(typeof run.html_url === "string" ? { runUrl: run.html_url } : {}),
      ...(typeof run.created_at === "string" ? { createdAt: run.created_at } : {}),
      ...(typeof run.conclusion === "string" ? { conclusion: run.conclusion } : {}),
    };
  } catch {
    return unsupported;
  }
}

/** 发布状态聚合：当前分支（失败会抛错，由端点层转 JSON）+ 最近 workflow 运行（降级不抛错）。 */
export async function getPublishStatus(options: WorkflowRunOptions): Promise<PublishStatusResult> {
  const branch = await getGitBranch(options);
  const workflow = await getWorkflowRunStatus(options);
  return { branch, workflow };
}
