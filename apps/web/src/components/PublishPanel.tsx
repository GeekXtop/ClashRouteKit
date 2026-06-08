import { Clipboard, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import type { LocalRouteKitAction } from "../actions.js";
import type { SaveReadiness } from "../projectController.js";
import {
  createRawUrlTemplates,
  fetchGitRemote,
  getPublishActionWarning,
  parseGitHubRemote,
  parseGitHubRepo,
  publishActions,
  type ActionStatus,
  type LocalActionStates,
} from "../publishWorkflow.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type PublishMode = "local" | "github";

const actionLabels: Record<LocalRouteKitAction, string> = {
  check: "运行检查",
  generate: "生成输出",
  "git-status": "Git 状态",
  "git-commit": "提交配置",
  "git-push": "推送发布",
};

function stepStatusClass(status: ActionStatus): string {
  if (status === "success") return "done";
  if (status === "running") return "run";
  if (status === "error") return "err";
  return "idle";
}

export function PublishPanel({
  actionStates,
  dirty,
  draftYamlLength,
  fetcher = globalThis.fetch,
  onRun,
  onSave,
  onSetTemplateField,
  projectMessage,
  projectStatus,
  publishBaseUrl,
  saveReadiness,
  template,
}: {
  actionStates: LocalActionStates;
  dirty: boolean;
  draftYamlLength: number;
  fetcher?: Fetcher;
  onRun: (action: LocalRouteKitAction) => void;
  onSave: () => void;
  onSetTemplateField: (patch: Partial<RouteKitProjectConfig["template"]>) => void;
  projectMessage: string;
  projectStatus: string;
  publishBaseUrl: string;
  saveReadiness: SaveReadiness;
  template: RouteKitProjectConfig["template"];
}) {
  const parsedRepo = parseGitHubRepo(publishBaseUrl);
  const [mode, setMode] = useState<PublishMode>(parsedRepo ? "github" : "local");
  const [owner, setOwner] = useState(parsedRepo?.owner ?? "");
  const [repo, setRepo] = useState(parsedRepo?.repo ?? "");
  const [detectMessage, setDetectMessage] = useState("");
  const [copiedUrl, setCopiedUrl] = useState("");
  const [lastAction, setLastAction] = useState<LocalRouteKitAction | null>(null);
  const running = Object.values(actionStates).some((state) => state.status === "running");
  const saving = projectStatus === "saving";
  const saveStepClass = saving ? "run" : projectStatus === "error" ? "err" : dirty ? "idle" : "done";
  const rawUrls =
    owner.trim() && repo.trim()
      ? createRawUrlTemplates({ owner: owner.trim(), repo: repo.trim() }, template.output)
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

  async function detectRepo() {
    setDetectMessage("正在读取 git remote…");
    try {
      const remote = await fetchGitRemote(fetcher);
      const parsed = parseGitHubRemote(remote);
      if (!parsed) {
        setDetectMessage(`无法从 ${remote} 解析 GitHub 仓库`);
        return;
      }
      setOwner(parsed.owner);
      setRepo(parsed.repo);
      setDetectMessage(`已探测：${parsed.owner}/${parsed.repo}`);
    } catch (error: unknown) {
      setDetectMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="panel publish-panel">
      <div className="panel-heading">
        <div>
          <h2>发布工作流</h2>
          <span>目标 → 模板 → 执行 → 产物</span>
        </div>
        <span className={`run-state ${dirty ? "running" : "success"}`}>{dirty ? "dirty" : "clean"}</span>
      </div>

      <div className="local-actions">
        <div className="publish-section">
          <div className="entity-list-header">
            <h3>① 目标</h3>
            <div className="segmented" aria-label="publish mode">
              <button className={mode === "local" ? "active" : ""} type="button" onClick={() => setMode("local")}>
                本地
              </button>
              <button className={mode === "github" ? "active" : ""} type="button" onClick={() => setMode("github")}>
                GitHub
              </button>
            </div>
          </div>
          {mode === "local" ? (
            <p className="operation-hint">
              本地模式：provider 与模板使用 <code>{publishBaseUrl}</code>，由 <code>pnpm serve:output</code> 暴露。
            </p>
          ) : (
            <>
              <div className="repo-inputs">
                <label>
                  <span>Owner</span>
                  <input aria-label="Owner" placeholder="github owner" value={owner} onChange={(event) => setOwner(event.target.value)} />
                </label>
                <label>
                  <span>Repo</span>
                  <input aria-label="Repo" placeholder="repository" value={repo} onChange={(event) => setRepo(event.target.value)} />
                </label>
              </div>
              <div className="action-toolbar">
                <button className="command-button" type="button" onClick={detectRepo}>
                  <Search size={15} /> 自动探测仓库
                </button>
                <span className="operation-hint">发布分支固定为 publish；推送使用本机 Git 凭据。</span>
              </div>
              {detectMessage ? <p className="project-message">{detectMessage}</p> : null}
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
                <div className="empty-state">填写 owner/repo 或点击自动探测以生成 raw 链接</div>
              )}
            </>
          )}
        </div>

        <div className="publish-section">
          <div className="entity-list-header">
            <h3>② 模板</h3>
          </div>
          <div className="repo-inputs">
            <label>
              <span>输出文件名</span>
              <input
                aria-label="模板输出文件名"
                value={template.output}
                onChange={(event) => onSetTemplateField({ output: event.target.value })}
              />
            </label>
            <label>
              <span>clash_rule_base（可选）</span>
              <input
                aria-label="clash rule base"
                value={template.clashRuleBase ?? ""}
                onChange={(event) => onSetTemplateField({ clashRuleBase: event.target.value || undefined })}
              />
            </label>
          </div>
          <div className="action-toolbar">
            <label className="check-line">
              <input
                type="checkbox"
                checked={template.enableRuleGenerator ?? false}
                onChange={(event) => onSetTemplateField({ enableRuleGenerator: event.target.checked })}
              />
              <span>enable_rule_generator</span>
            </label>
            <label className="check-line">
              <input
                type="checkbox"
                checked={template.overwriteOriginalRules ?? false}
                onChange={(event) => onSetTemplateField({ overwriteOriginalRules: event.target.checked })}
              />
              <span>overwrite_original_rules</span>
            </label>
          </div>
        </div>

        <div className="publish-section">
          <div className="entity-list-header">
            <h3>③ 执行</h3>
            <button
              className="command-button primary"
              disabled={saving || !saveReadiness.ok}
              type="button"
              onClick={onSave}
            >
              保存配置
            </button>
          </div>
          <p className="operation-hint">
            将写入 <code>config/routes.yaml</code>，当前草稿 YAML {draftYamlLength} 字符。
            {!saveReadiness.ok ? ` ${saveReadiness.reason}` : ""}
          </p>

          <div className="stepper">
            <button
              type="button"
              className={`nd ${saveStepClass}`}
              disabled={saving}
              onClick={onSave}
            >
              <span className={`dot ${saveStepClass}`}>{saveStepClass === "done" ? "✓" : "1"}</span>
              <span className="nm">保存</span>
            </button>
            {publishActions.map((action, index) => {
              const cls = stepStatusClass(actionStates[action].status);
              return (
                <button
                  key={action}
                  type="button"
                  className={`nd ${cls}`}
                  disabled={running}
                  onClick={() => {
                    setLastAction(action);
                    onRun(action);
                  }}
                >
                  <span className={`dot ${cls}`}>{cls === "done" ? "✓" : index + 2}</span>
                  <span className="nm">{actionLabels[action]}</span>
                </button>
              );
            })}
          </div>

          {lastAction ? (
            <>
              {getPublishActionWarning(lastAction, actionStates) ? (
                <p className="action-warning">{getPublishActionWarning(lastAction, actionStates)}</p>
              ) : null}
              <pre className="action-output action-output-compact">{actionStates[lastAction].output}</pre>
            </>
          ) : (
            <p className={`project-message ${projectStatus}`}>{projectMessage}</p>
          )}
        </div>
      </div>
    </section>
  );
}
