import { useEffect, useMemo, useState } from "react";
import { renderIni } from "@clash-route-kit/core";
import { requestLocalAction, type LocalRouteKitAction } from "./actions.js";
import { AppShell } from "./components/AppShell.js";
import { InspectorPanel } from "./components/InspectorPanel.js";
import type { PreviewMode } from "./components/PreviewWorkspace.js";
import type { RuleFileState } from "./components/RuleFileWorkspace.js";
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
import { listRuleFiles, loadRuleFile, saveRuleFile } from "./ruleFiles.js";
import { createCustomProxyGroupStats, createRouteSummary } from "./routeSummary.js";
import { useProjectDraftActions } from "./useProjectDraftActions.js";
import { useSubscriptions } from "./useSubscriptions.js";

export default function App() {
  const [project, setProject] = useState(() =>
    createProjectController({ yaml: bundledProjectConfigYaml, config: bundledProjectConfig }),
  );
  const [ruleSetSearch, setRuleSetSearch] = useState("");
  const [customProxyGroupFilter, setCustomProxyGroupFilter] = useState("全部");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("rules");
  const [actionStates, setActionStates] = useState(createInitialActionStates);
  const [ruleFileState, setRuleFileState] = useState<RuleFileState>({
    files: [],
    selectedFile: "",
    text: "",
    status: "idle",
    message: "尚未读取规则文件",
  });

  const config = project.draftConfig;
  const subscriptions = useSubscriptions(config);
  const routeRows = useMemo(() => createRouteSummary(config), [config]);
  const customProxyGroupStats = useMemo(() => createCustomProxyGroupStats(config), [config]);
  const iniPreview = useMemo(() => renderIni(config), [config]);
  const selectedRuleSet =
    config.ruleSets.find((ruleSet) => ruleSet.id === project.selectedRuleSetId) ?? config.ruleSets[0];
  const selectedCustomProxyGroup =
    config.customProxyGroups.find((group) => group.name === project.selectedCustomProxyGroupName) ??
    config.customProxyGroups[0];
  const selectedProvider =
    (config.ruleProviders ?? []).find((provider) => provider.name === project.selectedProviderName) ??
    config.ruleProviders?.[0];
  const enabledCount = config.ruleSets.filter((ruleSet) => ruleSet.enabled !== false).length;
  const saveReadiness = useMemo(() => canSaveProject(project), [project]);
  const draftActions = useProjectDraftActions(setProject);

  useEffect(() => {
    let alive = true;
    setProject((current) => setProjectStatus(current, "loading", "正在读取本地 config/routes.yaml"));

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

  useEffect(() => {
    void refreshRuleFiles();
  }, []);

  async function saveLocalProject() {
    const readiness = canSaveProject(project);
    if (!readiness.ok) {
      setProject((current) => setProjectStatus(current, "error", readiness.reason));
      return;
    }

    setProject((current) => setProjectStatus(current, "saving", "正在写入 config/routes.yaml"));
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

  async function refreshRuleFiles() {
    setRuleFileState((current) => ({ ...current, status: "loading", message: "正在读取 config/rules" }));
    try {
      const files = await listRuleFiles();
      setRuleFileState((current) => ({
        ...current,
        files,
        selectedFile: current.selectedFile && files.includes(current.selectedFile) ? current.selectedFile : files[0] ?? "",
        status: "idle",
        message: files.length > 0 ? "已读取规则文件列表" : "config/rules 下暂无 .list 文件",
      }));
    } catch (error: unknown) {
      setRuleFileState((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  async function loadSelectedRuleFile(file: string) {
    setRuleFileState((current) => ({ ...current, selectedFile: file, status: "loading", message: `正在读取 ${file}` }));
    setProject((current) => setProjectSelection(current, { selectedRuleFile: file }));
    try {
      const result = await loadRuleFile(file);
      setRuleFileState((current) => ({
        ...current,
        selectedFile: result.file,
        text: result.text,
        status: "idle",
        message: `已读取 config/rules/${result.file}`,
      }));
    } catch (error: unknown) {
      setRuleFileState((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  async function saveSelectedRuleFile() {
    if (!ruleFileState.selectedFile) return;
    setRuleFileState((current) => ({ ...current, status: "saving", message: `正在保存 ${current.selectedFile}` }));
    try {
      const result = await saveRuleFile(ruleFileState.selectedFile, ruleFileState.text);
      setRuleFileState((current) => ({
        ...current,
        text: result.text,
        status: "idle",
        message: `已保存 config/rules/${result.file}`,
      }));
    } catch (error: unknown) {
      setRuleFileState((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      }));
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
          customProxyGroupStats={customProxyGroupStats}
          project={project}
          routeRowsCount={routeRows.length}
          saveReadiness={saveReadiness}
          selectedRuleSet={selectedRuleSet}
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
        customProxyGroupFilter={customProxyGroupFilter}
        customProxyGroupStats={customProxyGroupStats}
        previewMode={previewMode}
        project={project}
        routeRows={routeRows}
        ruleFileState={ruleFileState}
        saveReadiness={saveReadiness}
        ruleSetSearch={ruleSetSearch}
        selectedCustomProxyGroup={selectedCustomProxyGroup}
        selectedProvider={selectedProvider}
        selectedRuleSet={selectedRuleSet}
        subscriptionPanel={subscriptionPanel}
        onRuleSetSearchChange={setRuleSetSearch}
        onAddGeositeRoute={draftActions.addGeositeRoute}
        onImportIni={draftActions.importIni}
        onReorderRuleSets={draftActions.reorderRuleSets}
        onCreateRuleSet={draftActions.createRuleSet}
        onCreateCustomProxyGroup={draftActions.createCustomProxyGroup}
        onCreateProvider={draftActions.createProvider}
        onDeleteRuleSet={draftActions.deleteRuleSet}
        onDeleteCustomProxyGroup={draftActions.deleteCustomProxyGroup}
        onDeleteProvider={draftActions.deleteProvider}
        onCustomProxyGroupFilterChange={setCustomProxyGroupFilter}
        onPreviewModeChange={setPreviewMode}
        onRenameCustomProxyGroup={draftActions.renameCustomProxyGroup}
        onRefreshRuleFiles={refreshRuleFiles}
        onRuleFileTextChange={(text) => setRuleFileState((current) => ({ ...current, text }))}
        onRunAction={runLocalRouteKitAction}
        onSave={saveLocalProject}
        onSaveRuleFile={saveSelectedRuleFile}
        onSetCustomProxyGroupListField={draftActions.setCustomProxyGroupListField}
        onSetGlobalRemove={draftActions.setGlobalRemove}
        onSetProviderListField={draftActions.setProviderListField}
        onSetProviderSources={draftActions.setProviderSources}
        onLoadRuleFile={loadSelectedRuleFile}
        onSelectRuleSet={draftActions.selectRuleSet}
        onSelectCustomProxyGroup={(selectedCustomProxyGroupName) =>
          setProject((current) => setProjectSelection(current, { selectedCustomProxyGroupName }))
        }
        onSelectProvider={(selectedProviderName) =>
          setProject((current) => setProjectSelection(current, { selectedProviderName }))
        }
        onToggleRuleSet={draftActions.toggleRuleSet}
        onUpdateRuleSet={draftActions.updateRuleSet}
        onUpdateCustomProxyGroup={draftActions.updateCustomProxyGroup}
        onUpdateProvider={draftActions.updateProvider}
      />
    </AppShell>
  );
}
