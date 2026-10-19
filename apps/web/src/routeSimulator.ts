import type { Diagnostic, SimulateRouteResult } from "@clash-route-kit/core";
import type { Fetcher } from "./fetcher.js";
import { authorizedFetch } from "./apiClient.js";

/** 服务端拒绝（4xx）时携带结构化诊断，供面板展示原因明细。 */
export class SimulateRejection extends Error {
  readonly diagnostics: Diagnostic[];

  constructor(message: string, diagnostics: Diagnostic[] = []) {
    super(message);
    this.name = "SimulateRejection";
    this.diagnostics = diagnostics;
  }
}

/**
 * 命中模拟 API 封装：yaml 未传时服务端按磁盘 routes.yaml 评估；
 * 传入草稿 yaml 则按提交文本评估（不落盘）。失败抛 SimulateRejection。
 */
export async function simulateRouteHit(
  domain: string,
  yaml: string | undefined,
  fetcher: Fetcher = authorizedFetch,
): Promise<SimulateRouteResult> {
  const response = await fetcher("/api/route-simulate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(yaml === undefined ? { domain } : { domain, yaml }),
  });
  let payload: { ok?: boolean; result?: SimulateRouteResult; output?: string; diagnostics?: Diagnostic[] };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new Error("模拟请求响应异常");
  }
  if (!response.ok || !payload.ok || !payload.result) {
    throw new SimulateRejection(payload.output ?? "模拟请求失败", payload.diagnostics ?? []);
  }
  return payload.result;
}
