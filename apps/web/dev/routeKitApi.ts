import { execFile } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  parseDomainListEntry,
  parseRouteKitConfig,
  serializeRouteKitConfig,
  type DomainListEntryInfo,
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
type ReadDirectory = (directory: string) => Promise<string[]>;
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

export interface ProjectRuleFilesOptions extends ProgramOptions {
  readDirectory?: ReadDirectory;
}

export interface ProjectRuleFileOptions extends ProgramOptions {
  file: string;
  readText?: ReadText;
}

export interface WriteProjectRuleFileOptions extends ProgramOptions {
  file: string;
  text: string;
  writeText?: WriteText;
}

export interface ProjectRuleFileResult {
  file: string;
  text: string;
}

function projectConfigPath(options: ProgramOptions): string {
  return path.resolve(options.root, options.configFile);
}

function rulesDirectory(options: ProgramOptions): string {
  return path.resolve(options.root, "config/rules");
}

function resolveRuleFile(options: ProgramOptions, file: string): string {
  if (!/^[A-Za-z0-9_.-]+\.list$/.test(file)) {
    throw new Error(`Invalid rule file: ${file}`);
  }

  const directory = rulesDirectory(options);
  const resolved = path.resolve(directory, file);
  if (!resolved.startsWith(`${directory}${path.sep}`)) {
    throw new Error(`Invalid rule file: ${file}`);
  }
  return resolved;
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

export async function listProjectRuleFiles(options: ProjectRuleFilesOptions): Promise<string[]> {
  const readDirectory = options.readDirectory ?? ((directory: string) => readdir(directory));
  return (await readDirectory(rulesDirectory(options)))
    .filter((file) => /^[A-Za-z0-9_.-]+\.list$/.test(file))
    .sort();
}

export async function readProjectRuleFile(options: ProjectRuleFileOptions): Promise<ProjectRuleFileResult> {
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  return {
    file: options.file,
    text: await readText(resolveRuleFile(options, options.file)),
  };
}

export async function writeProjectRuleFile(
  options: WriteProjectRuleFileOptions,
): Promise<ProjectRuleFileResult> {
  const writeText = options.writeText ?? ((filePath: string, text: string) => writeFile(filePath, text, "utf8"));
  const text = options.text.replace(/\r\n?/g, "\n").replace(/\n?$/, "\n");
  await writeText(resolveRuleFile(options, options.file), text);
  return {
    file: options.file,
    text,
  };
}

const CATALOG_DATA_DIRS: Record<string, string> = {
  "domain-list-community": "vendor/domain-list-community/data",
};

export interface CatalogEntriesOptions extends ProgramOptions {
  origin: string;
  readDirectory?: ReadDirectory;
}

export interface CatalogEntryOptions extends ProgramOptions {
  origin: string;
  name: string;
  readText?: ReadText;
}

function catalogDataDir(options: ProgramOptions, origin: string): string {
  const dir = CATALOG_DATA_DIRS[origin];
  if (!dir) {
    throw new Error(`Unknown catalog origin: ${origin}`);
  }
  return path.resolve(options.root, dir);
}

export async function listCatalogEntries(options: CatalogEntriesOptions): Promise<string[]> {
  const readDirectory = options.readDirectory ?? ((directory: string) => readdir(directory));
  const entries = await readDirectory(catalogDataDir(options, options.origin));
  return entries.filter((name) => !name.includes(".")).sort();
}

export async function readCatalogEntry(
  options: CatalogEntryOptions,
): Promise<DomainListEntryInfo & { name: string }> {
  if (!/^[A-Za-z0-9_!.@-]+$/.test(options.name)) {
    throw new Error(`Invalid entry: ${options.name}`);
  }
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  const text = await readText(path.join(catalogDataDir(options, options.origin), options.name));
  return { name: options.name, ...parseDomainListEntry(text) };
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
    await runCommand("git", ["add", "config/routes.yaml", "config/rules"], options.root);
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

    if (url.pathname === "/api/project/rules") {
      if (request.method !== "GET") {
        writeJson(response, 405, { ok: false, output: "Method not allowed" });
        return;
      }

      void listProjectRuleFiles(options)
        .then((files) => writeJson(response, 200, { files }))
        .catch((error: unknown) => {
          writeJson(response, 500, {
            ok: false,
            output: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (url.pathname.startsWith("/api/project/rules/")) {
      const file = decodeURIComponent(url.pathname.slice("/api/project/rules/".length));

      if (request.method === "GET") {
        void readProjectRuleFile({ ...options, file })
          .then((result) => writeJson(response, 200, result))
          .catch((error: unknown) => {
            writeJson(response, 400, {
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
            .then(() => JSON.parse(body) as { text?: unknown })
            .then((payload) => {
              if (typeof payload.text !== "string") {
                throw new Error("Missing rule file text");
              }
              return writeProjectRuleFile({ ...options, file, text: payload.text });
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

    if (url.pathname === "/api/catalog/entries") {
      const origin = url.searchParams.get("origin") ?? "domain-list-community";
      void listCatalogEntries({ ...options, origin })
        .then((entries) => writeJson(response, 200, { entries }))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/catalog/entry") {
      const origin = url.searchParams.get("origin") ?? "domain-list-community";
      const name = url.searchParams.get("name") ?? "";
      void readCatalogEntry({ ...options, origin, name })
        .then((detail) => writeJson(response, 200, detail))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
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
