import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell.js";
import { WorkspaceRouter } from "./components/WorkspaceRouter.js";
import { bundledProjectConfig, bundledProjectConfigYaml } from "./config.js";
import { loadLocalProjectConfig } from "./localProject.js";
import { notifyError } from "./notify.js";
import {
  createProjectController,
  setProjectSelection,
  setProjectStatus,
} from "./projectController.js";

export default function App() {
  const [project, setProject] = useState(() =>
    createProjectController({ yaml: bundledProjectConfigYaml, config: bundledProjectConfig }),
  );

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

  return (
    <AppShell
      dirty={project.dirty}
      selectedView={project.selectedView}
      onSelectView={(view) => setProject((current) => setProjectSelection(current, { selectedView: view }))}
      onImport={() => notifyError("导入：计划 5 接入")}
      onExport={() => notifyError("导出：计划 5 接入")}
    >
      <WorkspaceRouter view={project.selectedView} />
    </AppShell>
  );
}
