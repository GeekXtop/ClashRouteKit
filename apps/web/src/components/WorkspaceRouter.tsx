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
import { RouteWorkspace } from "./RouteWorkspace.js";

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
  onAddGeositeRoute,
  onImportIni,
  onReorderRuleSets,
  onRuleSetSearchChange,
  onRunAction,
  onSave,
  onSaveRuleFile,
  onSelectCustomProxyGroup,
  onSelectProvider,
  onSelectRuleSet,
  onSetCustomProxyGroupListField,
  onSetGlobalRemove,
  onSetProviderListField,
  onSetProviderSources,
  onSetTemplateField,
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
  onSetGlobalRemove: (values: string[]) => void;
  onSetProviderListField: (providerName: string, field: "exclude" | "remove", values: string[]) => void;
  onSetProviderSources: (providerName: string, sources: RuleProviderSource[]) => void;
  onSetTemplateField: (patch: Partial<RouteKitProjectConfig["template"]>) => void;
  onToggleRuleSet: (ruleSetId: string) => void;
  onUpdateCustomProxyGroup: (groupName: string, patch: Partial<CustomProxyGroup>) => void;
  onUpdateProvider: (providerName: string, patch: Partial<RuleProviderConfig>) => void;
  onUpdateRuleSet: (ruleSetId: string, patch: Partial<RuleSet>) => void;
  onAddGeositeRoute: (value: string, policy: string, section: string) => void;
  onImportIni: (text: string) => void;
  onReorderRuleSets: (orderedIds: string[]) => void;
  previewMode: PreviewMode;
  project: ProjectControllerState;
  routeRows: RouteSummaryRow[];
  ruleFileState: RuleFileState;
  ruleSetSearch: string;
  saveReadiness: SaveReadiness;
  selectedCustomProxyGroup: CustomProxyGroup | undefined;
  selectedProvider: RuleProviderConfig | undefined;
  selectedRuleSet: RuleSet | undefined;
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
        onSetGlobalRemove={onSetGlobalRemove}
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
        template={config.template}
        onRun={onRunAction}
        onSave={onSave}
        onSetTemplateField={onSetTemplateField}
      />
    );
  }

  return (
    <RouteWorkspace
      config={config}
      customProxyGroupFilter={customProxyGroupFilter}
      iniPreview={iniPreview}
      previewMode={previewMode}
      routeRows={routeRows}
      search={ruleSetSearch}
      selectedRuleSet={selectedRuleSet}
      stats={customProxyGroupStats}
      onAddGeositeRoute={onAddGeositeRoute}
      onCreateCustomProxyGroup={onCreateCustomProxyGroup}
      onCustomProxyGroupFilterChange={onCustomProxyGroupFilterChange}
      onDeleteRuleSet={onDeleteRuleSet}
      onImportIni={onImportIni}
      onPreviewModeChange={onPreviewModeChange}
      onReorderRuleSets={onReorderRuleSets}
      onSearchChange={onRuleSetSearchChange}
      onSelectRuleSet={onSelectRuleSet}
      onToggleRuleSet={onToggleRuleSet}
      onUpdateRuleSet={onUpdateRuleSet}
    />
  );
}
