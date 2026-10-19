import type { IncomingMessage, ServerResponse } from "node:http";
import type { Diagnostic, RouteKitProjectConfig } from "@clash-route-kit/core";
import { ConfigDiagnosticError, hasDiagnosticErrors, isPlausibleDomain, simulateDomainRoute } from "@clash-route-kit/core";
import {
  clearCatalogIndexCache,
  findCatalogPath,
  listCatalogEntriesWithMeta,
  listCatalogSources,
  loadCatalogOrigins,
  readCatalogEntry,
  readCatalogEntryDomains,
  readCatalogTemplate,
  searchCatalog,
} from "../catalog/catalog.js";
import type { ProjectOptions, ReadText, WriteText } from "../config/configRepository.js";
import {
  readAuthorProjectFile,
  saveAuthorProject,
} from "../config/configRepository.js";
import { validateAuthorProjectV2Yaml } from "../config/authorProjectV2.js";
import { loadSimulateMaterials } from "../simulate/simulateMaterial.js";
import { loadLocalSettings } from "../config/localSettings.js";
import {
  getPublishStatus,
  readGitRemote,
  runRouteKitAction,
  type CheckConfigFn,
  type FetchLike,
  type GenerateOutputsFn,
  type RouteKitAction,
  type RunCommand,
  type SyncVendorFn,
} from "../git/gitActions.js";
import {
  deleteProjectRuleFile,
  listProjectRuleFiles,
  readProjectRuleFile,
  writeProjectRuleFile,
  type ReadDirectory,
  type RemovePath,
} from "../rules/ruleFiles.js";
import {
  addProjectVendorRepo,
  removeProjectVendorRepo,
  updateProjectVendorRepo,
  type VendorRepoInput,
} from "../vendor/vendorSync.js";

/**
 * API 装配所需的最小依赖面：root/configFile 之外，check/generate/syncVendor
 * 沿用可选注入模式（默认实现由组装层注入，例如 CLI 的 program.ts）；
 * 文件 IO 注入项透传给各 use case，缺省时使用真实文件系统。
 */
export interface ApiHandlerOptions extends ProjectOptions {
  checkConfig?: CheckConfigFn;
  generateOutputs?: GenerateOutputsFn;
  syncVendor?: SyncVendorFn;
  runCommand?: RunCommand;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
  readText?: ReadText;
  writeText?: WriteText;
  readDirectory?: ReadDirectory;
  statMtime?: (filePath: string) => Promise<number>;
  removePath?: RemovePath;
}

