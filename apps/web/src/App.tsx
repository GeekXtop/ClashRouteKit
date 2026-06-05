import {
  CheckCircle2,
  CircleDot,
  Clipboard,
  FileCode2,
  Layers3,
  Link2,
  ListTree,
  Play,
  Plus,
  Power,
  Route,
  Settings2,
  Terminal,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { renderIni, type RouteKitProjectConfig, type RouteModule } from "@clash-route-kit/core";
import { requestLocalAction, type LocalRouteKitAction } from "./actions.js";
import { projectConfig } from "./config.js";
import { createPolicyStats, createRouteSummary, type RouteSummaryRow } from "./routeSummary.js";
import {
  buildSubconverterUrl,
  parseProviderLines,
  type ProviderSubscription,
} from "./subscriptions.js";

type ViewMode = "rules" | "ini" | "subscriptions" | "actions";
type ActionStatus = "idle" | "running" | "success" | "error";

interface LocalActionState {
  status: ActionStatus;
  action?: LocalRouteKitAction;
  output: string;
}

const subscriptionStorageKey = "clash-route-kit-subscriptions";
const defaultSubconverterEndpoint = "10.0.0.3:25500";

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

function isProviderSubscription(value: unknown): value is ProviderSubscription {
  const candidate = value as ProviderSubscription;
  return (
    typeof candidate?.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.url === "string" &&
    typeof candidate.enabled === "boolean"
  );
}

function loadSubscriptions(): ProviderSubscription[] {
  if (typeof window === "undefined") return [];
  const text = window.localStorage.getItem(subscriptionStorageKey);
  if (!text) return [];

  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isProviderSubscription) : [];
  } catch {
    return [];
  }
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

