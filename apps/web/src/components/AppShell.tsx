import { FileCode2, FileText, Layers3, Route, Send } from "lucide-react";
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

export function AppShell({
  children,
  onSelectView,
  selectedView,
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
      </header>

      <main className="page">{children}</main>
    </div>
  );
}
