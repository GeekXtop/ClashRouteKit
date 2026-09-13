import { useEffect, useState } from "react";
import {
  createRawUrlTemplates,
  fetchGitRemote,
  fetchPublishStatus,
  parseGitHubRemote,
  type WorkflowRunStatus,
} from "../../publishWorkflow.js";
import { createLocalTemplateUrl } from "./LocalTemplatePanel.js";

export { createLocalTemplateUrl };

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type TemplateProbeResult = "ok" | "unreachable";

export type LocalTemplateProbeState = "checking" | TemplateProbeResult;

export type TemplateSourceChoice = "local" | "remote";

export interface TemplateSourceEndpoint {
  url: string;
  label: string;
}

export interface RemoteTemplateSourceEndpoint extends TemplateSourceEndpoint {
  available: boolean;
  checkedAt?: string;
}

export interface TemplateSources {
  local: TemplateSourceEndpoint;
  remote: RemoteTemplateSourceEndpoint;
}

export const TEMPLATE_SOURCE_LABELS: Record<TemplateSourceChoice, string> = {
  local: "本地实时模板",
  remote: "GitHub 远程模板",
};

export interface ResolveTemplateSourcesInput {
  publishBaseUrl: string;
  templateOutput: string;
  /** GitHub raw 模板 URL（由 git remote 派生）；为空表示尚未发布 */
  remoteTemplateUrl?: string | null;
  /** 仅当 publish workflow 运行 success 时为 true */
  remoteAvailable?: boolean;
  remoteCheckedAt?: string;
}

/** 纯函数：由本地配置与发布状态推导两个模板来源的展示信息与远程可用性。 */
export function resolveTemplateSources(input: ResolveTemplateSourcesInput): TemplateSources {
  const remoteUrl = input.remoteTemplateUrl?.trim() || "";
  return {
    local: {
      url: createLocalTemplateUrl(input.publishBaseUrl, input.templateOutput),
      label: TEMPLATE_SOURCE_LABELS.local,
    },
    remote: {
      url: remoteUrl,
      label: TEMPLATE_SOURCE_LABELS.remote,
      available: Boolean(remoteUrl) && Boolean(input.remoteAvailable),
      ...(input.remoteCheckedAt ? { checkedAt: input.remoteCheckedAt } : {}),
    },
  };
}

export const TEMPLATE_PROBE_TIMEOUT_MS = 4_000;
/** SubConverter 真实转换可能较慢（要回源拉订阅），给宽松超时 */
export const SUBCONVERTER_PROBE_TIMEOUT_MS = 30_000;

/**
 * 只探测 URL 可达性：GET + no-cors，不读取响应内容。
 * 网络失败、超时按 unreachable；CORS 拦截在 no-cors 下不会 reject（opaque 响应），
 * 因此跨源且服务在线时返回 ok —— 这正是“可达性”语义；代价是无法检查状态码。
 */
export async function probeUrl(
  url: string,
  fetchImpl: Fetcher = globalThis.fetch,
  timeoutMs = TEMPLATE_PROBE_TIMEOUT_MS,
): Promise<TemplateProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetchImpl(url, { method: "GET", mode: "no-cors", signal: controller.signal });
    return "ok";
  } catch {
    return "unreachable";
  } finally {
    clearTimeout(timer);
  }
}

/** 模板 URL 可达性探测（约 4s 超时）。 */
export async function probeTemplateUrl(
  url: string,
  fetchImpl: Fetcher = globalThis.fetch,
): Promise<TemplateProbeResult> {
  return probeUrl(url, fetchImpl, TEMPLATE_PROBE_TIMEOUT_MS);
}

const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 12;

export interface TemplateSourceStatusController {
  sources: TemplateSources;
  localStatus: LocalTemplateProbeState;
  repoLabel: string | null;
  rawTemplateUrl: string | null;
  branch: string | null;
  workflow: WorkflowRunStatus | null;
  polling: boolean;
  pollTimedOut: boolean;
  startPolling: () => void;
}

