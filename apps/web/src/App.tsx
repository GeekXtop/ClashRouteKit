import { useEffect, useMemo, useRef, useState } from "react";
import YAML from "yaml";
import { AppShell } from "./components/AppShell.js";
import { ConfigConflictDialog } from "./components/ConfigConflictDialog.js";
import { ImportModal } from "./components/ImportModal.js";
import { LibraryPage } from "./components/LibraryPage.js";
import { RoutingPage } from "./components/RoutingPage.js";
import { OutputPage } from "./features/output/OutputPage.js";
import { ProjectPage } from "./features/project/ProjectPage.js";
import { createBlankProjectConfigV2 } from "./features/project/projectMeta.js";
import { importTemplateAsV2 } from "./features/project/importToV2.js";
import { requestLocalAction } from "./actions.js";
import { fetchCatalogSources, type CatalogSourceInfo } from "./catalog.js";
import {
  bundledProjectConfigYaml,
  bundledSchemaVersion,
} from "./config.js";
import { notifyError, notifySuccess } from "./notify.js";
import {
  canSaveProject,
  createV2ProjectController,
  markV2ProjectSaved,
  setProjectSelection,
  setProjectStatus,
  updateProjectValidation,
  type ProjectView,
} from "./projectController.js";
import { renderV2PageConfig } from "./v2/renderProject.js";
import { useV2DraftActions } from "./v2/useV2DraftActions.js";
import { fetchProjectDocument, saveV2Project, serializeV2Project } from "./v2/v2Project.js";

