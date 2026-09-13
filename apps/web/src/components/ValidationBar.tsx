import { CircleAlert, CircleCheck } from "lucide-react";
import type { Diagnostic } from "@clash-route-kit/core";

const SEVERITY_LABELS: Record<Diagnostic["severity"], string> = {
  error: "错误",
  warning: "警告",
  info: "提示",
};

const SEVERITIES = ["error", "warning", "info"] as const;

function diagnosticText(diagnostic: Diagnostic): string {
  return `[${diagnostic.code}] ${diagnostic.path ?? ""} ${diagnostic.message}`.replace(/\s+/g, " ").trim();
}

/** 页顶校验汇总条：error/warning/info 计数 + 可定位诊断列表；状态以文字+图标表达，不单靠颜色。 */
export function ValidationBar(props: {
  diagnostics: readonly Diagnostic[];
  canLocate: (diagnostic: Diagnostic) => boolean;
  onLocate: (diagnostic: Diagnostic) => void;
}) {
  if (props.diagnostics.length === 0) {
    return (
      <div className="rk-validation ok" role="status">
        <CircleCheck size={14} aria-hidden />
        <span>校验通过：无错误、无警告</span>
      </div>
    );
  }

  const counts: Record<Diagnostic["severity"], number> = { error: 0, warning: 0, info: 0 };
  for (const diagnostic of props.diagnostics) {
    counts[diagnostic.severity] += 1;
  }
  const summary = SEVERITIES.map(
    (severity) => `${counts[severity]} ${SEVERITY_LABELS[severity]}`,
  ).join(" · ");

  return (
    <div className="rk-validation issues" role="status">
      <div className="rk-validation-head">
        <CircleAlert size={14} aria-hidden />
        <span>校验结果：{summary}</span>
      </div>
      <ul className="rk-validation-list">
        {props.diagnostics.map((diagnostic, index) => {
          const label = SEVERITY_LABELS[diagnostic.severity];
          const text = diagnosticText(diagnostic);
          return (
            <li
              key={`${diagnostic.code}-${index}`}
              className={`rk-validation-item ${diagnostic.severity}`}
            >
              {props.canLocate(diagnostic) ? (
                <button
                  type="button"
                  className="rk-validation-locate"
                  title="点击定位到对应行"
                  onClick={() => props.onLocate(diagnostic)}
                >
                  <span className="rk-validation-sev">{label}</span>
                  <span className="rk-validation-text">{text}</span>
                </button>
              ) : (
                <span className="rk-validation-plain">
                  <span className="rk-validation-sev">{label}</span>
                  <span className="rk-validation-text">{text}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
