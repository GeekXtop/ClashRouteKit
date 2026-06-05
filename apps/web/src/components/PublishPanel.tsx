import { Play } from "lucide-react";
import type { LocalRouteKitAction } from "../actions.js";
import type { SaveReadiness } from "../projectController.js";

export type ActionStatus = "idle" | "running" | "success" | "error";

export interface LocalActionState {
  status: ActionStatus;
  action?: LocalRouteKitAction;
  output: string;
}

function statusLabel(status: ActionStatus): string {
  if (status === "running") return "运行中";
  if (status === "success") return "通过";
  if (status === "error") return "失败";
  return "未运行";
}

export function PublishPanel({
  actionState,
  dirty,
  draftYamlLength,
  onRun,
  onSave,
  projectMessage,
  projectStatus,
  saveReadiness,
}: {
  actionState: LocalActionState;
  dirty: boolean;
  draftYamlLength: number;
  onRun: (action: LocalRouteKitAction) => void;
  onSave: () => void;
  projectMessage: string;
  projectStatus: string;
  saveReadiness: SaveReadiness;
}) {
  const running = actionState.status === "running";
  const saving = projectStatus === "saving";

  return (
    <section className="panel publish-panel">
      <div className="panel-heading">
        <div>
          <h2>发布工作流</h2>
          <span>Save -&gt; Check -&gt; Generate -&gt; Commit -&gt; Push</span>
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
          将写入 <code>config/modules.yaml</code>，当前草稿 YAML {draftYamlLength} 字符。
          {!saveReadiness.ok ? ` ${saveReadiness.reason}` : ""}
        </p>
        <div className="action-toolbar">
          <button className="command-button" disabled={running} type="button" onClick={() => onRun("check")}>
            <Play size={16} />
            运行检查
          </button>
          <button className="command-button" disabled={running} type="button" onClick={() => onRun("generate")}>
            <Play size={16} />
            生成输出
          </button>
          <button className="command-button" disabled={running} type="button" onClick={() => onRun("git-status")}>
            <Play size={16} />
            Git 状态
          </button>
          <button className="command-button" disabled={running} type="button" onClick={() => onRun("git-commit")}>
            <Play size={16} />
            提交配置
          </button>
          <button className="command-button" disabled={running} type="button" onClick={() => onRun("git-push")}>
            <Play size={16} />
            推送发布
          </button>
          <span className={`run-state ${actionState.status}`}>{statusLabel(actionState.status)}</span>
        </div>
        <p className="operation-hint">
          推送使用本机 Git 凭据；浏览器不保存 GitHub token。自动 QA 不会点击提交和推送。
        </p>
        <pre className="action-output">{actionState.output}</pre>
      </div>
    </section>
  );
}
