import { useRef, useState } from "react";
import { Plus, Search, Upload } from "lucide-react";
import type { RouteKitProjectConfig, RuleSet } from "@clash-route-kit/core";
import { policyTone } from "../proxyGroups.js";
import type { CustomProxyGroupStat, RouteSummaryRow } from "../routeSummary.js";
import { PreviewWorkspace, type PreviewMode } from "./PreviewWorkspace.js";
import { RoutePicker } from "./RoutePicker.js";
import { RuleSetEditor } from "./RuleSetEditor.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function sourceLabel(ruleSet: RuleSet): string {
  const source = ruleSet.source;
  if (source.type === "rule-provider") return `${source.behavior}:${source.file || "(empty)"}`;
  if (source.type === "geosite") return `[]GEOSITE,${source.value || "(empty)"}`;
  if (source.type === "geoip") return `[]GEOIP,${source.value || "(empty)"}`;
  return "[]FINAL";
}

function sectionLabel(ruleSet: RuleSet): string {
  return ruleSet.section?.trim() || "默认";
}

export function RouteWorkspace({
  config,
  customProxyGroupFilter,
  fetcher = globalThis.fetch,
  iniPreview,
  onAddGeositeRoute,
  onCreateCustomProxyGroup,
  onCustomProxyGroupFilterChange,
  onDeleteRuleSet,
  onImportIni,
  onPreviewModeChange,
  onReorderRuleSets,
  onSearchChange,
  onSelectRuleSet,
  onToggleRuleSet,
  onUpdateRuleSet,
  previewMode,
  routeRows,
  search,
  selectedRuleSet,
  stats,
}: {
  config: RouteKitProjectConfig;
  customProxyGroupFilter: string;
  fetcher?: Fetcher;
  iniPreview: string;
  onAddGeositeRoute: (value: string, policy: string, section: string) => void;
  onCreateCustomProxyGroup: () => void;
  onCustomProxyGroupFilterChange: (value: string) => void;
  onDeleteRuleSet: (ruleSetId: string) => void;
  onImportIni: (text: string) => void;
  onPreviewModeChange: (mode: PreviewMode) => void;
  onReorderRuleSets: (orderedIds: string[]) => void;
  onSearchChange: (value: string) => void;
  onSelectRuleSet: (ruleSetId: string) => void;
  onToggleRuleSet: (ruleSetId: string) => void;
  onUpdateRuleSet: (ruleSetId: string, patch: Partial<RuleSet>) => void;
  previewMode: PreviewMode;
  routeRows: RouteSummaryRow[];
  search: string;
  selectedRuleSet: RuleSet | undefined;
  stats: CustomProxyGroupStat[];
}) {
  const [policyFilter, setPolicyFilter] = useState("全部");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [rightTab, setRightTab] = useState<"edit" | "preview">("edit");
  const dragIdRef = useRef<string | null>(null);

  const policyNames = config.customProxyGroups.map((group) => group.name);
  const statByName = new Map(stats.map((stat) => [stat.name, stat]));
  const sections = [...new Set(config.ruleSets.map((ruleSet) => ruleSet.section).filter((value): value is string => Boolean(value)))];

  const normalizedSearch = search.trim().toLowerCase();
  const visible = config.ruleSets.filter((ruleSet) => {
    if (policyFilter !== "全部" && ruleSet.policy !== policyFilter) return false;
    if (!normalizedSearch) return true;
    return `${ruleSet.id} ${ruleSet.policy} ${sourceLabel(ruleSet)}`.toLowerCase().includes(normalizedSearch);
  });

  const sectionOrder: string[] = [];
  const bySection = new Map<string, RuleSet[]>();
  for (const ruleSet of visible) {
    const label = sectionLabel(ruleSet);
    if (!bySection.has(label)) {
      bySection.set(label, []);
      sectionOrder.push(label);
    }
    bySection.get(label)!.push(ruleSet);
  }

  function reorderByDrop(targetId: string) {
    const dragId = dragIdRef.current;
    dragIdRef.current = null;
    if (!dragId || dragId === targetId) return;
    const ids = config.ruleSets.map((ruleSet) => ruleSet.id).filter((id) => id !== dragId);
    const targetIndex = ids.indexOf(targetId);
    if (targetIndex === -1) return;
    ids.splice(targetIndex, 0, dragId);
    onReorderRuleSets(ids);
  }

  return (
    <div className="route-workspace">
      <div className="route-toolbar">
        <label className="search-field">
          <Search size={15} />
          <input
            placeholder="搜索 ruleset 或策略组"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
        <button className="command-button" type="button" onClick={() => setPickerOpen(true)}>
          <Plus size={15} /> 添加规则
        </button>
        <button className="command-button" type="button" onClick={() => setImportOpen((value) => !value)}>
          <Upload size={15} /> 导入 INI
        </button>
      </div>

      {importOpen ? (
        <div className="import-panel panel">
          <textarea
            aria-label="INI 文本"
            placeholder="粘贴 SubConverter [custom] INI 文本…"
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
          />
          <button
            className="command-button primary"
            type="button"
            onClick={() => {
              onImportIni(importText);
              setImportText("");
              setImportOpen(false);
            }}
          >
            导入
          </button>
        </div>
      ) : null}

      <div className="route-columns">
        <aside className="route-filter panel">
          <div className="entity-list-header">
            <div>
              <h2>策略</h2>
            </div>
            <button className="icon-button" type="button" aria-label="新建策略组" onClick={onCreateCustomProxyGroup}>
              <Plus size={16} />
            </button>
          </div>
          <button
            className={`route-filter-row ${policyFilter === "全部" ? "active" : ""}`}
            type="button"
            aria-label="筛选 全部"
            onClick={() => setPolicyFilter("全部")}
          >
            <span>全部规则</span>
            <span className="count">{config.ruleSets.length}</span>
          </button>
          {policyNames.map((name) => (
            <button
              key={name}
              className={`route-filter-row ${policyFilter === name ? "active" : ""}`}
              type="button"
              aria-label={`筛选 ${name}`}
              onClick={() => setPolicyFilter(name)}
            >
              <span className={`policy-dot tone-${policyTone(name)}`} />
              <span>{name}</span>
              <span className="count">{statByName.get(name)?.ruleSets ?? 0}</span>
            </button>
          ))}
        </aside>

        <section className="route-list panel">
          {sectionOrder.map((label) => (
            <div className="route-section" key={label}>
              <div className="route-section-header">{label}</div>
              {bySection.get(label)!.map((ruleSet) => {
                const tone = ruleSet.source.type === "final" ? "fin" : policyTone(ruleSet.policy);
                return (
                  <div
                    key={ruleSet.id}
                    data-testid={`route-row-${ruleSet.id}`}
                    className={`route-row tone-${tone} ${selectedRuleSet?.id === ruleSet.id ? "sel" : ""}`}
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={() => {
                      dragIdRef.current = ruleSet.id;
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      reorderByDrop(ruleSet.id);
                    }}
                    onClick={() => onSelectRuleSet(ruleSet.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") onSelectRuleSet(ruleSet.id);
                    }}
                  >
                    <span className="grip">⠿</span>
                    <span className="route-meta">
                      <span className="route-name">{ruleSet.id}</span>
                      <span className="route-src">{sourceLabel(ruleSet)}</span>
                    </span>
                    {ruleSet.source.type !== "final" ? (
                      <label className="switch" onClick={(event) => event.stopPropagation()}>
                        <input
                          checked={ruleSet.enabled !== false}
                          type="checkbox"
                          onChange={() => onToggleRuleSet(ruleSet.id)}
                        />
                        <span />
                      </label>
                    ) : null}
                    <span className={`pc tone-${tone}`}>{ruleSet.policy}</span>
                    <button
                      className="route-del"
                      type="button"
                      aria-label={`删除 ${ruleSet.id}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteRuleSet(ruleSet.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
          {visible.length === 0 ? <div className="empty-state">没有匹配 ruleset</div> : null}
        </section>

        <section className="route-detail">
          <div className="segmented" aria-label="route detail mode">
            <button className={rightTab === "edit" ? "active" : ""} type="button" onClick={() => setRightTab("edit")}>
              编辑
            </button>
            <button
              className={rightTab === "preview" ? "active" : ""}
              type="button"
              onClick={() => setRightTab("preview")}
            >
              预览
            </button>
          </div>
          {rightTab === "edit" ? (
            <RuleSetEditor
              customProxyGroups={policyNames}
              publishBaseUrl={config.publishBaseUrl}
              ruleSet={selectedRuleSet}
              onDeleteRuleSet={onDeleteRuleSet}
              onToggleRuleSet={onToggleRuleSet}
              onUpdateRuleSet={onUpdateRuleSet}
            />
          ) : (
            <PreviewWorkspace
              customProxyGroupFilter={customProxyGroupFilter}
              customProxyGroups={policyNames}
              iniPreview={iniPreview}
              mode={previewMode}
              rows={routeRows}
              onCustomProxyGroupFilterChange={onCustomProxyGroupFilterChange}
              onModeChange={onPreviewModeChange}
            />
          )}
        </section>
      </div>

      {pickerOpen ? (
        <RoutePicker
          policies={policyNames}
          sections={sections}
          fetcher={fetcher}
          onAdd={(value, policy, section) => {
            onAddGeositeRoute(value, policy, section);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}
