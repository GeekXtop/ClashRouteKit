import { FileCode2, ListTree } from "lucide-react";
import type { RouteSummaryRow } from "../routeSummary.js";

export type PreviewMode = "rules" | "ini";

function RuleBadge({ row }: { row: RouteSummaryRow }) {
  const tone = row.source.includes("FINAL") ? "final" : row.source.includes("GEOIP") ? "geoip" : "domain";
  return <span className={`rule-badge ${tone}`}>{row.enabled ? "enabled" : "disabled"}</span>;
}

function RuleTable({ rows }: { rows: RouteSummaryRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>顺序</th>
            <th>状态</th>
            <th>ruleset</th>
            <th>目标 custom_proxy_group</th>
            <th>source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.id}-${index}`}>
              <td className="order-cell">{index + 1}</td>
              <td>
                <RuleBadge row={row} />
              </td>
              <td className="value-cell">{row.output}</td>
              <td>{row.policy}</td>
              <td>{row.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PreviewWorkspace({
  customProxyGroupFilter,
  customProxyGroups,
  iniPreview,
  mode,
  onCustomProxyGroupFilterChange,
  onModeChange,
  rows,
}: {
  customProxyGroupFilter: string;
  customProxyGroups: string[];
  iniPreview: string;
  mode: PreviewMode;
  onCustomProxyGroupFilterChange: (value: string) => void;
  onModeChange: (mode: PreviewMode) => void;
  rows: RouteSummaryRow[];
}) {
  const activeRows = customProxyGroupFilter === "全部" ? rows : rows.filter((row) => row.policy === customProxyGroupFilter);

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
            <select value={customProxyGroupFilter} onChange={(event) => onCustomProxyGroupFilterChange(event.target.value)}>
              <option>全部</option>
              {customProxyGroups.map((group) => (
                <option key={group}>{group}</option>
              ))}
            </select>
          ) : null}
        </div>
      </div>
      {mode === "rules" ? <RuleTable rows={activeRows} /> : <pre className="ini-preview">{iniPreview}</pre>}
    </section>
  );
}