function IconButton({
  label,
  title,
  onClick,
  children,
}: {
  label: string;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button aria-label={label} className="icon-button" title={title} type="button" onClick={onClick}>
      {children}
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

function statusLabel(status: ActionStatus): string {
  if (status === "running") return "运行中";
  if (status === "success") return "通过";
  if (status === "error") return "失败";
  return "未运行";
}

function LocalActionsPanel({
  actionState,
  onRun,
}: {
  actionState: LocalActionState;
  onRun: (action: LocalRouteKitAction) => void;
}) {
  const running = actionState.status === "running";

  return (
    <div className="local-actions">
      <div className="action-toolbar">
        <button className="command-button" disabled={running} type="button" onClick={() => onRun("check")}>
          <Play size={16} />
          运行检查
        </button>
        <button className="command-button" disabled={running} type="button" onClick={() => onRun("generate")}>
          <Play size={16} />
          生成输出
        </button>
        <span className={`run-state ${actionState.status}`}>{statusLabel(actionState.status)}</span>
      </div>
      <pre className="action-output">{actionState.output}</pre>
    </div>
  );
}

function SubscriptionPanel({
  providers,
  endpoint,
  outputUrl,
  copied,
  onAdd,
  onCopy,
  onEndpointChange,
  onImport,
  onRemove,
  onUpdate,
}: {
  providers: ProviderSubscription[];
  endpoint: string;
  outputUrl: string;
  copied: boolean;
  onAdd: () => void;
  onCopy: () => void;
  onEndpointChange: (value: string) => void;
  onImport: (value: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<ProviderSubscription>) => void;
}) {
  const [importText, setImportText] = useState("");
  const activeProviders = providers.filter((provider) => provider.enabled && provider.url.trim()).length;

  return (
    <div className="subscription-editor">
      <div className="subscription-toolbar">
        <label>
          <span>Endpoint</span>
          <input value={endpoint} onChange={(event) => onEndpointChange(event.target.value)} />
        </label>
        <button className="command-button" type="button" onClick={onAdd}>
          <Plus size={16} />
          添加
        </button>
      </div>

      <div className="subscription-import">
        <textarea
          rows={4}
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          placeholder="provider:name,https://example.com/subscribe"
        />
        <button
          className="command-button"
          type="button"
          onClick={() => {
            onImport(importText);
            setImportText("");
          }}
        >
          <Link2 size={16} />
          导入
        </button>
      </div>

      <div className="subscription-list">
        {providers.map((provider) => (
          <div className="subscription-row" key={provider.id}>
            <label className="check-cell">
              <input
                checked={provider.enabled}
                type="checkbox"
                onChange={(event) => onUpdate(provider.id, { enabled: event.target.checked })}
              />
            </label>
            <input
              aria-label="provider name"
              className="name-input"
              value={provider.name}
              onChange={(event) => onUpdate(provider.id, { name: event.target.value })}
            />
            <input
              aria-label="subscription url"
              className="url-input"
              value={provider.url}
              onChange={(event) => onUpdate(provider.id, { url: event.target.value })}
            />
            <IconButton label="remove provider" title="删除" onClick={() => onRemove(provider.id)}>
              <Trash2 size={16} />
            </IconButton>
          </div>
        ))}
        {providers.length === 0 ? <div className="empty-state">暂无订阅</div> : null}
      </div>

      <div className="generated-url">
        <div>
          <strong>SubConverter URL</strong>
          <span>{activeProviders} active</span>
        </div>
        <button className="command-button" disabled={!outputUrl} type="button" onClick={onCopy}>
          <Clipboard size={16} />
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <textarea className="url-output" readOnly rows={5} value={outputUrl} />
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
  const [subscriptions, setSubscriptions] = useState(loadSubscriptions);
  const [subconverterEndpoint, setSubconverterEndpoint] = useState(defaultSubconverterEndpoint);
  const [copied, setCopied] = useState(false);
  const [actionState, setActionState] = useState<LocalActionState>({
    status: "idle",
    output: "尚未运行本地命令",
  });

  const config = useMemo(() => activeProjectConfig(projectConfig, enabled), [enabled]);
  const routeRows = useMemo(() => createRouteSummary(config), [config]);
  const policyStats = useMemo(() => createPolicyStats(config), [config]);
  const iniPreview = useMemo(() => renderIni(config), [config]);
  const selectedModule = config.modules.find((module) => module.id === selectedModuleId) ?? config.modules[0];
  const activeRows = policyFilter === "全部" ? routeRows : routeRows.filter((row) => row.policy === policyFilter);
  const enabledCount = config.modules.filter((module) => module.enabled !== false).length;
  const providerCount = config.ruleProviders?.length ?? 0;
  const subconverterUrl = useMemo(() => {
    const hasProvider = subscriptions.some((provider) => provider.enabled && provider.name.trim() && provider.url.trim());
    if (!hasProvider) return "";
    return buildSubconverterUrl({
      providers: subscriptions,
      publishBaseUrl: config.publishBaseUrl,
      templateOutput: config.template.output,
      endpoint: subconverterEndpoint,
    });
  }, [config.publishBaseUrl, config.template.output, subconverterEndpoint, subscriptions]);

  useEffect(() => {
    window.localStorage.setItem(subscriptionStorageKey, JSON.stringify(subscriptions));
  }, [subscriptions]);

  function updateSubscription(id: string, patch: Partial<ProviderSubscription>) {
    setSubscriptions((current) =>
      current.map((provider) => (provider.id === id ? { ...provider, ...patch } : provider)),
    );
    setCopied(false);
  }

  function addSubscription() {
    const id = `provider-${Date.now()}`;
    setSubscriptions((current) => [...current, { id, name: "", url: "", enabled: true }]);
    setCopied(false);
  }

  function importSubscriptions(value: string) {
    const imported = parseProviderLines(value);
    if (imported.length === 0) return;
    const now = Date.now();
    setSubscriptions((current) => [
      ...current,
      ...imported.map((provider, index) => ({ ...provider, id: `${provider.id}-${now}-${index}` })),
    ]);
    setCopied(false);
  }

  function removeSubscription(id: string) {
    setSubscriptions((current) => current.filter((provider) => provider.id !== id));
    setCopied(false);
  }

  async function copySubconverterUrl() {
    if (!subconverterUrl) return;
    await navigator.clipboard.writeText(subconverterUrl);
    setCopied(true);
  }

  async function runLocalRouteKitAction(action: LocalRouteKitAction) {
    setActionState({
      action,
      status: "running",
      output: `[${action}] running...`,
    });

    try {
      const result = await requestLocalAction(action);
      setActionState({
        action: result.action,
        status: result.ok ? "success" : "error",
        output: result.output,
      });
    } catch (error: unknown) {
      setActionState({
        action,
        status: "error",
        output: error instanceof Error ? error.message : String(error),
      });
    }
  }

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
            <button
              className={viewMode === "subscriptions" ? "active" : ""}
              type="button"
              onClick={() => setViewMode("subscriptions")}
            >
              <Link2 size={16} />
              订阅
            </button>
            <button
              className={viewMode === "actions" ? "active" : ""}
              type="button"
              onClick={() => setViewMode("actions")}
            >
              <Terminal size={16} />
              操作
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
            <Metric label="订阅源" value={subscriptions.length} />
          </div>

          <div className="panel preview-panel">
            <div className="panel-heading preview-heading">
              <div>
                <h2>
                  {viewMode === "rules"
                    ? "规则顺序"
                    : viewMode === "ini"
                      ? "INI 预览"
                      : viewMode === "subscriptions"
                        ? "订阅管理"
                        : "本地操作"}
                </h2>
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
            {viewMode === "rules" ? <RuleTable rows={activeRows} /> : null}
            {viewMode === "ini" ? <pre className="ini-preview">{iniPreview}</pre> : null}
            {viewMode === "subscriptions" ? (
              <SubscriptionPanel
                copied={copied}
                endpoint={subconverterEndpoint}
                outputUrl={subconverterUrl}
                providers={subscriptions}
                onAdd={addSubscription}
                onCopy={copySubconverterUrl}
                onEndpointChange={(value) => {
                  setSubconverterEndpoint(value);
                  setCopied(false);
                }}
                onImport={importSubscriptions}
                onRemove={removeSubscription}
                onUpdate={updateSubscription}
              />
            ) : null}
            {viewMode === "actions" ? (
              <LocalActionsPanel actionState={actionState} onRun={runLocalRouteKitAction} />
            ) : null}
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