function parseRouteKitAction(pathname: string): RouteKitAction | null {
  if (pathname === "/api/actions/check") return "check";
  if (pathname === "/api/actions/generate") return "generate";
  if (pathname === "/api/actions/sync-vendor") return "sync-vendor";
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

/** 错误转 JSON：ConfigDiagnosticError 额外携带结构化 diagnostics（4xx 语义）。 */
function errorPayload(error: unknown): { ok: false; output: string; diagnostics?: Diagnostic[] } {
  const output = error instanceof Error ? error.message : String(error);
  return error instanceof ConfigDiagnosticError
    ? { ok: false, output, diagnostics: [...error.diagnostics] }
    : { ok: false, output };
}

export function createRouteKitApiHandler(options: ApiHandlerOptions) {
  return (request: IncomingMessage, response: ServerResponse, next: () => void): void => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/api/project/config") {
      if (request.method === "GET") {
        // Schema v2-only：返回 { schemaVersion: 2, yaml, mtime }。
        // 运行时 URL 来自本地设置（spec 5.3，作者配置不携带）。
        void Promise.all([
          readAuthorProjectFile(options),
          loadLocalSettings({ root: options.root, env: options.env }),
        ])
          .then(([result, settings]) =>
            writeJson(response, 200, {
              schemaVersion: 2,
              yaml: result.yaml,
              mtime: result.mtime,
              publishBaseUrl: settings.serve.publicBaseUrl,
              subconverterUrl: settings.subconverterUrl,
            }),
          )
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
            .then(
              () =>
                JSON.parse(body) as {
                  config?: RouteKitProjectConfig;
                  schemaVersion?: unknown;
                  yaml?: unknown;
                  baseMtime?: unknown;
                },
            )
            .then(async (payload) => {
              // v2 保存：提交 { schemaVersion: 2, yaml, baseMtime }。缺 baseMtime 400，
              // 解析失败 400 + diagnostics，baseMtime 过期 409 + 服务端当前全文，
              // 校验 error 422 + diagnostics，成功 200（响应含写后 mtime）。
              if (typeof payload.yaml !== "string") {
                writeJson(response, 400, { ok: false, output: "Missing v2 config yaml" });
                return undefined;
              }
              if (typeof payload.baseMtime !== "number") {
                writeJson(response, 400, { ok: false, output: "Missing baseMtime" });
                return undefined;
              }
              try {
                const result = await saveAuthorProject({
                  ...options,
                  yaml: payload.yaml,
                  baseMtime: payload.baseMtime,
                });
                writeJson(response, result.ok ? 200 : "conflict" in result ? 409 : 422, result);
              } catch (error: unknown) {
                writeJson(response, 400, errorPayload(error));
              }
              return undefined;
            })
            .catch((error: unknown) => {
              // v1 保存失败同样携带结构化 diagnostics（ConfigDiagnosticError 时）。
              writeJson(response, 400, errorPayload(error));
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

      if (request.method === "DELETE") {
        void deleteProjectRuleFile({ ...options, file })
          .then((result) => writeJson(response, 200, result))
          .catch((error: unknown) => {
            writeJson(response, 400, {
              ok: false,
              output: error instanceof Error ? error.message : String(error),
            });
          });
        return;
      }

      writeJson(response, 405, { ok: false, output: "Method not allowed" });
      return;
    }

    if (url.pathname === "/api/catalog/sources") {
      void loadCatalogOrigins(options)
        .then((origins) => listCatalogSources({ ...options, origins }))
        .then((sources) => writeJson(response, 200, { sources }))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/catalog/entries") {
      const origin = url.searchParams.get("origin") ?? "domain-list-community";
      void loadCatalogOrigins(options)
        .then((origins) => listCatalogEntriesWithMeta({ ...options, origin, origins }))
        .then((entries) => writeJson(response, 200, { entries }))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/catalog/entry") {
      const origin = url.searchParams.get("origin") ?? "domain-list-community";
      const name = url.searchParams.get("name") ?? "";
      void loadCatalogOrigins(options)
        .then((origins) => readCatalogEntry({ ...options, origin, name, origins }))
        .then((detail) => writeJson(response, 200, detail))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/catalog/domains") {
      const origin = url.searchParams.get("origin") ?? "domain-list-community";
      const name = url.searchParams.get("name") ?? "";
      void loadCatalogOrigins(options)
        .then((origins) => readCatalogEntryDomains({ ...options, origin, name, origins }))
        .then((domains) => writeJson(response, 200, { domains }))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/catalog/template") {
      const origin = url.searchParams.get("origin") ?? "";
      const name = url.searchParams.get("name") ?? "";
      void loadCatalogOrigins(options)
        .then((origins) => readCatalogTemplate({ ...options, origin, name, origins }))
        .then((template) => writeJson(response, 200, template))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/catalog/search") {
      const origin = url.searchParams.get("origin") ?? "";
      const query = url.searchParams.get("q") ?? "";
      void loadCatalogOrigins(options)
        .then((origins) => searchCatalog({ ...options, origin, query, origins }))
        .then((hits) => writeJson(response, 200, { hits }))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/catalog/path") {
      const origin = url.searchParams.get("origin") ?? "";
      const name = url.searchParams.get("name") ?? "";
      void loadCatalogOrigins(options)
        .then((origins) => findCatalogPath({ ...options, origin, name, origins }))
        .then((catalogPath) => writeJson(response, 200, { path: catalogPath }))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/vendor/add" || url.pathname === "/api/vendor/update") {
      if (request.method !== "POST") {
        writeJson(response, 405, { ok: false, output: "Method not allowed" });
        return;
      }
      const isUpdate = url.pathname === "/api/vendor/update";
      let body = "";
      request.on("data", (chunk: Buffer) => {
        body += chunk.toString("utf8");
      });
      request.on("end", () => {
        void Promise.resolve()
          .then(() => JSON.parse(body) as { name?: string; input?: VendorRepoInput })
          .then((payload) => {
            if (!payload.input) {
              throw new Error("Missing input");
            }
            if (isUpdate) {
              if (!payload.name) {
                throw new Error("Missing name");
              }
              return updateProjectVendorRepo({ ...options, name: payload.name, input: payload.input });
            }
            return addProjectVendorRepo({ ...options, input: payload.input });
          })
          .then((result) => {
            clearCatalogIndexCache();
            writeJson(response, 200, result);
          })
          .catch((error: unknown) => {
            writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) });
          });
      });
      return;
    }

    if (url.pathname === "/api/vendor/remove") {
      if (request.method !== "POST") {
        writeJson(response, 405, { ok: false, output: "Method not allowed" });
        return;
      }
      let body = "";
      request.on("data", (chunk: Buffer) => {
        body += chunk.toString("utf8");
      });
      request.on("end", () => {
        void Promise.resolve()
          .then(() => JSON.parse(body) as { name?: string })
          .then((payload) => {
            if (!payload.name) {
              throw new Error("Missing name");
            }
            return removeProjectVendorRepo({ ...options, name: payload.name });
          })
          .then((result) => {
            clearCatalogIndexCache();
            writeJson(response, 200, result);
          })
          .catch((error: unknown) => {
            writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) });
          });
      });
      return;
    }

    // 两个 git 端点是只读查询，仅放行 GET/HEAD；其余方法在触发 git 前拒绝。
    if (
      (url.pathname === "/api/git/remote" || url.pathname === "/api/git/publish-status") &&
      request.method !== "GET" &&
      request.method !== "HEAD"
    ) {
      writeJson(response, 405, { ok: false, output: "Method not allowed" });
      return;
    }

    if (url.pathname === "/api/git/remote") {
      void readGitRemote(options)
        .then((remote) => writeJson(response, 200, { url: remote }))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/git/publish-status") {
      void getPublishStatus(options)
        .then((status) => writeJson(response, 200, status))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/route-simulate") {
      // 命中模拟（spec: 2026-10-19-hit-simulator-design.md）：域名 → 命中路由 → 策略链。
      // 只读评估，不落盘；yaml 覆盖时走与保存相同的 v2 校验链。
      if (request.method !== "POST") {
        writeJson(response, 405, { ok: false, output: "Method not allowed" });
        return;
      }
      let body = "";
      request.on("data", (chunk: Buffer) => {
        body += chunk.toString("utf8");
      });
      request.on("end", () => {
        void Promise.resolve()
          .then(() => JSON.parse(body) as { domain?: unknown; yaml?: unknown })
          .then(async (payload) => {
            const domain = typeof payload.domain === "string" ? payload.domain : "";
            if (!isPlausibleDomain(domain)) {
              writeJson(response, 400, { ok: false, output: "Invalid domain" });
              return undefined;
            }
            try {
              const project =
                typeof payload.yaml === "string"
                  ? (() => {
                      const validation = validateAuthorProjectV2Yaml(payload.yaml);
                      if (hasDiagnosticErrors(validation.diagnostics)) {
                        return { error: true as const, diagnostics: validation.diagnostics };
                      }
                      return { error: false as const, parsed: validation.parsed };
                    })()
                  : { error: false as const, parsed: (await readAuthorProjectFile(options)).v2 };
              if (project.error) {
                writeJson(response, 422, {
                  ok: false,
                  output: "Invalid v2 config yaml",
                  diagnostics: project.diagnostics,
                });
                return undefined;
              }
              const materials = await loadSimulateMaterials(options, project.parsed);
              const result = simulateDomainRoute({
                domain,
                routes: project.parsed.routes,
                proxyGroups: project.parsed.proxyGroups,
                memberSets: project.parsed.memberSets ?? {},
                providerEntries: materials.providerEntries,
                geositeEntries: materials.geositeEntries,
              });
              writeJson(response, 200, { ok: true, result });
            } catch (error: unknown) {
              // 磁盘配置缺失/非法（ConfigDiagnosticError）与其他读取异常 → 422
              writeJson(response, 422, errorPayload(error));
            }
            return undefined;
          })
          .catch((error: unknown) => {
            writeJson(response, 400, errorPayload(error));
          });
      });
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

    const only = url.searchParams.get("name") ?? undefined;
    void runRouteKitAction(action, only ? { ...options, only } : options)
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
