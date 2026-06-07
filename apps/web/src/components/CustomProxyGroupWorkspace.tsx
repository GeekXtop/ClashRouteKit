import type { CustomProxyGroup, RouteKitProjectConfig } from "@clash-route-kit/core";
import type { CustomProxyGroupStat } from "../routeSummary.js";
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
        onDeleteGroup={onDeleteGroup}
        onRenameGroup={onRenameGroup}
        onSetGroupListField={onSetGroupListField}
        onUpdateGroup={onUpdateGroup}
      />
    </div>
  );
}
