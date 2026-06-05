import type { ReactNode } from "react";
import type { RouteKitProjectConfig, RouteModule } from "@clash-route-kit/core";
import type { LocalRouteKitAction } from "../actions.js";
import type { ProjectControllerState, SaveReadiness } from "../projectController.js";
import type { PolicyStat, RouteSummaryRow } from "../routeSummary.js";
import { ModuleEditor } from "./ModuleEditor.js";
import { ModuleList } from "./ModuleList.js";
import { PolicyWorkspace } from "./PolicyWorkspace.js";
import { PreviewWorkspace, type PreviewMode } from "./PreviewWorkspace.js";
import { ProjectWorkspace } from "./ProjectWorkspace.js";
import { ProviderWorkspace } from "./ProviderWorkspace.js";
import { PublishPanel, type LocalActionState } from "./PublishPanel.js";

export function WorkspaceRouter({
  actionState,
  config,
  iniPreview,
  moduleSearch,
  onModuleSearchChange,
  onPolicyFilterChange,
  onPreviewModeChange,
  onRunAction,
  onSave,
  onSelectModule,
  onToggleModule,
  policyFilter,
  policyStats,
  previewMode,
  project,
  routeRows,
  saveReadiness,
  selectedModule,
  subscriptionPanel,
}: {
  actionState: LocalActionState;
  config: RouteKitProjectConfig;
  iniPreview: string;
  moduleSearch: string;
  onModuleSearchChange: (value: string) => void;
  onPolicyFilterChange: (value: string) => void;
  onPreviewModeChange: (mode: PreviewMode) => void;
  onRunAction: (action: LocalRouteKitAction) => void;
  onSave: () => void;
  onSelectModule: (moduleId: string) => void;
  onToggleModule: (moduleId: string) => void;
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
        actionState={actionState}
        dirty={project.dirty}
        draftYamlLength={project.draftYaml.length}
        projectMessage={project.message}
        projectStatus={project.status}
        saveReadiness={saveReadiness}
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
        onSearchChange={onModuleSearchChange}
        onSelectModule={onSelectModule}
        onToggleModule={onToggleModule}
      />
      <ModuleEditor module={selectedModule} onToggleModule={onToggleModule} />
    </div>
  );
}
