import { CheckCircle2, FileCode2, FileText, GitBranch, Layers3, Route, Send } from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectStatus, ProjectView } from "../projectController.js";

interface NavItem {
  view: ProjectView;
  label: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  { view: "catalog", label: "规则目录", icon: <FileText size={15} /> },
  { view: "providers", label: "规则源", icon: <FileCode2 size={15} /> },
  { view: "customProxyGroups", label: "策略组", icon: <Layers3 size={15} /> },
  { view: "ruleSets", label: "路由", icon: <Route size={15} /> },
  { view: "publish", label: "发布", icon: <Send size={15} /> },
];

function statusText(status: ProjectStatus): string {
  if (status === "loading") return "读取中";
  if (status === "saving") return "保存中";
  if (status === "error") return "错误";
  return "就绪";
}

export function AppShell({
  children,
  dirty,
  enabledCount,
  onSelectView,
  selectedView,
  status,
}: {
  children: ReactNode;
  dirty: boolean;
  enabledCount: number;
  onSelectView: (view: ProjectView) => void;
  selectedView: ProjectView;
  status: ProjectStatus;
}) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Route size={16} />
          </div>
          <strong className="brand-name">ClashRouteKit</strong>
        </div>
        <nav className="tabnav" aria-label="导航">
          {navItems.map((item) => (
            <button
              className={`tab ${selectedView === item.view ? "on" : ""} ${item.view === "publish" ? "tab-end" : ""}`}
              key={item.view}
              type="button"
              onClick={() => onSelectView(item.view)}
            >
              <span className="tab-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <span className={`status-pill ${dirty ? "dirty" : ""}`}>
            <CheckCircle2 size={14} />
            {dirty ? "未保存" : `${enabledCount} 启用`}
          </span>
          <span className={`status-pill project-${status}`}>
            <GitBranch size={14} />
            {statusText(status)}
          </span>
        </div>
      </header>

      <main className="page">{children}</main>
    </div>
  );
}
