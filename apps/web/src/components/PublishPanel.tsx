import { Clipboard, Play } from "lucide-react";
import { useEffect, useState } from "react";
import type { LocalRouteKitAction } from "../actions.js";
import type { SaveReadiness } from "../projectController.js";
import {
  createRawUrlTemplates,
  getPublishActionWarning,
  parseGitHubRepo,
  publishActions,
  type ActionStatus,
  type LocalActionStates,
} from "../publishWorkflow.js";

const actionLabels: Record<LocalRouteKitAction, string> = {
  check: "运行检查",
  generate: "生成输出",
  "git-status": "Git 状态",
  "git-commit": "提交配置",
  "git-push": "推送发布",
};

function statusLabel(status: ActionStatus): string {
  if (status === "running") return "运行中";
  if (status === "success") return "通过";
  if (status === "error") return "失败";
  return "未运行";
}

export function PublishPanel({
  actionStates,
  dirty,
  draftYamlLength,
  onRun,
  onSave,
  projectMessage,
  projectStatus,
  publishBaseUrl,
  saveReadiness,
  templateOutput,
}: {
  actionStates: LocalActionStates;
  dirty: boolean;
  draftYamlLength: number;
  onRun: (action: LocalRouteKitAction) => void;
  onSave: () => void;
  projectMessage: string;
  projectStatus: string;
  publishBaseUrl: string;
  saveReadiness: SaveReadiness;
  templateOutput: string;
}) {
  const parsedRepo = parseGitHubRepo(publishBaseUrl);
  const [owner, setOwner] = useState(parsedRepo?.owner ?? "");
  const [repo, setRepo] = useState(parsedRepo?.repo ?? "");
  const [copiedUrl, setCopiedUrl] = useState("");
  const running = Object.values(actionStates).some((state) => state.status === "running");
  const saving = projectStatus === "saving";
  const rawUrls = owner.trim() && repo.trim()
    ? createRawUrlTemplates({ owner: owner.trim(), repo: repo.trim() }, templateOutput)
    : undefined;

  useEffect(() => {
    if (!parsedRepo) return;
    setOwner(parsedRepo.owner);
    setRepo(parsedRepo.repo);
  }, [parsedRepo?.owner, parsedRepo?.repo]);

  async function copyUrl(value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedUrl(value);
  }

  return (
    <section className="panel publish-panel">
      <div className="panel-heading">
        <div>
          <h2>发布工作流</h2>
          <span>Save -&gt; Check -&gt; Generate -&gt; Git Status -&gt; Commit -&gt; Push</span>
        </div>
        <span className={`run-state ${dirty ? "running" : "success"}`}>{dirty ? "dirty" : "clean"}</span>
      </div>
      <div className="local-actions">
        <div className="publish-save-row">
          <button
            className="command-button primary"
            disabled={saving || !saveReadiness.ok}
            type="button"
            onClick={onSave}
          >
            保存配置
          </button>
          <p className={`project-message ${projectStatus}`}>{projectMessage}</p>
        </div>
        <p className="operation-hint">
          将写入 <code>config/routes.yaml</code>，当前草稿 YAML {draftYamlLength} 字符。
          {!saveReadiness.ok ? ` ${saveReadiness.reason}` : ""}
        </p>

        <div className="publish-sequence">
          {publishActions.map((action, index) => {
            const state = actionStates[action];
            const warning = getPublishActionWarning(action, actionStates);
            return (
              <div className="publish-step" key={action}>
                <div className="publish-step-header">
                  <span className="step-index">{index + 1}</span>
                  <strong>{actionLabels[action]}</strong>
                  <span className={`run-state ${state.status}`}>{statusLabel(state.status)}</span>
                  <button className="command-button" disabled={running} type="button" onClick={() => onRun(action)}>
                    <Play size={16} />
                    运行
                  </button>
                </div>
                {warning ? <p className="action-warning">{warning}</p> : null}
                {action === "git-push" ? <p className="operation-hint">推送使用本机 Git 凭据；浏览器不保存 GitHub token。</p> : null}
                <pre className="action-output action-output-compact">{state.output}</pre>
              </div>
            );
          })}
        </div>

        <div className="raw-url-panel">
          <div className="panel-heading compact-heading">
            <div>
              <h2>Raw URL 模板</h2>
              <span>发布分支固定为 publish</span>
            </div>
          </div>
          <div className="repo-inputs">
            <label>
              <span>Owner</span>
              <input placeholder="github owner" value={owner} onChange={(event) => setOwner(event.target.value)} />
            </label>
            <label>
              <span>Repo</span>
              <input placeholder="repository" value={repo} onChange={(event) => setRepo(event.target.value)} />
            </label>
          </div>
          {rawUrls ? (
            <div className="raw-url-list">
              {Object.entries(rawUrls).map(([name, value]) => (
                <div className="raw-url-row" key={name}>
                  <span>{name}</span>
                  <code>{value}</code>
                  <button className="icon-button" type="button" aria-label={`copy ${name}`} onClick={() => copyUrl(value)}>
                    <Clipboard size={16} />
                  </button>
                  {copiedUrl === value ? <small>已复制</small> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">输入 GitHub owner/repo 后生成可复制 raw 链接</div>
          )}
        </div>
      </div>
    </section>
  );
}
