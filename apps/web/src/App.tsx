import { useEffect, useState } from "react";
import { parseIniToConfig } from "@clash-route-kit/core";
import { AppShell } from "./components/AppShell.js";
import { ImportModal } from "./components/ImportModal.js";
import { LibraryPage } from "./components/LibraryPage.js";
import { PublishPage } from "./components/PublishPage.js";
import { RoutingPage } from "./components/RoutingPage.js";
import { requestLocalAction } from "./actions.js";
import { fetchCatalogSources, type CatalogSourceInfo } from "./catalog.js";
import { bundledProjectConfig, bundledProjectConfigYaml } from "./config.js";
import { loadLocalProjectConfig, saveLocalProjectConfig } from "./localProject.js";
import { notifyError } from "./notify.js";
import {
  canSaveProject,
  createProjectController,
  markProjectSaved,
  setProjectSelection,
  setProjectStatus,
  updateProjectValidation,
} from "./projectController.js";
import { useProjectDraftActions } from "./useProjectDraftActions.js";

export default function App() {
  const [project, setProject] = useState(() =>
    createProjectController({ yaml: bundledProjectConfigYaml, config: bundledProjectConfig }),
  );
  const draftActions = useProjectDraftActions(setProject);
  const config = project.draftConfig;
  const [importOpen, setImportOpen] = useState(false);
  const [importSources, setImportSources] = useState<CatalogSourceInfo[]>([]);

  function openImport() {
    setImportOpen(true);
    void fetchCatalogSources()
      .then(setImportSources)
      .catch(() => {});
  }

  function handleImport(text: string) {
    draftActions.importTemplate(parseIniToConfig(text));
    setImportOpen(false);
  }

  function refreshConfig() {
    void loadLocalProjectConfig()
      .then((result) => setProject(createProjectController(result)))
      .catch((error: unknown) => notifyError(error instanceof Error ? error.message : String(error)));
  }

  function runCheck() {
    void requestLocalAction("check")
      .then((result) =>
        setProject((current) =>
          updateProjectValidation(current, { status: result.ok ? "success" : "error", output: result.output }),
        ),
      )
      .catch((error: unknown) =>
        setProject((current) =>
          updateProjectValidation(current, {
            status: "error",
            output: error instanceof Error ? error.message : String(error),
          }),
        ),
      );
  }

  useEffect(() => {
    let alive = true;
    setProject((current) => setProjectStatus(current, "loading", "正在读取本地 config/routes.yaml"));
    void loadLocalProjectConfig()
      .then((result) => {
        if (alive) setProject(createProjectController(result));
      })
      .catch((error: unknown) => {
        if (!alive) return;
        const message = error instanceof Error ? error.message : String(error);
        setProject((current) => setProjectStatus(current, "error", message));
        notifyError(message);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 实时自动保存：草稿有效且有改动时，防抖写回 config/routes.yaml
  useEffect(() => {
    if (!project.dirty || !canSaveProject(project).ok) return;
    const timer = setTimeout(() => {
      setProject((current) => setProjectStatus(current, "saving", "正在保存"));
      void saveLocalProjectConfig(project.draftConfig)
        .then((result) => setProject((current) => markProjectSaved(current, result)))
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          setProject((current) => setProjectStatus(current, "error", message));
          notifyError(message);
        });
    }, 600);
    return () => clearTimeout(timer);
  }, [project]);

  const saveLabel =
    project.status === "saving" ? "保存中…" : project.status === "error" ? "保存失败" : project.dirty ? "" : "已保存";

  return (
    <>
      <AppShell
        selectedView={project.selectedView}
        saveLabel={saveLabel}
        onSelectView={(view) => setProject((current) => setProjectSelection(current, { selectedView: view }))}
      >
        {project.selectedView === "routing" ? (
          <RoutingPage
            config={config}
            selectedRuleSetId={project.selectedRuleSetId}
            draftActions={draftActions}
            onOpenImport={openImport}
          />
        ) : project.selectedView === "library" ? (
          <LibraryPage config={config} draftActions={draftActions} onRefreshConfig={refreshConfig} />
        ) : (
          <PublishPage config={config} validation={project.validation} onRunCheck={runCheck} />
        )}
      </AppShell>
      <ImportModal open={importOpen} sources={importSources} onClose={() => setImportOpen(false)} onImport={handleImport} />
    </>
  );
}
