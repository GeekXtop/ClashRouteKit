import {
  CheckCircle2,
  CircleDot,
  FileCode2,
  Layers3,
  ListTree,
  Power,
  Route,
  Settings2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { renderIni, type RouteKitProjectConfig, type RouteModule } from "@clash-route-kit/core";
import { projectConfig } from "./config.js";
import { createPolicyStats, createRouteSummary, type RouteSummaryRow } from "./routeSummary.js";

type ViewMode = "rules" | "ini";

function defaultEnabled(modules: RouteModule[]): Record<string, boolean> {
  return Object.fromEntries(modules.map((module) => [module.id, module.enabled !== false]));
}

function activeProjectConfig(
  config: RouteKitProjectConfig,
  enabled: Record<string, boolean>,
): RouteKitProjectConfig {
  return {
    ...config,
    modules: config.modules.map((module) => ({
      ...module,
      enabled: enabled[module.id],
    })),
  };
}

function ModuleToggle({
  module,
  enabled,
  selected,
  onSelect,
  onToggle,
}: {
  module: RouteModule;
  enabled: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  return (
    <button className={`module-row ${selected ? "selected" : ""}`} type="button" onClick={onSelect}>
      <span className={`status-dot ${enabled ? "active" : "paused"}`} />
      <span className="module-main">
        <span className="module-name">{module.id}</span>
        <span className="module-policy">{module.policy}</span>
      </span>
      <label className="switch" onClick={(event) => event.stopPropagation()}>
        <input checked={enabled} type="checkbox" onChange={onToggle} />
        <span />
      </label>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

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

function TagList({ title, tags }: { title: string; tags: string[] }) {
  return (
    <div className="tag-block">
      <h3>{title}</h3>
      {tags.length > 0 ? (
        <div className="tag-list">
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      ) : (
        <div className="empty-line">无</div>
      )}
    </div>
  );
}

export default function App() {
  const [enabled, setEnabled] = useState(() => defaultEnabled(projectConfig.modules));
  const [selectedModuleId, setSelectedModuleId] = useState(projectConfig.modules[0]?.id ?? "");
  const [viewMode, setViewMode] = useState<ViewMode>("rules");
  const [policyFilter, setPolicyFilter] = useState("全部");

  const config = useMemo(() => activeProjectConfig(projectConfig, enabled), [enabled]);
  const routeRows = useMemo(() => createRouteSummary(config), [config]);
  const policyStats = useMemo(() => createPolicyStats(config), [config]);
  const iniPreview = useMemo(() => renderIni(config), [config]);
  const selectedModule = config.modules.find((module) => module.id === selectedModuleId) ?? config.modules[0];
  const activeRows = policyFilter === "全部" ? routeRows : routeRows.filter((row) => row.policy === policyFilter);
  const enabledCount = config.modules.filter((module) => module.enabled !== false).length;
  const providerCount = config.ruleProviders?.length ?? 0;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Route size={22} />
          </div>
          <div>
            <h1>ClashRouteKit</h1>
            <span>config/modules.yaml</span>
          </div>
        </div>
        <div className="top-actions">
          <div className="status-pill">
            <CheckCircle2 size={16} />
            <span>{enabledCount} active</span>
          </div>
          <div className="segmented" aria-label="preview mode">
            <button className={viewMode === "rules" ? "active" : ""} type="button" onClick={() => setViewMode("rules")}>
              <ListTree size={16} />
              规则
            </button>
            <button className={viewMode === "ini" ? "active" : ""} type="button" onClick={() => setViewMode("ini")}>
              <FileCode2 size={16} />
              INI
            </button>
          </div>
        </div>
      </header>

      <main className="workspace">
        <aside className="panel module-panel">
          <div className="panel-heading">
            <div>
              <h2>模块</h2>
              <span>{config.modules.length} total</span>
            </div>
            <Power size={18} />
          </div>
          <div className="module-list">
            {config.modules.map((module) => (
              <ModuleToggle
                key={module.id}
                enabled={module.enabled !== false}
                module={module}
                selected={selectedModule?.id === module.id}
                onSelect={() => setSelectedModuleId(module.id)}
                onToggle={() =>
                  setEnabled((current) => ({
                    ...current,
                    [module.id]: !current[module.id],
                  }))
                }
              />
            ))}
          </div>
        </aside>

        <section className="main-panel">
          <div className="metrics-grid">
            <Metric label="规则行" value={routeRows.length} />
            <Metric label="策略组" value={config.proxyGroups.length} />
            <Metric label="Providers" value={providerCount} />
            <Metric label="FINAL" value={config.final.policy} />
          </div>

          <div className="panel preview-panel">
            <div className="panel-heading preview-heading">
              <div>
                <h2>{viewMode === "rules" ? "规则顺序" : "INI 预览"}</h2>
                <span>{config.template.output}</span>
              </div>
              {viewMode === "rules" ? (
                <select value={policyFilter} onChange={(event) => setPolicyFilter(event.target.value)}>
                  <option>全部</option>
                  {config.proxyGroups.map((group) => (
                    <option key={group.name}>{group.name}</option>
                  ))}
                </select>
              ) : null}
            </div>
            {viewMode === "rules" ? <RuleTable rows={activeRows} /> : <pre className="ini-preview">{iniPreview}</pre>}
          </div>
        </section>

        <aside className="right-rail">
          <section className="panel detail-panel">
            <div className="panel-heading">
              <div>
                <h2>模块详情</h2>
                <span>{selectedModule?.policy ?? "未选择"}</span>
              </div>
              <CircleDot size={18} />
            </div>
            {selectedModule ? (
              <div className="detail-body">
                <div className="detail-title">
                  <strong>{selectedModule.id}</strong>
                  <span className={selectedModule.enabled === false ? "state paused" : "state active"}>
                    {selectedModule.enabled === false ? "paused" : "active"}
                  </span>
                </div>
                <TagList title="GEOSITE" tags={selectedModule.geosite ?? []} />
                <TagList title="GEOIP" tags={selectedModule.geoip ?? []} />
                <TagList title="Provider" tags={(selectedModule.providers ?? []).map((provider) => provider.file)} />
              </div>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>策略组</h2>
                <span>{policyStats.length} groups</span>
              </div>
              <Settings2 size={18} />
            </div>
            <div className="policy-list">
              {policyStats.map((policy) => (
                <div className="policy-row" key={policy.name}>
                  <span>{policy.name}</span>
                  <small>
                    {policy.modules} modules / {policy.options} options
                  </small>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Provider 输出</h2>
                <span>{providerCount} files</span>
              </div>
              <Layers3 size={18} />
            </div>
            <div className="provider-list">
              {(config.ruleProviders ?? []).map((provider) => (
                <div className="provider-row" key={provider.output}>
                  <strong>{provider.name}</strong>
                  <span>{provider.output}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
