import type { ReactNode } from "react";
import type { ProviderReference, RouteKitProjectConfig, RouteModule } from "@clash-route-kit/core";
import type { LocalRouteKitAction } from "../actions.js";
import type { ProjectControllerState, SaveReadiness } from "../projectController.js";
import type { PolicyStat, RouteSummaryRow } from "../routeSummary.js";
import { ModuleEditor } from "./ModuleEditor.js";
import { ModuleList } from "./ModuleList.js";
import { PolicyWorkspace } from "./PolicyWorkspace.js";
import { PreviewWorkspace, type PreviewMode } from "./PreviewWorkspace.js";
import { ProjectWorkspace } from "./ProjectWorkspace.js";
import { ProviderWorkspace } from "./ProviderWorkspace.js";
import { PublishPanel } from "./PublishPanel.js";
import type { LocalActionStates } from "../publishWorkflow.js";

export function WorkspaceRouter({
  actionStates,
  config,
  iniPreview,
  moduleSearch,
  onModuleSearchChange,
  onCreateModule,
  onDeleteModule,
  onPolicyFilterChange,
  onPreviewModeChange,
  onRunAction,
  onSave,
  onSetModuleProviderRefs,
  onSetModuleTags,
  onSelectModule,
  onToggleModule,
  onUpdateModule,
  policyFilter,
  policyStats,
  previewMode,
  project,
  routeRows,
  saveReadiness,
  selectedModule,
  subscriptionPanel,
}: {
  actionStates: LocalActionStates;
  config: RouteKitProjectConfig;
  iniPreview: string;
  moduleSearch: string;
  onCreateModule: () => void;
  onDeleteModule: (moduleId: string) => void;
  onModuleSearchChange: (value: string) => void;
  onPolicyFilterChange: (value: string) => void;
  onPreviewModeChange: (mode: PreviewMode) => void;
  onRunAction: (action: LocalRouteKitAction) => void;
  onSave: () => void;
  onSetModuleProviderRefs: (moduleId: string, providers: ProviderReference[]) => void;
  onSetModuleTags: (moduleId: string, field: "geosite" | "geoip", tags: string[]) => void;
  onSelectModule: (moduleId: string) => void;
  onToggleModule: (moduleId: string) => void;
  onUpdateModule: (moduleId: string, patch: Partial<RouteModule>) => void;
  policyFilter: string;
  policyStats: PolicyStat[];
  previewMode: PreviewMode;
  project: ProjectControllerState;
  routeRows: RouteSummaryRow[];
  saveReadiness: SaveReadiness;
  selectedModule: RouteModule | undefined;
  subscriptionPanel: ReactNode;
}) {
  if (project.selectedView === "project") {
    return <ProjectWorkspace config={config} project={project} routeRowsCount={routeRows.length} subscriptionPanel={subscriptionPanel} />;
  }
  if (project.selectedView === "policies") return <PolicyWorkspace config={config} policyStats={policyStats} />;
  if (project.selectedView === "providers") return <ProviderWorkspace config={config} />;
  if (project.selectedView === "preview") {
    return (
      <PreviewWorkspace
        iniPreview={iniPreview}
        mode={previewMode}
        policies={config.proxyGroups.map((group) => group.name)}
        policyFilter={policyFilter}
        rows={routeRows}
        onModeChange={onPreviewModeChange}
        onPolicyFilterChange={onPolicyFilterChange}
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
      <ModuleList
        modules={config.modules}
        search={moduleSearch}
        selectedModuleId={selectedModule?.id ?? ""}
        onCreateModule={onCreateModule}
        onSearchChange={onModuleSearchChange}
        onSelectModule={onSelectModule}
        onToggleModule={onToggleModule}
      />
      <ModuleEditor
        module={selectedModule}
        policies={config.proxyGroups.map((group) => group.name)}
        onDeleteModule={onDeleteModule}
        onSetModuleProviderRefs={onSetModuleProviderRefs}
        onSetModuleTags={onSetModuleTags}
        onToggleModule={onToggleModule}
        onUpdateModule={onUpdateModule}
      />
    </div>
  );
}
