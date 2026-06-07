import {
  CheckCircle2,
  FileCode2,
  FileText,
  GitBranch,
  Layers3,
  Route,
  Send,
  Settings2,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectStatus, ProjectView } from "../projectController.js";

interface NavItem {
  view: ProjectView;
  label: string;
  description: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  { view: "project", label: "Project", description: "本地文件与输出", icon: <Settings2 size={17} /> },
  { view: "ruleSets", label: "RuleSets", description: "ruleset 行编辑", icon: <Route size={17} /> },
  { view: "customProxyGroups", label: "Proxy Groups", description: "custom_proxy_group", icon: <Layers3 size={17} /> },
  { view: "providers", label: "Providers", description: "Rule Provider", icon: <FileCode2 size={17} /> },
  { view: "rules", label: "Rules", description: "规则文件", icon: <FileText size={17} /> },
  { view: "preview", label: "Preview", description: "规则与 INI", icon: <Route size={17} /> },
  { view: "publish", label: "Publish", description: "检查生成发布", icon: <Send size={17} /> },
];

function statusText(status: ProjectStatus): string {
  if (status === "loading") return "loading";
  if (status === "saving") return "saving";
  if (status === "error") return "error";
  return "ready";
}

export function AppShell({
  children,
  dirty,
  enabledCount,
  inspector,
  onSelectView,
  selectedView,
  status,
}: {
  children: ReactNode;
  dirty: boolean;
  enabledCount: number;
  inspector: ReactNode;
  onSelectView: (view: ProjectView) => void;
  selectedView: ProjectView;
  status: ProjectStatus;
}) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Route size={22} />
          </div>
          <div>
            <h1>ClashRouteKit</h1>
            <span>config/routes.yaml</span>
          </div>
        </div>
        <div className="top-actions">
          <div className={`status-pill ${dirty ? "dirty" : ""}`}>
            <CheckCircle2 size={16} />
            <span>{dirty ? "unsaved" : `${enabledCount} active`}</span>
          </div>
          <div className={`status-pill project-${status}`}>
            <GitBranch size={16} />
            <span>{statusText(status)}</span>
          </div>
        </div>
      </header>

      <main className="workspace editor-workspace">
        <aside className="panel nav-panel" aria-label="editor navigation">
          {navItems.map((item) => (
            <button
              className={`nav-row ${selectedView === item.view ? "selected" : ""}`}
              key={item.view}
              type="button"
              onClick={() => onSelectView(item.view)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </button>
          ))}
        </aside>

        <section className="main-panel">{children}</section>

        <aside className="right-rail">{inspector}</aside>
      </main>
    </div>
  );
}
