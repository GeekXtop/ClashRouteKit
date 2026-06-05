import { FileCode2, ListTree } from "lucide-react";
import type { RouteSummaryRow } from "../routeSummary.js";

export type PreviewMode = "rules" | "ini";

function RuleBadge({ row }: { row: RouteSummaryRow }) {
  const tone = row.source === "FINAL" ? "final" : row.source === "GEOIP" ? "geoip" : "domain";
  return <span className={`rule-badge ${tone}`}>{row.source}</span>;
}

function RuleTable({ rows }: { rows: RouteSummaryRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>顺序</th>
            <th>模块</th>
            <th>来源</th>
            <th>值</th>
            <th>策略</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.moduleId}-${row.source}-${row.value}-${index}`}>
              <td className="order-cell">{index + 1}</td>
              <td>{row.moduleId}</td>
              <td>
                <RuleBadge row={row} />
              </td>
              <td className="value-cell">{row.value}</td>
              <td>{row.policy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PreviewWorkspace({
  iniPreview,
  mode,
  onModeChange,
  onPolicyFilterChange,
  policies,
  policyFilter,
  rows,
}: {
  iniPreview: string;
  mode: PreviewMode;
  onModeChange: (mode: PreviewMode) => void;
  onPolicyFilterChange: (value: string) => void;
  policies: string[];
  policyFilter: string;
  rows: RouteSummaryRow[];
}) {
  const activeRows = policyFilter === "全部" ? rows : rows.filter((row) => row.policy === policyFilter);

  return (
    <section className="panel preview-panel">
      <div className="panel-heading preview-heading">
        <div>
          <h2>{mode === "rules" ? "规则顺序" : "INI 预览"}</h2>
          <span>{mode === "rules" ? `${activeRows.length} rows` : `${iniPreview.length} chars`}</span>
        </div>
        <div className="preview-controls">
          <div className="segmented" aria-label="preview mode">
            <button className={mode === "rules" ? "active" : ""} type="button" onClick={() => onModeChange("rules")}>
              <ListTree size={16} />
              规则
            </button>
            <button className={mode === "ini" ? "active" : ""} type="button" onClick={() => onModeChange("ini")}>
              <FileCode2 size={16} />
              INI
            </button>
          </div>
          {mode === "rules" ? (
            <select value={policyFilter} onChange={(event) => onPolicyFilterChange(event.target.value)}>
              <option>全部</option>
              {policies.map((policy) => (
                <option key={policy}>{policy}</option>
              ))}
            </select>
          ) : null}
        </div>
      </div>
      {mode === "rules" ? <RuleTable rows={activeRows} /> : <pre className="ini-preview">{iniPreview}</pre>}
    </section>
  );
}
