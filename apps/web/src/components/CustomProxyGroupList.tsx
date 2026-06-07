import { Plus } from "lucide-react";
import type { CustomProxyGroup } from "@clash-route-kit/core";
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
          <h2>Custom Proxy Groups</h2>
          <span>{customProxyGroups.length} groups</span>
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
              onClick={() => onSelectGroup(group.name)}
            >
              <strong>{group.name}</strong>
              <span>
                {group.type} / {stat?.ruleSets ?? 0} rulesets / {group.options.length} options
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
