import { useEffect, useMemo, useState } from "react";
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
import { saveLocalProjectConfig } from "./localProject.js";
import { notifyError } from "./notify.js";
import {
  canSaveProject,
  createProjectController,
  createProjectControllerFromDocument,
  markProjectSaved,
  markV2ProjectSaved,
  setProjectSelection,
  setProjectStatus,
  updateProjectValidation,
  type ProjectView,
} from "./projectController.js";
import { useProjectDraftActions } from "./useProjectDraftActions.js";
import { renderV2PageConfig } from "./v2/renderProject.js";
import { useV2DraftActions } from "./v2/useV2DraftActions.js";
import { fetchProjectDocument, saveV2Project, serializeV2Project } from "./v2/v2Project.js";

export default function App() {
  const [project, setProject] = useState(() =>
    createProjectController({ yaml: bundledProjectConfigYaml, config: bundledProjectConfig }),
  );
  const draftActions = useProjectDraftActions(setProject);
  const v2Actions = useV2DraftActions(setProject);
  const config = project.draftConfig;
  const v2State = project.schemaVersion === 2 ? project.v2 : undefined;
  // v2 页面渲染输入：normalize + toRouteKitConfig 投影（显示名进、稳定 ID 出）。
  const pageConfig = useMemo(
    () => (v2State ? renderV2PageConfig(v2State.config) : config),
    [v2State, config],
  );
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
    // v2 作者配置不经 INI 导入（无 v1 草稿可合并），避免污染 v2 状态。
    if (v2State) {
      notifyError("Schema v2 项目暂不支持模板导入");
      setImportOpen(false);
      return;
    }
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
    void fetchProjectDocument()
      .then((document) => setProject(createProjectControllerFromDocument(document)))
      .catch((error: unknown) => notifyError(error instanceof Error ? error.message : String(error)));
  }

  /**
   * 迁移应用成功后的刷新：GET /api/project/config 现按 schemaVersion 分发
   * （v2 返回 { schemaVersion: 2, yaml }），直接经 v2 装载链重建快照。
   */
  function handleMigrated() {
    refreshConfig();
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
    void fetchProjectDocument()
      .then((document) => {
        if (alive) setProject(createProjectControllerFromDocument(document));
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
      if (project.schemaVersion === 2 && project.v2) {
        // v2 保存链路：以序列化后的 v2 作者配置整体提交（v1 投影不参与保存）。
        void saveV2Project(serializeV2Project(project.v2.config))
          .then((result) => {
            if (result.ok) {
              setProject((current) => markV2ProjectSaved(current, result.yaml));
            } else {
              setProject((current) => setProjectStatus(current, "error", result.reason));
              notifyError(result.reason);
            }
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            setProject((current) => setProjectStatus(current, "error", message));
            notifyError(message);
          });
        return;
      }
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
            config={v2State ? pageConfig : config}
            originalYaml={project.originalYaml}
            originalConfig={project.originalConfig}
            schemaVersion={project.schemaVersion}
            status={project.status}
            message={project.message}
            dirty={project.dirty}
            validation={project.validation}
            lastWorkView={lastWorkView}
            v2Summary={v2State?.normalizedSummary}
            onNavigate={handleSelectView}
            onOpenImport={openImport}
            onRunCheck={runCheck}
            onCreateBlankProject={createBlankProject}
            onMigrated={handleMigrated}
          />
        ) : project.selectedView === "routing" ? (
          <RoutingPage
            config={pageConfig}
            selectedRuleSetId={project.selectedRuleSetId}
            draftActions={v2State ? v2Actions : draftActions}
            v2={v2State ? { state: v2State, actions: v2Actions } : undefined}
            onOpenImport={openImport}
          />
        ) : project.selectedView === "library" ? (
          <LibraryPage
            config={pageConfig}
            draftActions={v2State ? v2Actions : draftActions}
            v2={v2State ? { state: v2State, actions: v2Actions } : undefined}
            onRefreshConfig={refreshConfig}
          />
        ) : (
          <OutputPage
            config={pageConfig}
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