export interface UseTemplateSourceStatusOptions {
  publishBaseUrl: string;
  templateOutput: string;
  fetcher?: Fetcher;
  /**
   * 挂接到 OutputPage 的共享 controller 时传 false：
   * 跳过全部抓取/探测副作用，由共享实例喂数据，避免两标签重复请求。
   */
  enabled?: boolean;
}

/**
 * TemplateSourceStatus 的唯一数据源 hook：
 * - 本地模板 URL 可达性：探测（localUrl 变化才重探，天然防抖）；
 * - 远程模板 URL：由 git remote 派生；可用性由 publish-status 的 workflow success 推导；
 * - 推送后的 Actions 轮询也归本 hook 持有，GitHub 发布标签只消费结果。
 */
export function useTemplateSourceStatus(
  options: UseTemplateSourceStatusOptions,
): TemplateSourceStatusController {
  const { publishBaseUrl, templateOutput, enabled = true } = options;
  const fetcher = options.fetcher ?? globalThis.fetch;
  const localUrl = createLocalTemplateUrl(publishBaseUrl, templateOutput);

  const [localStatus, setLocalStatus] = useState<LocalTemplateProbeState>("checking");
  const [repoLabel, setRepoLabel] = useState<string | null>(null);
  const [rawTemplateUrl, setRawTemplateUrl] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowRunStatus | null>(null);
  const [polling, setPolling] = useState(false);
  const [pollTimedOut, setPollTimedOut] = useState(false);

  // 本地实时模板可达性：URL 变化才重新探测（防抖边界即 localUrl 本身）。
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setLocalStatus("checking");
    void probeTemplateUrl(localUrl, fetcher).then((result) => {
      if (alive) setLocalStatus(result);
    });
    return () => {
      alive = false;
    };
  }, [enabled, localUrl, fetcher]);

  // git remote + publish-status 的唯一抓取点：设备配置与 GitHub 发布共用本 controller。
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void fetchGitRemote(fetcher)
      .then((remote) => {
        const repo = parseGitHubRemote(remote);
        if (alive && repo) {
          setRepoLabel(`${repo.owner}/${repo.repo}`);
          setRawTemplateUrl(createRawUrlTemplates(repo, templateOutput).template);
        }
      })
      .catch(() => {});
    void fetchPublishStatus(fetcher)
      .then((status) => {
        if (!alive) return;
        setBranch(status.branch);
        setWorkflow(status.workflow);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled, fetcher, templateOutput]);

  // 推送成功后的 Actions 轮询：每 5s 一次、最多 12 次，success/failed 终态提前结束；卸载即清理。
  useEffect(() => {
    if (!enabled || !polling) return;
    let alive = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      attempts += 1;
      try {
        const status = await fetchPublishStatus(fetcher);
        if (!alive) return;
        setBranch(status.branch);
        setWorkflow(status.workflow);
        if (status.workflow.state === "success" || status.workflow.state === "failed") {
          setPolling(false);
          return;
        }
      } catch {
        // 单次查询失败继续轮询，由次数上限收敛
      }
      if (!alive) return;
      if (attempts >= MAX_POLLS) {
        setPolling(false);
        setPollTimedOut(true);
        return;
      }
      timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    };
    timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, polling, fetcher]);

  const sources = resolveTemplateSources({
    publishBaseUrl,
    templateOutput,
    remoteTemplateUrl: rawTemplateUrl,
    remoteAvailable: workflow?.state === "success",
    remoteCheckedAt: workflow?.createdAt,
  });

  return {
    sources,
    localStatus,
    repoLabel,
    rawTemplateUrl,
    branch,
    workflow,
    polling,
    pollTimedOut,
    startPolling: () => {
      setPollTimedOut(false);
      setPolling(true);
    },
  };
}
