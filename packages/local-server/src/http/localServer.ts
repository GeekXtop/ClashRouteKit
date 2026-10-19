import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createDefaultDependencies } from "../dependencies.js";
import type { ProjectOptions } from "../config/configRepository.js";
import type { CheckConfigFn, GenerateOutputsFn, SyncVendorFn } from "../git/gitActions.js";
import { createRouteKitApiHandler, type ApiHandlerOptions } from "./apiHandler.js";
import { createHostingHandler, type HostingOptions } from "./hostingHandler.js";
import { createConnectionGuard, type ConnectionGuard } from "./connectionGuard.js";

export type LocalServerMiddleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => void;

export interface LocalServerContextOptions extends ProjectOptions {
  publicBase: string;
  webRoot?: string;
  /** 绑定地址（CLI --host）；通配值不进守卫白名单。 */
  serveHost?: string;
  checkConfig?: CheckConfigFn;
  generateOutputs?: GenerateOutputsFn;
  syncVendor?: SyncVendorFn;
}

export interface LocalServerContext {
  apiHandler: LocalServerMiddleware;
  hostingHandler: LocalServerMiddleware;
  /** 连接校验（Host 白名单 / 同源 / token），必须最先挂载。 */
  connectionGuard: ConnectionGuard;
  /** 本次服务启动的访问 token，已注入 hosting 返回的 html。 */
  token: string;
}

/**
 * 组合入口：给定项目定位与可选 use case 实现，返回一组可按序挂到
 * HTTP 服务器（或 vite 中间件）上的 handler。调用方负责挂载顺序
 * connectionGuard → hosting → api（hosting 对 /api/* 放行到 next）。
 * check/generate/syncVendor 缺省由 createDefaultDependencies 提供，
 * vite dev 等未注入实现的组装方也能执行全部动作；显式传入仍覆盖默认。
 */
export function createLocalServerContext(options: LocalServerContextOptions): LocalServerContext {
  const { publicBase, webRoot, serveHost, ...rest } = options;
  const token = randomBytes(32).toString("hex");
  const defaults = createDefaultDependencies(options.root, options.configFile);
  const hostingOptions: HostingOptions = { ...rest, publicBase, webRoot, htmlToken: token };
  const apiOptions: ApiHandlerOptions = {
    ...rest,
    checkConfig: rest.checkConfig ?? defaults.checkConfig,
    generateOutputs: rest.generateOutputs ?? defaults.generateOutputs,
    syncVendor: rest.syncVendor ?? defaults.syncVendor,
  };
  return {
    hostingHandler: createHostingHandler(hostingOptions),
    apiHandler: createRouteKitApiHandler(apiOptions),
    connectionGuard: createConnectionGuard({
      token,
      serveHost,
      publicBaseUrl: publicBase,
    }),
    token,
  };
}
