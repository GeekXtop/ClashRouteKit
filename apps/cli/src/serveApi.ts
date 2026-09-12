import type { IncomingMessage, ServerResponse } from "node:http";
import { checkConfig, generateOutputs, syncVendor, type ProgramOptions } from "./program.js";
import {
  addProjectVendorRepo,
  catalogOriginsFromConfig,
  clearCatalogIndexCache,
  deleteProjectRuleFile,
  findCatalogPath,
  listCatalogEntries,
  listCatalogEntriesWithMeta,
  listCatalogSources,
  listProjectRuleFiles,
  normalizeVendorRepoInput,
  readCatalogEntry,
  readCatalogEntryDomains,
  readCatalogTemplate,
  readGitRemote,
  readProjectConfigFile,
  readProjectRuleFile,
  removeProjectVendorRepo,
  searchCatalog,
  updateProjectVendorRepo,
  writeProjectConfigFile,
  writeProjectRuleFile,
  runRouteKitAction as runRouteKitActionCore,
  type RouteKitAction,
  type RouteKitActionDependencies,
  type RouteKitActionResult,
  type VendorRepoInput,
} from "@clash-route-kit/local-server";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";

export { readProjectConfigFile, writeProjectConfigFile } from "@clash-route-kit/local-server";
export type {
  ProjectConfigFileOptions,
  ProjectConfigFileResult,
  WriteProjectConfigFileOptions,
} from "@clash-route-kit/local-server";

export type {
  CheckConfigFn,
  GenerateOutputsFn,
  GenerateOutputsResult,
  GitRemoteOptions,
  RouteKitActionDependencies,
  RouteKitActionOptions,
  SyncVendorFn,
  VendorSyncActionResult,
} from "@clash-route-kit/local-server";
export type { ReadDirectory, RemovePath } from "@clash-route-kit/local-server";
export { defaultRunCommand } from "@clash-route-kit/local-server";

export type {
  DeleteProjectRuleFileOptions,
  DeleteProjectRuleFileResult,
  ProjectRuleFileOptions,
  ProjectRuleFileResult,
  ProjectRuleFilesOptions,
  WriteProjectRuleFileOptions,
} from "@clash-route-kit/local-server";
export {
  deleteProjectRuleFile,
  listProjectRuleFiles,
  readProjectRuleFile,
  writeProjectRuleFile,
} from "@clash-route-kit/local-server";

export type {
  CatalogEntriesOptions,
  CatalogEntryMeta,
  CatalogEntryOptions,
  CatalogPathOptions,
  CatalogSearchHit,
  CatalogSearchOptions,
  CatalogSourceInfo,
  CatalogSourcesOptions,
} from "@clash-route-kit/local-server";
export {
  catalogOriginsFromConfig,
  clearCatalogIndexCache,
  findCatalogPath,
  listCatalogEntries,
  listCatalogEntriesWithMeta,
  listCatalogSources,
  readCatalogEntry,
  readCatalogEntryDomains,
  readCatalogTemplate,
  searchCatalog,
} from "@clash-route-kit/local-server";

export type {
  VendorRepoInput,
  VendorRepoMutationOptions,
  VendorRepoUpdateResult,
} from "@clash-route-kit/local-server";
export {
  addProjectVendorRepo,
  normalizeVendorRepoInput,
  removeProjectVendorRepo,
  updateProjectVendorRepo,
} from "@clash-route-kit/local-server";

export type { RouteKitAction, RouteKitActionResult };
export { readGitRemote };

/**
 * CLI 组装层：把 program.ts 的默认实现注入 local-server 的 action 编排器，
 * 保持既有"可选注入 + CLI 默认"语义。
 */
export async function runRouteKitAction(
  action: RouteKitAction,
  options: ProgramOptions & RouteKitActionDependencies,
): Promise<RouteKitActionResult> {
  return runRouteKitActionCore(action, {
    ...options,
    checkConfig: options.checkConfig ?? checkConfig,
    generateOutputs: options.generateOutputs ?? generateOutputs,
    syncVendor: options.syncVendor ?? syncVendor,
  });
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
