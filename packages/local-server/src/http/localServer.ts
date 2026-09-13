import type { IncomingMessage, ServerResponse } from "node:http";
import type { ProjectOptions } from "../config/configRepository.js";
import type { CheckConfigFn, GenerateOutputsFn, SyncVendorFn } from "../git/gitActions.js";
import { createRouteKitApiHandler, type ApiHandlerOptions } from "./apiHandler.js";
import { createHostingHandler, type HostingOptions } from "./hostingHandler.js";

export type LocalServerMiddleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => void;

export interface LocalServerContextOptions extends ProjectOptions {
  publicBase: string;
  webRoot?: string;
  checkConfig?: CheckConfigFn;
  generateOutputs?: GenerateOutputsFn;
  syncVendor?: SyncVendorFn;
}

export interface LocalServerContext {
  apiHandler: LocalServerMiddleware;
  hostingHandler: LocalServerMiddleware;
}

/**
 * 组合入口：给定项目定位与可选 use case 实现，返回一组可按序挂到
 * HTTP 服务器（或 vite 中间件）上的 handler。调用方负责先 hosting 再 api
 * 的挂载顺序（hosting 对 /api/* 放行到 next）。
 */
export function createLocalServerContext(options: LocalServerContextOptions): LocalServerContext {
  const { publicBase, webRoot, ...rest } = options;
  const hostingOptions: HostingOptions = { ...rest, publicBase, webRoot };
  const apiOptions: ApiHandlerOptions = rest;
  return {
    hostingHandler: createHostingHandler(hostingOptions),
    apiHandler: createRouteKitApiHandler(apiOptions),
  };
}
