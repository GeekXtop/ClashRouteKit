import type { SimulateRouteResult } from "@clash-route-kit/core";
import { authorizedFetch } from "./apiClient.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * 命中模拟 API 封装：yaml 未传时服务端按磁盘 routes.yaml 评估；
 * 传入草稿 yaml 则按提交文本评估（不落盘）。失败抛 Error（output 文案）。
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
  let payload: { ok?: boolean; result?: SimulateRouteResult; output?: string };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new Error("模拟请求响应异常");
  }
  if (!response.ok || !payload.ok || !payload.result) {
    throw new Error(payload.output ?? "模拟请求失败");
  }
  return payload.result;
}
