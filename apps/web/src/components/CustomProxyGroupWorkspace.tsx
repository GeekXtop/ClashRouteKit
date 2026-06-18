import type { CustomProxyGroup, RouteKitProjectConfig } from "@clash-route-kit/core";
import { selectInboundRuleSets, type CustomProxyGroupStat } from "../routeSummary.js";
import { CustomProxyGroupEditor } from "./CustomProxyGroupEditor.js";
import { CustomProxyGroupList } from "./CustomProxyGroupList.js";

export function CustomProxyGroupWorkspace({
  config,
  onCreateGroup,
  onDeleteGroup,
  onRenameGroup,
  onSelectGroup,
  onSetGroupListField,
  onUpdateGroup,
  onJumpToRuleSet,
  onDeleteRuleSet,
  onAddInboundRule,
  selectedGroup,
  stats,
}: {
  config: RouteKitProjectConfig;
  onCreateGroup: () => void;
  onDeleteGroup: (groupName: string) => void;
  onRenameGroup: (groupName: string, nextGroupName: string) => void;
  onSelectGroup: (groupName: string) => void;
  onSetGroupListField: (groupName: string, field: "options" | "nodeFilters", values: string[]) => void;
  onUpdateGroup: (groupName: string, patch: Partial<CustomProxyGroup>) => void;
  onJumpToRuleSet: (ruleSetId: string) => void;
  onDeleteRuleSet: (ruleSetId: string) => void;
  onAddInboundRule: (groupName: string) => void;
  selectedGroup: CustomProxyGroup | undefined;
  stats: CustomProxyGroupStat[];
}) {
  return (
    <div className="entity-workspace">
      <CustomProxyGroupList
        customProxyGroups={config.customProxyGroups}
        selectedGroupName={selectedGroup?.name ?? ""}
        stats={stats}
        onCreateGroup={onCreateGroup}
        onSelectGroup={onSelectGroup}
      />
      <CustomProxyGroupEditor
        group={selectedGroup}
        groups={config.customProxyGroups}
        inboundRuleSets={selectedGroup ? selectInboundRuleSets(config, selectedGroup.name) : []}
        onDeleteGroup={onDeleteGroup}
        onRenameGroup={onRenameGroup}
        onSetGroupListField={onSetGroupListField}
        onUpdateGroup={onUpdateGroup}
        onJumpToRuleSet={onJumpToRuleSet}
        onDeleteRuleSet={onDeleteRuleSet}
        onAddInboundRule={selectedGroup ? () => onAddInboundRule(selectedGroup.name) : undefined}
      />
    </div>
  );
}
