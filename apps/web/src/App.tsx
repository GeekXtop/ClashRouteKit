import { useEffect, useMemo, useState } from "react";
import { renderIni } from "@clash-route-kit/core";
import { requestLocalAction, type LocalRouteKitAction } from "./actions.js";
import { AppShell } from "./components/AppShell.js";
import { InspectorPanel } from "./components/InspectorPanel.js";
import type { PreviewMode } from "./components/PreviewWorkspace.js";
import { SubscriptionPanel } from "./components/SubscriptionPanel.js";
import { WorkspaceRouter } from "./components/WorkspaceRouter.js";
import { bundledProjectConfig, bundledProjectConfigYaml } from "./config.js";
import { loadLocalProjectConfig, saveLocalProjectConfig } from "./localProject.js";
import {
  canSaveProject,
  createProjectController,
  markProjectSaved,
  setProjectSelection,
  setProjectStatus,
  updateProjectValidation,
} from "./projectController.js";
import { createInitialActionStates, updateActionState } from "./publishWorkflow.js";
import { createPolicyStats, createRouteSummary } from "./routeSummary.js";
import { useProjectDraftActions } from "./useProjectDraftActions.js";
import { useSubscriptions } from "./useSubscriptions.js";

export default function App() {
  const [project, setProject] = useState(() =>
    createProjectController({ yaml: bundledProjectConfigYaml, config: bundledProjectConfig }),
  );
  const [moduleSearch, setModuleSearch] = useState("");
  const [policyFilter, setPolicyFilter] = useState("全部");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("rules");
  const [actionStates, setActionStates] = useState(createInitialActionStates);

  const config = project.draftConfig;
  const subscriptions = useSubscriptions(config);
  const routeRows = useMemo(() => createRouteSummary(config), [config]);
  const policyStats = useMemo(() => createPolicyStats(config), [config]);
  const iniPreview = useMemo(() => renderIni(config), [config]);
  const selectedModule = config.modules.find((module) => module.id === project.selectedModuleId) ?? config.modules[0];
  const enabledCount = config.modules.filter((module) => module.enabled !== false).length;
  const saveReadiness = useMemo(() => canSaveProject(project), [project]);
  const draftActions = useProjectDraftActions(setProject);

  useEffect(() => {
    let alive = true;
    setProject((current) => setProjectStatus(current, "loading", "正在读取本地 config/modules.yaml"));

    void loadLocalProjectConfig()
      .then((result) => {
        if (!alive) return;
        setProject(createProjectController(result));
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setProject((current) =>
          setProjectStatus(current, "error", error instanceof Error ? error.message : String(error)),
        );
      });

    return () => {
      alive = false;
    };
  }, []);

  async function saveLocalProject() {
    const readiness = canSaveProject(project);
    if (!readiness.ok) {
      setProject((current) => setProjectStatus(current, "error", readiness.reason));
      return;
    }

    setProject((current) => setProjectStatus(current, "saving", "正在写入 config/modules.yaml"));
    try {
      const result = await saveLocalProjectConfig(project.draftConfig);
      setProject((current) => markProjectSaved(current, result));
    } catch (error: unknown) {
      setProject((current) => setProjectStatus(current, "error", error instanceof Error ? error.message : String(error)));
    }
  }

  async function runLocalRouteKitAction(action: LocalRouteKitAction) {
    setActionStates((current) => updateActionState(current, action, { status: "running", output: `[${action}] running...` }));
    if (action === "check") {
      setProject((current) => updateProjectValidation(current, { status: "running", output: "[check] running..." }));
    }

    try {
      const result = await requestLocalAction(action);
      setActionStates((current) =>
        updateActionState(current, result.action, { status: result.ok ? "success" : "error", output: result.output }),
      );
      if (action === "check") {
        setProject((current) =>
          updateProjectValidation(current, { status: result.ok ? "success" : "error", output: result.output }),
        );
      }
    } catch (error: unknown) {
      const output = error instanceof Error ? error.message : String(error);
      setActionStates((current) => updateActionState(current, action, { status: "error", output }));
      if (action === "check") {
        setProject((current) => updateProjectValidation(current, { status: "error", output }));
      }
    }
  }

  const subscriptionPanel = (
    <SubscriptionPanel
      copied={subscriptions.copied}
      endpoint={subscriptions.endpoint}
      outputUrl={subscriptions.outputUrl}
      providers={subscriptions.providers}
      onAdd={subscriptions.add}
      onCopy={subscriptions.copyOutputUrl}
      onEndpointChange={subscriptions.updateEndpoint}
      onImport={subscriptions.importLines}
      onRemove={subscriptions.remove}
      onUpdate={subscriptions.update}
    />
  );

  return (
    <AppShell
      dirty={project.dirty}
      enabledCount={enabledCount}
      inspector={
        <InspectorPanel
          config={config}
          policyStats={policyStats}
          project={project}
          routeRowsCount={routeRows.length}
          saveReadiness={saveReadiness}
          selectedModule={selectedModule}
        />
      }
      selectedView={project.selectedView}
      status={project.status}
      onSelectView={(selectedView) => setProject((current) => setProjectSelection(current, { selectedView }))}
    >
      <WorkspaceRouter
        actionStates={actionStates}
        config={config}
        iniPreview={iniPreview}
        moduleSearch={moduleSearch}
        policyFilter={policyFilter}
        policyStats={policyStats}
        previewMode={previewMode}
        project={project}
        routeRows={routeRows}
        saveReadiness={saveReadiness}
        selectedModule={selectedModule}
        subscriptionPanel={subscriptionPanel}
        onModuleSearchChange={setModuleSearch}
        onCreateModule={draftActions.createModule}
        onDeleteModule={draftActions.deleteModule}
        onPolicyFilterChange={setPolicyFilter}
        onPreviewModeChange={setPreviewMode}
        onRunAction={runLocalRouteKitAction}
        onSave={saveLocalProject}
        onSetModuleProviderRefs={draftActions.setModuleProviderRefs}
        onSetModuleTags={draftActions.setModuleTags}
        onSelectModule={draftActions.selectModule}
        onToggleModule={draftActions.toggleModule}
        onUpdateModule={draftActions.updateModule}
      />
    </AppShell>
  );
}
