import type { ReactNode } from "react";
import type {
  CustomProxyGroup,
  RouteKitProjectConfig,
  RuleProviderConfig,
  RuleProviderSource,
  RuleSet,
  RuleSetSource,
} from "@clash-route-kit/core";
import type { LocalRouteKitAction } from "../actions.js";
import type { ProjectControllerState, SaveReadiness } from "../projectController.js";
import type { CustomProxyGroupStat, RouteSummaryRow } from "../routeSummary.js";
import type { LocalActionStates } from "../publishWorkflow.js";
import { CatalogWorkspace } from "./CatalogWorkspace.js";
import { CustomProxyGroupWorkspace } from "./CustomProxyGroupWorkspace.js";
import { type PreviewMode } from "./PreviewWorkspace.js";
import { ProviderWorkspace } from "./ProviderWorkspace.js";
import { PublishPanel } from "./PublishPanel.js";
import { type RuleFileState } from "./RuleFileWorkspace.js";
import { RuleSetEditor } from "./RuleSetEditor.js";
import { RuleSetList } from "./RuleSetList.js";

export function WorkspaceRouter({
  actionStates,
  config,
  customProxyGroupFilter,
  customProxyGroupStats,
  iniPreview,
  onCreateCustomProxyGroup,
  onCreateProvider,
  onCreateRuleSet,
  onCustomProxyGroupFilterChange,
  onDeleteCustomProxyGroup,
  onDeleteProvider,
  onDeleteRuleSet,
  onLoadRuleFile,
  onPreviewModeChange,
  onRefreshRuleFiles,
  onRenameCustomProxyGroup,
  onRuleFileTextChange,
  onRuleSetSearchChange,
  onRunAction,
  onSave,
  onSaveRuleFile,
  onSelectCustomProxyGroup,
  onSelectProvider,
  onSelectRuleSet,
  onSetCustomProxyGroupListField,
  onSetProviderListField,
  onSetProviderSources,
  onToggleRuleSet,
  onUpdateCustomProxyGroup,
  onUpdateProvider,
  onUpdateRuleSet,
  previewMode,
  project,
  routeRows,
  ruleFileState,
  ruleSetSearch,
  saveReadiness,
  selectedCustomProxyGroup,
  selectedProvider,
  selectedRuleSet,
  subscriptionPanel,
}: {
  actionStates: LocalActionStates;
  config: RouteKitProjectConfig;
  customProxyGroupFilter: string;
  customProxyGroupStats: CustomProxyGroupStat[];
  iniPreview: string;
  onCreateCustomProxyGroup: () => void;
  onCreateProvider: () => void;
  onCreateRuleSet: (sourceType?: RuleSetSource["type"]) => void;
  onCustomProxyGroupFilterChange: (value: string) => void;
  onDeleteCustomProxyGroup: (groupName: string) => void;
  onDeleteProvider: (providerName: string) => void;
  onDeleteRuleSet: (ruleSetId: string) => void;
  onLoadRuleFile: (file: string) => void;
  onPreviewModeChange: (mode: PreviewMode) => void;
  onRefreshRuleFiles: () => void;
  onRenameCustomProxyGroup: (groupName: string, nextGroupName: string) => void;
  onRuleFileTextChange: (text: string) => void;
  onRuleSetSearchChange: (value: string) => void;
  onRunAction: (action: LocalRouteKitAction) => void;
  onSave: () => void;
  onSaveRuleFile: () => void;
  onSelectCustomProxyGroup: (groupName: string) => void;
  onSelectProvider: (providerName: string) => void;
  onSelectRuleSet: (ruleSetId: string) => void;
  onSetCustomProxyGroupListField: (groupName: string, field: "options" | "nodeFilters", values: string[]) => void;
  onSetProviderListField: (providerName: string, field: "exclude" | "remove", values: string[]) => void;
  onSetProviderSources: (providerName: string, sources: RuleProviderSource[]) => void;
  onToggleRuleSet: (ruleSetId: string) => void;
  onUpdateCustomProxyGroup: (groupName: string, patch: Partial<CustomProxyGroup>) => void;
  onUpdateProvider: (providerName: string, patch: Partial<RuleProviderConfig>) => void;
  onUpdateRuleSet: (ruleSetId: string, patch: Partial<RuleSet>) => void;
  previewMode: PreviewMode;
  project: ProjectControllerState;
  routeRows: RouteSummaryRow[];
  ruleFileState: RuleFileState;
  ruleSetSearch: string;
  saveReadiness: SaveReadiness;
  selectedCustomProxyGroup: CustomProxyGroup | undefined;
  selectedProvider: RuleProviderConfig | undefined;
  selectedRuleSet: RuleSet | undefined;
  subscriptionPanel: ReactNode;
}) {
  if (project.selectedView === "catalog") {
    return (
      <CatalogWorkspace
        ruleFileState={ruleFileState}
        onLoadRuleFile={onLoadRuleFile}
        onRefreshRuleFiles={onRefreshRuleFiles}
        onRuleFileTextChange={onRuleFileTextChange}
        onSaveRuleFile={onSaveRuleFile}
      />
    );
  }
  if (project.selectedView === "customProxyGroups") {
    return (
      <CustomProxyGroupWorkspace
        config={config}
        selectedGroup={selectedCustomProxyGroup}
        stats={customProxyGroupStats}
        onCreateGroup={onCreateCustomProxyGroup}
        onDeleteGroup={onDeleteCustomProxyGroup}
        onRenameGroup={onRenameCustomProxyGroup}
        onSelectGroup={onSelectCustomProxyGroup}
        onSetGroupListField={onSetCustomProxyGroupListField}
        onUpdateGroup={onUpdateCustomProxyGroup}
      />
    );
  }
  if (project.selectedView === "providers") {
    return (
      <ProviderWorkspace
        config={config}
        selectedProvider={selectedProvider}
        onCreateProvider={onCreateProvider}
        onDeleteProvider={onDeleteProvider}
        onSelectProvider={onSelectProvider}
        onSetProviderListField={onSetProviderListField}
        onSetProviderSources={onSetProviderSources}
        onUpdateProvider={onUpdateProvider}
      />
    );
  }
  if (project.selectedView === "publish") {
    return (
      <PublishPanel
        actionStates={actionStates}
        dirty={project.dirty}
        draftYamlLength={project.draftYaml.length}
        projectMessage={project.message}
        projectStatus={project.status}
        publishBaseUrl={config.publishBaseUrl}
        saveReadiness={saveReadiness}
        templateOutput={config.template.output}
        onRun={onRunAction}
        onSave={onSave}
      />
    );
  }

  return (
    <div className="module-workspace">
      <RuleSetList
        ruleSets={config.ruleSets}
        search={ruleSetSearch}
        selectedRuleSetId={selectedRuleSet?.id ?? ""}
        onCreateRuleSet={() => onCreateRuleSet("geosite")}
        onSearchChange={onRuleSetSearchChange}
        onSelectRuleSet={onSelectRuleSet}
        onToggleRuleSet={onToggleRuleSet}
      />
      <RuleSetEditor
        customProxyGroups={config.customProxyGroups.map((group) => group.name)}
        publishBaseUrl={config.publishBaseUrl}
        ruleSet={selectedRuleSet}
        onDeleteRuleSet={onDeleteRuleSet}
        onToggleRuleSet={onToggleRuleSet}
        onUpdateRuleSet={onUpdateRuleSet}
      />
    </div>
  );
}
