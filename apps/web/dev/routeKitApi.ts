import type { IncomingMessage, ServerResponse } from "node:http";
import {
  checkConfig,
  generateOutputs,
  type GenerateResult,
  type ProgramOptions,
} from "../../cli/src/program.js";

export type RouteKitAction = "check" | "generate";

export interface RouteKitActionResult {
  action: RouteKitAction;
  ok: boolean;
  output: string;
}

interface RouteKitActionDependencies {
  checkConfig?: typeof checkConfig;
  generateOutputs?: typeof generateOutputs;
}

type RouteKitActionOptions = ProgramOptions & RouteKitActionDependencies;

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
  if (action === "check") {
    const diagnostics = await (options.checkConfig ?? checkConfig)(options);
    return {
      action,
      ok: diagnostics.length === 0,
      output: diagnostics.length === 0 ? "[check] ok" : diagnostics.map((item) => `[check] ${item}`).join("\n"),
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
