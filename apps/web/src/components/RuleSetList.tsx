import { Plus, Search } from "lucide-react";
import type { RuleSet } from "@clash-route-kit/core";

function sourceLabel(ruleSet: RuleSet): string {
  const source = ruleSet.source;
  if (source.type === "rule-provider") return `${source.behavior}:${source.file || "(empty)"}`;
  if (source.type === "geosite") return `[]GEOSITE,${source.value || "(empty)"}`;
  if (source.type === "geoip") return `[]GEOIP,${source.value || "(empty)"}`;
  return "[]FINAL";
}

function isEnabled(ruleSet: RuleSet): boolean {
  return ruleSet.enabled !== false;
}

export function RuleSetList({
  onCreateRuleSet,
  onSearchChange,
  onSelectRuleSet,
  onToggleRuleSet,
  ruleSets,
  search,
  selectedRuleSetId,
}: {
  onCreateRuleSet: () => void;
  onSearchChange: (value: string) => void;
  onSelectRuleSet: (ruleSetId: string) => void;
  onToggleRuleSet: (ruleSetId: string) => void;
  ruleSets: RuleSet[];
  search: string;
  selectedRuleSetId: string;
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const visibleRuleSets = normalizedSearch
    ? ruleSets.filter((ruleSet) => `${ruleSet.id} ${ruleSet.policy} ${sourceLabel(ruleSet)}`.toLowerCase().includes(normalizedSearch))
    : ruleSets;

  return (
    <section className="panel module-panel">
      <div className="panel-heading">
        <div>
          <h2>RuleSets</h2>
          <span>
            {visibleRuleSets.length} / {ruleSets.length} lines
          </span>
        </div>
        <button className="icon-button" aria-label="create ruleset" title="新增 ruleset" type="button" onClick={onCreateRuleSet}>
          <Plus size={16} />
        </button>
      </div>
      <label className="search-field">
        <Search size={15} />
        <input
          placeholder="搜索 ruleset 或策略组"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      <div className="module-list">
        {visibleRuleSets.map((ruleSet) => (
          <button
            className={`module-row ${selectedRuleSetId === ruleSet.id ? "selected" : ""}`}
            key={ruleSet.id}
            type="button"
            onClick={() => onSelectRuleSet(ruleSet.id)}
          >
            <span className={`status-dot ${isEnabled(ruleSet) ? "active" : "paused"}`} />
            <span className="module-main">
              <span className="module-name">{ruleSet.id}</span>
              <span className="module-policy">{ruleSet.policy} / {sourceLabel(ruleSet)}</span>
            </span>
            <label className="switch" onClick={(event) => event.stopPropagation()}>
              <input checked={isEnabled(ruleSet)} type="checkbox" onChange={() => onToggleRuleSet(ruleSet.id)} />
              <span />
            </label>
          </button>
        ))}
        {visibleRuleSets.length === 0 ? <div className="empty-state">没有匹配 ruleset</div> : null}
      </div>
    </section>
  );
}
