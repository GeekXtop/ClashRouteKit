import { execFile } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  parseRouteKitConfig,
  serializeRouteKitConfig,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";
import {
  checkConfig,
  generateOutputs,
  type GenerateResult,
  type ProgramOptions,
} from "../../cli/src/program.js";

const execFileAsync = promisify(execFile);

export type RouteKitAction = "check" | "generate" | "git-status" | "git-commit" | "git-push";

export interface RouteKitActionResult {
  action: RouteKitAction;
  ok: boolean;
  output: string;
}

interface RouteKitActionDependencies {
  checkConfig?: typeof checkConfig;
  generateOutputs?: typeof generateOutputs;
  runCommand?: RunCommand;
}

type RouteKitActionOptions = ProgramOptions & RouteKitActionDependencies;
type RunCommand = (command: string, args: string[], cwd: string) => Promise<string>;
type ReadText = (filePath: string) => Promise<string>;
type WriteText = (filePath: string, text: string) => Promise<void>;

export interface ProjectConfigFileOptions extends ProgramOptions {
  readText?: ReadText;
}

export interface WriteProjectConfigFileOptions extends ProgramOptions {
  config: RouteKitProjectConfig;
  writeText?: WriteText;
}

export interface ProjectConfigFileResult {
  yaml: string;
  config: RouteKitProjectConfig;
}

function projectConfigPath(options: ProgramOptions): string {
  return path.resolve(options.root, options.configFile);
}

export async function readProjectConfigFile(
  options: ProjectConfigFileOptions,
): Promise<ProjectConfigFileResult> {
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  const yaml = await readText(projectConfigPath(options));
  return {
    yaml,
    config: parseRouteKitConfig(yaml),
  };
}

export async function writeProjectConfigFile(
  options: WriteProjectConfigFileOptions,
): Promise<ProjectConfigFileResult> {
  const writeText = options.writeText ?? ((filePath: string, text: string) => writeFile(filePath, text, "utf8"));
  const yaml = serializeRouteKitConfig(options.config);
  await writeText(projectConfigPath(options), yaml);
  return {
    yaml,
    config: options.config,
  };
}

async function defaultRunCommand(command: string, args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync(command, args, { cwd });
  return [result.stdout, result.stderr].filter(Boolean).join("");
}

function formatGenerateOutput(result: GenerateResult): string {
  const lines = [`[generate] template: ${result.templatePath}`];
  for (const provider of result.providers) {
    const sources = provider.sources
      .map((source) => `${source.name}:${source.domainRules}/${source.inputRules}`)
      .join(", ");
    lines.push(`[generate] rules: ${provider.path}`);
    lines.push(
      `[generate] summary: ${provider.name} output=${provider.outputRules} domain=${provider.domainRules} excluded=${provider.excludedRules} sources=[${sources}]`,
    );
  }
  const duplicateRuleCount = result.duplicates.reduce((count, provider) => count + provider.rules.length, 0);
  lines.push(`[generate] duplicates: providers=${result.duplicates.length} rules=${duplicateRuleCount}`);
  lines.push(`[generate] overlaps: rules=${result.overlaps.length}`);
  lines.push(`[generate] report: ${result.reportPath}`);
  return lines.join("\n");
}

export async function runRouteKitAction(
  action: RouteKitAction,
  options: RouteKitActionOptions,
): Promise<RouteKitActionResult> {
  const runCommand = options.runCommand ?? defaultRunCommand;

  if (action === "check") {
    const diagnostics = await (options.checkConfig ?? checkConfig)(options);
    return {
      action,
      ok: diagnostics.length === 0,
      output: diagnostics.length === 0 ? "[check] ok" : diagnostics.map((item) => `[check] ${item}`).join("\n"),
    };
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
    await runCommand("git", ["add", "config/modules.yaml", "config/rules"], options.root);
    const output = await runCommand("git", ["commit", "-m", "chore: update route config"], options.root);
    return {
      action,
      ok: true,
      output: output || "[git] committed route config",
    };
  }

  if (action === "git-push") {
    const output = await runCommand("git", ["push"], options.root);
    return {
      action,
      ok: true,
      output: output || "[git] pushed current branch",
    };
  }

  const result = await (options.generateOutputs ?? generateOutputs)(options);
  return {
    action,
    ok: true,
    output: formatGenerateOutput(result),
  };
}

function parseRouteKitAction(pathname: string): RouteKitAction | null {
  if (pathname === "/api/actions/check") return "check";
  if (pathname === "/api/actions/generate") return "generate";
  if (pathname === "/api/actions/git-status") return "git-status";
  if (pathname === "/api/actions/git-commit") return "git-commit";
  if (pathname === "/api/actions/git-push") return "git-push";
  return null;
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

export function createRouteKitApiHandler(options: ProgramOptions) {
  return (request: IncomingMessage, response: ServerResponse, next: () => void): void => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/api/project/config") {
      if (request.method === "GET") {
        void readProjectConfigFile(options)
          .then((result) => writeJson(response, 200, result))
          .catch((error: unknown) => {
            writeJson(response, 500, {
              ok: false,
              output: error instanceof Error ? error.message : String(error),
            });
          });
        return;
      }

      if (request.method === "PUT") {
        let body = "";
        request.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
        });
        request.on("end", () => {
          void Promise.resolve()
            .then(() => JSON.parse(body) as { config?: RouteKitProjectConfig })
            .then((payload) => {
              if (!payload.config) {
                throw new Error("Missing config");
              }
              return writeProjectConfigFile({ ...options, config: payload.config });
            })
            .then((result) => writeJson(response, 200, result))
            .catch((error: unknown) => {
              writeJson(response, 400, {
                ok: false,
                output: error instanceof Error ? error.message : String(error),
              });
            });
        });
        return;
      }

      writeJson(response, 405, { ok: false, output: "Method not allowed" });
      return;
    }

    if (!url.pathname.startsWith("/api/actions/")) {
      next();
      return;
    }

    if (request.method !== "POST") {
      writeJson(response, 405, { ok: false, output: "Method not allowed" });
      return;
    }

    const action = parseRouteKitAction(url.pathname);
    if (!action) {
      writeJson(response, 404, { ok: false, output: "Unknown action" });
      return;
    }

    void runRouteKitAction(action, options)
      .then((result) => writeJson(response, result.ok ? 200 : 422, result))
      .catch((error: unknown) => {
        writeJson(response, 500, {
          action,
          ok: false,
          output: error instanceof Error ? error.message : String(error),
        });
      });
  };
}
