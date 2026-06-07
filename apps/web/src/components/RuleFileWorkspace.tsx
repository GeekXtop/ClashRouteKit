import { RefreshCw } from "lucide-react";

export interface RuleFileState {
  files: string[];
  selectedFile: string;
  text: string;
  status: "idle" | "loading" | "saving" | "error";
  message: string;
}

export function RuleFileWorkspace({
  ruleFileState,
  onLoadFile,
  onRefreshFiles,
  onSaveFile,
  onTextChange,
}: {
  ruleFileState: RuleFileState;
  onLoadFile: (file: string) => void;
  onRefreshFiles: () => void;
  onSaveFile: () => void;
  onTextChange: (text: string) => void;
}) {
  return (
    <div className="entity-workspace">
      <aside className="entity-list">
        <div className="entity-list-header">
          <div>
            <h2>规则文件</h2>
            <span>{ruleFileState.files.length} files</span>
          </div>
          <button className="icon-button" type="button" aria-label="refresh rule files" onClick={onRefreshFiles}>
            <RefreshCw size={16} />
          </button>
        </div>
        <div className="entity-items">
          {ruleFileState.files.map((file) => (
            <button
              className={`entity-row ${file === ruleFileState.selectedFile ? "active" : ""}`}
              key={file}
              type="button"
              onClick={() => onLoadFile(file)}
            >
              <strong>{file}</strong>
              <span>config/rules/{file}</span>
            </button>
          ))}
          {ruleFileState.files.length === 0 ? <div className="empty-state">暂无 .list 文件</div> : null}
        </div>
      </aside>
      <section className="panel editor-panel">
        <div className="panel-heading">
          <div>
            <h2>编辑规则文件</h2>
            <span>{ruleFileState.selectedFile || "未选择"}</span>
          </div>
          <button
            className="command-button primary"
            disabled={!ruleFileState.selectedFile || ruleFileState.status === "saving"}
            type="button"
            onClick={onSaveFile}
          >
            保存规则文件
          </button>
        </div>
        <p className={`project-message ${ruleFileState.status}`}>{ruleFileState.message}</p>
        <textarea
          className="rule-file-editor"
          disabled={!ruleFileState.selectedFile}
          spellCheck={false}
          value={ruleFileState.text}
          onChange={(event) => onTextChange(event.target.value)}
        />
      </section>
    </div>
  );
}
