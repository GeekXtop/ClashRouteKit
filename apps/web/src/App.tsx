import { useEffect, useState } from "react";
import { parseIniToConfig } from "@clash-route-kit/core";
import { AppShell } from "./components/AppShell.js";
import { ImportModal } from "./components/ImportModal.js";
import { LibraryPage } from "./components/LibraryPage.js";
import { RoutingPage } from "./components/RoutingPage.js";
import { OutputPage } from "./features/output/OutputPage.js";
import { ProjectPage } from "./features/project/ProjectPage.js";
import { createBlankProjectConfig } from "./features/project/projectMeta.js";
import { requestLocalAction } from "./actions.js";
import { fetchCatalogSources, type CatalogSourceInfo } from "./catalog.js";
import { bundledProjectConfig, bundledProjectConfigYaml } from "./config.js";
import { loadLocalProjectConfig, saveLocalProjectConfig } from "./localProject.js";
import { notifyError } from "./notify.js";
import {
  canSaveProject,
  createProjectController,
  markProjectMigrated,
  markProjectSaved,
  setProjectSelection,
  setProjectStatus,
  updateProjectValidation,
  type ProjectView,
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
  const [lastWorkView, setLastWorkView] = useState<Exclude<ProjectView, "project">>("routing");

  function openImport() {
    setImportOpen(true);
    void fetchCatalogSources()
      .then(setImportSources)
      .catch(() => {});
  }

  function handleImport(text: string, mode: "replace" | "merge") {
    if (mode === "merge") {
      draftActions.importIni(text);
    } else {
      draftActions.importTemplate(parseIniToConfig(text));
    }
    setImportOpen(false);
  }

  function handleSelectView(view: ProjectView) {
    if (view !== "project") {
      setLastWorkView(view);
    }
    setProject((current) => setProjectSelection(current, { selectedView: view }));
  }

  function refreshConfig() {
    void loadLocalProjectConfig()
      .then((result) => setProject(createProjectController(result)))
      .catch((error: unknown) => notifyError(error instanceof Error ? error.message : String(error)));
  }

  /**
   * 迁移应用成功后的刷新：优先重载配置；v2 文件在服务端 GET /api/project/config
   * 仍保持 v1 形状时无法解析（400），此时本地把快照标记为 Schema v2 并阻断 v1 保存。
   */
  function handleMigrated() {
    void loadLocalProjectConfig()
      .then((result) => setProject(createProjectController(result)))
      .catch(() => setProject((current) => markProjectMigrated(current)));
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

  function createBlankProject() {
    setProject((current) => setProjectStatus(current, "saving", "正在创建空白项目"));
    void saveLocalProjectConfig(createBlankProjectConfig())
      .then((result) => setProject((current) => createProjectController(result)))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setProject((current) => setProjectStatus(current, "error", message));
        notifyError(message);
      });
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
    if (!project.dirty) return;
    const readiness = canSaveProject(project);
    if (!readiness.ok) {
      if (project.status !== "error" || project.message !== readiness.reason) {
        setProject((current) => setProjectStatus(current, "error", readiness.reason));
      }
      return;
    }
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
      <AppShell selectedView={project.selectedView} saveLabel={saveLabel} onSelectView={handleSelectView}>
        {project.selectedView === "project" ? (
          <ProjectPage
            config={config}
            originalYaml={project.originalYaml}
            originalConfig={project.originalConfig}
            schemaVersion={project.schemaVersion}
            status={project.status}
            message={project.message}
            dirty={project.dirty}
            validation={project.validation}
            lastWorkView={lastWorkView}
            onNavigate={handleSelectView}
            onOpenImport={openImport}
            onRunCheck={runCheck}
            onCreateBlankProject={createBlankProject}
            onMigrated={handleMigrated}
          />
        ) : project.selectedView === "routing" ? (
          <RoutingPage
            config={config}
            schemaVersion={project.schemaVersion}
            selectedRuleSetId={project.selectedRuleSetId}
            draftActions={draftActions}
            onOpenImport={openImport}
          />
        ) : project.selectedView === "library" ? (
          <LibraryPage
            config={config}
            schemaVersion={project.schemaVersion}
            draftActions={draftActions}
            onRefreshConfig={refreshConfig}
          />
        ) : (
          <OutputPage
            config={config}
            schemaVersion={project.schemaVersion}
            originalConfig={project.originalConfig}
            originalYaml={project.originalYaml}
            validation={project.validation}
            onRunCheck={runCheck}
          />
        )}
      </AppShell>
      <ImportModal open={importOpen} sources={importSources} onClose={() => setImportOpen(false)} onImport={handleImport} />
    </>
  );
}
