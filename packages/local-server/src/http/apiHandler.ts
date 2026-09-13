import type { IncomingMessage, ServerResponse } from "node:http";
import type { Diagnostic, MigrationPlan, RouteKitProjectConfig } from "@clash-route-kit/core";
import { ConfigDiagnosticError } from "@clash-route-kit/core";
import {
  catalogOriginsFromConfig,
  clearCatalogIndexCache,
  findCatalogPath,
  listCatalogEntriesWithMeta,
  listCatalogSources,
  readCatalogEntry,
  readCatalogEntryDomains,
  readCatalogTemplate,
  searchCatalog,
} from "../catalog/catalog.js";
import type { ProjectOptions, ReadText, WriteText } from "../config/configRepository.js";
import {
  readAuthorProjectFile,
  readProjectConfigFile,
  saveAuthorProject,
  writeProjectConfigFile,
} from "../config/configRepository.js";
import {
  analyzeMigration,
  applyMigration,
} from "../config/migration.js";
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
        // 经 parseAuthorProjectConfig 分发：v1 追加 schemaVersion: 1（原字段不变），
        // v2 返回 { schemaVersion: 2, yaml, mtime }，不再因 v1 严格解析而报错。
        void readAuthorProjectFile(options)
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
            .then(
              () =>
                JSON.parse(body) as {
                  config?: RouteKitProjectConfig;
                  schemaVersion?: unknown;
                  yaml?: unknown;
                },
            )
            .then(async (payload) => {
              // v2 保存：显式 schemaVersion: 2，或无 config 的纯 yaml 文本（由 v2
              // parser 判别顶层 schemaVersion）。解析失败 400 + diagnostics，
              // 校验 error 422 + diagnostics，成功 200。
              if (
                payload.schemaVersion === 2 ||
                (payload.config === undefined && typeof payload.yaml === "string")
              ) {
                if (typeof payload.yaml !== "string") {
                  writeJson(response, 400, { ok: false, output: "Missing v2 config yaml" });
                  return;
                }
                try {
                  const result = await saveAuthorProject({ ...options, yaml: payload.yaml });
                  writeJson(response, result.ok ? 200 : 422, result);
                } catch (error: unknown) {
                  writeJson(response, 400, errorPayload(error));
                }
                return;
              }
              if (!payload.config) {
                throw new Error("Missing config");
              }
              return writeProjectConfigFile({ ...options, config: payload.config });
            })
            .then((result) => {
              if (result !== undefined) {
                writeJson(response, 200, result);
              }
            })
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

    if (url.pathname === "/api/project/migrate" || url.pathname === "/api/project/migrate/apply") {
      if (request.method !== "POST") {
        writeJson(response, 405, { ok: false, output: "Method not allowed" });
        return;
      }

      // analyze 只读、无需请求体：排空 body 后直接执行，避免等待 data/end。
      if (url.pathname === "/api/project/migrate") {
        request.on("data", () => {});
        void analyzeMigration(options)
          .then((analysis) => writeJson(response, 200, analysis))
          .catch((error: unknown) => {
            writeJson(response, 400, errorPayload(error));
          });
        return;
      }

      let body = "";
      request.on("data", (chunk: Buffer) => {
        body += chunk.toString("utf8");
      });
      request.on("end", () => {
        void Promise.resolve()
          .then(() => JSON.parse(body) as { plan?: MigrationPlan })
          .then((payload) => {
            if (!payload.plan) {
              throw new Error("Missing plan");
            }
            return applyMigration({ ...options, plan: payload.plan }).then((result) => {
              // 校验拒绝（ok:false）为可复核的业务失败，用 422 与诊断一同返回。
              writeJson(response, result.ok ? 200 : 422, result);
            });
          })
          .catch((error: unknown) => {
            writeJson(response, 400, errorPayload(error));
          });
      });
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
      void readProjectConfigFile(options)
        .then(({ config }) => listCatalogSources({ ...options, origins: catalogOriginsFromConfig(config) }))
        .then((sources) => writeJson(response, 200, { sources }))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/catalog/entries") {
      const origin = url.searchParams.get("origin") ?? "domain-list-community";
      void readProjectConfigFile(options)
        .then(({ config }) =>
          listCatalogEntriesWithMeta({ ...options, origin, origins: catalogOriginsFromConfig(config) }),
        )
        .then((entries) => writeJson(response, 200, { entries }))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/catalog/entry") {
      const origin = url.searchParams.get("origin") ?? "domain-list-community";
      const name = url.searchParams.get("name") ?? "";
      void readProjectConfigFile(options)
        .then(({ config }) => readCatalogEntry({ ...options, origin, name, origins: catalogOriginsFromConfig(config) }))
        .then((detail) => writeJson(response, 200, detail))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/catalog/domains") {
      const origin = url.searchParams.get("origin") ?? "domain-list-community";
      const name = url.searchParams.get("name") ?? "";
      void readProjectConfigFile(options)
        .then(({ config }) =>
          readCatalogEntryDomains({ ...options, origin, name, origins: catalogOriginsFromConfig(config) }),
        )
        .then((domains) => writeJson(response, 200, { domains }))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/catalog/template") {
      const origin = url.searchParams.get("origin") ?? "";
      const name = url.searchParams.get("name") ?? "";
      void readProjectConfigFile(options)
        .then(({ config }) =>
          readCatalogTemplate({ ...options, origin, name, origins: catalogOriginsFromConfig(config) }),
        )
        .then((template) => writeJson(response, 200, template))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/catalog/search") {
      const origin = url.searchParams.get("origin") ?? "";
      const query = url.searchParams.get("q") ?? "";
      void readProjectConfigFile(options)
        .then(({ config }) =>
          searchCatalog({ ...options, origin, query, origins: catalogOriginsFromConfig(config) }),
        )
        .then((hits) => writeJson(response, 200, { hits }))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }

    if (url.pathname === "/api/catalog/path") {
      const origin = url.searchParams.get("origin") ?? "";
      const name = url.searchParams.get("name") ?? "";
      void readProjectConfigFile(options)
        .then(({ config }) =>
          findCatalogPath({ ...options, origin, name, origins: catalogOriginsFromConfig(config) }),
        )
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
