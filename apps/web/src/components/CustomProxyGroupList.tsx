import { Plus } from "lucide-react";
import type { CustomProxyGroup } from "@clash-route-kit/core";
import { policyTone } from "../proxyGroups.js";
import type { CustomProxyGroupStat } from "../routeSummary.js";

export function CustomProxyGroupList({
  customProxyGroups,
  stats,
  selectedGroupName,
  onCreateGroup,
  onSelectGroup,
}: {
  customProxyGroups: CustomProxyGroup[];
  stats: CustomProxyGroupStat[];
  selectedGroupName: string;
  onCreateGroup: () => void;
  onSelectGroup: (groupName: string) => void;
}) {
  return (
    <aside className="entity-list">
      <div className="entity-list-header">
        <div>
          <h2>策略组</h2>
          <span>{customProxyGroups.length} 个</span>
        </div>
        <button className="icon-button" type="button" aria-label="create custom proxy group" onClick={onCreateGroup}>
          <Plus size={16} />
        </button>
      </div>
      <div className="entity-items">
        {customProxyGroups.map((group) => {
          const stat = stats.find((item) => item.name === group.name);
          return (
            <button
              className={`entity-row ${group.name === selectedGroupName ? "active" : ""}`}
              key={group.name}
              type="button"
              title={stat ? `${stat.ruleSets} 条入站规则 · ${group.options.length} 个成员` : undefined}
              onClick={() => onSelectGroup(group.name)}
            >
              <span className="cpg-row-main">
                <span className={`policy-dot tone-${policyTone(group.name)}`} aria-hidden="true" />
                <strong>{group.name}</strong>
                <span className={`type-badge tb-${group.type}`}>{group.type}</span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