export default function App() {
  const [project, setProject] = useState(() => {
    // bundle 内联配置解析成功时直接装载；解析失败（坏 YAML）时以 Schema v2
    // 空白项目兜底保证首屏可渲染，真实项目随后由 fetchProjectDocument 加载并提示错误。
    const yaml =
      bundledSchemaVersion === 2
        ? bundledProjectConfigYaml
        : YAML.stringify(createBlankProjectConfigV2(), { lineWidth: 0 });
    return createV2ProjectController(yaml);
  });
  const v2Actions = useV2DraftActions(setProject);
  const config = project.draftConfig;
  const v2State = project.schemaVersion === 2 ? project.v2 : undefined;
  // v2 页面渲染输入：normalize + toRouteKitConfig 投影（显示名进、稳定 ID 出），
  // 运行时 URL 从本地设置响应透传（spec 5.3）。
  const runtimeUrls = project.runtimeUrls;
  const pageConfig = useMemo(
    () => (v2State ? renderV2PageConfig(v2State.config, runtimeUrls) : config),
    [v2State, runtimeUrls, config],
  );
  const [importOpen, setImportOpen] = useState(false);
  const [importSources, setImportSources] = useState<CatalogSourceInfo[]>([]);
  const [lastWorkView, setLastWorkView] = useState<Exclude<ProjectView, "project">>("routing");
  // 写冲突（PUT 409）待决策状态：currentYaml 供后续扩展展示，mtime 是覆盖重试的新 base
  const [conflict, setConflict] = useState<{ currentYaml: string; mtime: number } | null>(null);
  // 冲突挂起锁：记录进入冲突时的 draftYaml。自动保存 effect 见此非空且草稿未变即跳过，
  // 否则 dirty 未清会每 600ms 带同一过期 base 重试（409 循环），取消对话框也会立即重开。
  // 用户继续编辑（draftYaml 变化）或覆盖/重载解决冲突后解锁。
  const conflictBlockRef = useRef<string | null>(null);

  function openImport() {
    setImportOpen(true);
    void fetchCatalogSources()
      .then(setImportSources)
      .catch(() => {});
  }

  function handleImport(text: string, mode: "replace" | "merge") {
    // INI 模板经 parseIniToConfig 直出 Schema v2 后整体替换并写盘；
    // 合并语义在 v2 下未定义，入口已在 ImportModal 禁用。
    if (!v2State) {
      notifyError("仅 Schema v2 项目支持模板导入");
      setImportOpen(false);
      return;
    }
    if (mode === "merge") {
      notifyError("Schema v2 项目仅支持「替换现有配置」导入");
      return;
    }
    {
      void (async () => {
        const converted = importTemplateAsV2(text, v2State.config);
        if (!converted.ok) {
          notifyError(converted.error);
          return;
        }
        const save = await saveV2Project(converted.yaml, project.baseMtime ?? 0);
        if (!save.ok) {
          if ("conflict" in save) {
            // 导入是显式单次动作，草稿语义与自动保存不同：冲突时提示重载，
            // 不自动覆盖（覆盖会丢掉外部修改且无法撤销）。
            notifyError("配置文件已被外部修改，导入已取消，请重载后重试");
            refreshConfig();
            return;
          }
          notifyError(save.diagnostics.map((d) => `[${d.code}] ${d.message}`).join("；") || save.reason);
          return;
        }
        setProject(createV2ProjectController(save.yaml, project.runtimeUrls, save.mtime));
        notifySuccess(
          converted.warningCount
            ? `已导入并转换为 Schema v2 配置（${converted.warningCount} 条警告，规则源可在规则库补全）`
            : "已导入并转换为 Schema v2 配置",
        );
      })().catch((error: unknown) =>
        notifyError(error instanceof Error ? error.message : String(error)),
      );
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
      .then((document) =>
        setProject(createV2ProjectController(document.yaml, document.runtimeUrls, document.mtime)),
      )
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

  function createBlankProject() {
    setProject((current) => setProjectStatus(current, "saving", "正在创建空白项目"));
    // 空白项目直接以 Schema v2 落盘（saveV2Project 走 v2 校验链），
    // 避免经 v1 保存路径把配置降级写回旧格式。
    void saveV2Project(YAML.stringify(createBlankProjectConfigV2(), { lineWidth: 0 }), project.baseMtime ?? 0)
      .then((save) => {
        if (!save.ok) {
          if ("conflict" in save) {
            // 与导入同口径：显式动作遇冲突不自动覆盖
            setProject((current) => setProjectStatus(current, "error", "配置文件已被外部修改，请重载后重试"));
            notifyError("配置文件已被外部修改，请重载后重试");
            refreshConfig();
            return;
          }
          const message =
            save.diagnostics.map((d) => `[${d.code}] ${d.message}`).join("；") || save.reason;
          throw new Error(message);
        }
        setProject((current) => createV2ProjectController(save.yaml, current.runtimeUrls, save.mtime));
      })
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
        if (alive) setProject(createV2ProjectController(document.yaml, document.runtimeUrls, document.mtime));
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
    if (conflictBlockRef.current !== null) {
      if (project.draftYaml !== conflictBlockRef.current) {
        // 用户在冲突待决下继续编辑：解除挂起，允许下一次自动保存重试（可能再 409 进对话框）
        conflictBlockRef.current = null;
      } else {
        return;
      }
    }
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
      if (project.v2) {
        // v2 保存链路：以序列化后的 v2 作者配置整体提交，携带 mtime 基线做冲突检测。
        void saveV2Project(serializeV2Project(project.v2.config), project.baseMtime ?? 0)
          .then((result) => {
            if (result.ok) {
              setProject((current) => markV2ProjectSaved(current, result.yaml, result.mtime));
            } else if ("conflict" in result) {
              // 文件被外部修改：停下等用户裁决（覆盖 / 重载），不静默覆盖；
              // 挂起自动保存直到用户编辑或解决冲突（见 conflictBlockRef 注释）
              conflictBlockRef.current = project.draftYaml;
              setProject((current) =>
                setProjectStatus(current, "error", "配置文件已被外部修改，请选择覆盖或重载"),
              );
              setConflict({ currentYaml: result.currentYaml, mtime: result.mtime });
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
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [project]);

  function handleConflictOverwrite() {
    if (!conflict || !project.v2) return;
    // 以 409 返回的服务端 mtime 为新 base 重试；若期间又被外部修改会再次 409，
    // 对话框以最新 mtime 重新出现（不循环自动重试）。
    const retryMtime = conflict.mtime;
    setProject((current) => setProjectStatus(current, "saving", "正在覆盖保存"));
    void saveV2Project(serializeV2Project(project.v2!.config), retryMtime)
      .then((result) => {
        if (result.ok) {
          conflictBlockRef.current = null;
          setConflict(null);
          setProject((current) => markV2ProjectSaved(current, result.yaml, result.mtime));
        } else if ("conflict" in result) {
          // 又被外部修改：以最新 mtime 重现对话框，保持挂起（不自动重试）
          conflictBlockRef.current = project.draftYaml;
          setProject((current) =>
            setProjectStatus(current, "error", "配置文件已被外部修改，请选择覆盖或重载"),
          );
          setConflict({ currentYaml: result.currentYaml, mtime: result.mtime });
        } else {
          conflictBlockRef.current = null;
          setConflict(null);
          setProject((current) => setProjectStatus(current, "error", result.reason));
          notifyError(result.reason);
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setProject((current) => setProjectStatus(current, "error", message));
        notifyError(message);
      });
  }

  function handleConflictReload() {
    conflictBlockRef.current = null;
    setConflict(null);
    refreshConfig();
  }

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
          />
        ) : project.selectedView === "routing" ? (
          <RoutingPage
            config={pageConfig}
            selectedRuleSetId={project.selectedRuleSetId}
            v2={v2State ? { state: v2State, actions: v2Actions } : undefined}
            draftYaml={project.draftYaml}
            onOpenImport={openImport}
          />
        ) : project.selectedView === "library" ? (
          <LibraryPage
            config={pageConfig}
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
      <ImportModal
        open={importOpen}
        sources={importSources}
        mergeDisabled={Boolean(v2State)}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />
      <ConfigConflictDialog
        open={conflict !== null}
        serverMtime={conflict?.mtime ?? 0}
        onOverwrite={handleConflictOverwrite}
        onReload={handleConflictReload}
        onCancel={() => setConflict(null)}
      />
    </>
  );
}
