import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Space, Tag } from "antd";
import { renderIni, type RouteKitProjectConfig } from "@clash-route-kit/core";
import { requestLocalAction, type LocalRouteKitAction } from "../../actions.js";
import {
  createRawUrlTemplates,
  fetchGitRemote,
  fetchPublishStatus,
  parseGitHubRemote,
  type WorkflowRunState,
  type WorkflowRunStatus,
} from "../../publishWorkflow.js";
import { notifyError, notifySuccess } from "../../notify.js";
import { createLineDiff } from "../../yamlDiff.js";
import { UrlRow } from "./UrlRow.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 12;

const workflowStateMeta: Record<WorkflowRunState, { label: string; color: string }> = {
  success: { label: "Actions 成功", color: "success" },
  "in-progress": { label: "Actions 运行中", color: "processing" },
  queued: { label: "Actions 排队中", color: "processing" },
  failed: { label: "Actions 失败", color: "error" },
  unknown: { label: "Actions 状态未知", color: "default" },
  unsupported: { label: "无法查询 Actions", color: "default" },
};

function formatWorkflowTime(iso: string): string {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? iso : new Date(time).toLocaleString();
}

/** GitHub 发布标签页：真实分支流向（仅 main）、提交推送动作、Actions 状态轮询与 INI 变更预览。 */
export function GithubPublishPanel(props: {
  config: RouteKitProjectConfig;
  originalConfig?: RouteKitProjectConfig;
  fetcher?: Fetcher;
}) {
  const fetcher = props.fetcher ?? globalThis.fetch;
  const [repoLabel, setRepoLabel] = useState<string | null>(null);
  const [rawUrl, setRawUrl] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowRunStatus | null>(null);
  const [polling, setPolling] = useState(false);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchGitRemote(fetcher)
      .then((remote) => {
        const repo = parseGitHubRemote(remote);
        if (alive && repo) {
          setRepoLabel(`${repo.owner}/${repo.repo}`);
          setRawUrl(createRawUrlTemplates(repo, props.config.template.output).template);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 推送成功后的 Actions 轮询：每 5s 一次、最多 12 次，success/failed 终态提前结束；卸载即清理。
  useEffect(() => {
    if (!polling) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling]);

  const iniDiff = useMemo(() => {
    const before = renderIni(props.originalConfig ?? props.config);
    const after = renderIni(props.config);
    return createLineDiff(before, after);
  }, [props.config, props.originalConfig]);
  const diffCounts = {
    added: iniDiff.filter((entry) => entry.type === "added").length,
    removed: iniDiff.filter((entry) => entry.type === "removed").length,
  };
  const diffLines = iniDiff.map((entry) => {
    if (entry.type === "added") return `+${entry.text}`;
    if (entry.type === "removed") return `-${entry.text}`;
    return ` ${entry.text}`;
  });

  const branchIsMain = branch === "main";

  async function buildAndPush() {
    setBusy(true);
    try {
      for (const action of ["generate", "git-commit", "git-push"] as LocalRouteKitAction[]) {
        const result = await requestLocalAction(action, fetcher);
        if (!result.ok) {
          notifyError(`${action} 失败：${result.output}`);
          return;
        }
      }
      notifySuccess("已提交并推送 main，等待 GitHub Actions 发布");
      setPollTimedOut(false);
      setPolling(true);
    } catch (error: unknown) {
      notifyError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const workflowMeta = workflow ? workflowStateMeta[workflow.state] : null;

  return (
    <div className="rk-publish-block">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <strong>发布到 GitHub · {props.config.template.output}</strong>
        <span className="rk-lib-meta">可选：仅需要公网 / 跨设备访问时使用</span>
      </div>
      <Space size={12} wrap style={{ marginBottom: 10 }}>
        <span className="rk-lib-meta">
          {repoLabel ? (
            <>
              origin <code>{repoLabel}</code>
            </>
          ) : (
            "未检测到 GitHub origin"
          )}
        </span>
        <span className="rk-lib-meta">
          当前分支{" "}
          <Tag color={branchIsMain ? "success" : branch ? "warning" : "default"} data-testid="publish-branch">
            {branch ?? "未知"}
          </Tag>
        </span>
      </Space>
      {branch && !branchIsMain ? (
        <Alert
          type="warning"
          showIcon
          message="请切换或合并到 main 后发布"
          description="GitHub 发布只会推送 main，publish 分支由 GitHub Actions 生成。"
          style={{ marginBottom: 10 }}
        />
      ) : null}
      {!branch ? (
        <p className="rk-lib-meta" data-testid="publish-branch-unknown">
          无法确认当前分支，发布已暂停；请确认本地服务可用后刷新
        </p>
      ) : null}
      {rawUrl ? (
        <>
          <div className="rk-field-label">
            发布 raw 模板 URL（推送后生效）
            {workflow?.state === "success" ? (
              <Tag color="success" style={{ marginLeft: 8 }} data-testid="publish-raw-latest">
                最新
              </Tag>
            ) : null}
          </div>
          <UrlRow label="发布 raw" url={rawUrl} />
        </>
      ) : (
        <p className="rk-lib-meta">未检测到 GitHub origin，当前仅本机 LAN 可用</p>
      )}
      {workflowMeta && workflow ? (
        <Space size={8} wrap style={{ marginTop: 10 }} data-testid="publish-workflow-status">
          <Tag color={workflowMeta.color}>{workflowMeta.label}</Tag>
          {workflow.createdAt ? <span className="rk-lib-meta">{formatWorkflowTime(workflow.createdAt)}</span> : null}
          {workflow.runUrl ? (
            <a href={workflow.runUrl} target="_blank" rel="noreferrer">
              查看运行
            </a>
          ) : null}
          {polling ? <span className="rk-lib-meta">每 5 秒刷新，最多 12 次</span> : null}
        </Space>
      ) : null}
      {workflow?.state === "failed" ? (
        <Alert
          type="error"
          showIcon
          message="GitHub Actions 发布失败"
          description={workflow.runUrl ? "请打开运行链接查看失败步骤与日志。" : "请到仓库 Actions 页查看失败步骤与日志。"}
          style={{ marginTop: 10 }}
        />
      ) : null}
      {pollTimedOut ? (
        <Alert
          type="warning"
          showIcon
          message="未能在轮询窗口内确认发布结果"
          description="已连续 12 次未查询到终态，请稍后刷新或到 GitHub Actions 页面查看。"
          style={{ marginTop: 10 }}
        />
      ) : null}
      <div style={{ marginTop: 12 }}>
        <Button
          type="primary"
          loading={busy}
          disabled={!branchIsMain}
          data-testid="publish-main-button"
          onClick={() => void buildAndPush()}
        >
          提交并推送 main
        </Button>
        <span className="rk-lib-meta" style={{ marginLeft: 10 }}>
          统一校验 → 提交 → 推送 main，由 GitHub Actions 生成 publish 分支
        </span>
      </div>
      <div style={{ marginTop: 12 }}>
        <div className="rk-field-label">INI 变更预览</div>
        <div className="rk-lib-meta" style={{ marginBottom: 6 }}>
          +{diffCounts.added} / -{diffCounts.removed}
        </div>
        <pre data-testid="publish-ini-preview" className="rk-ini rk-ini-scroll rk-ini-diff">
          {diffCounts.added + diffCounts.removed > 0 ? diffLines.join("\n") : renderIni(props.config)}
        </pre>
      </div>
    </div>
  );
}
