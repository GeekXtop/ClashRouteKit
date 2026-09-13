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
