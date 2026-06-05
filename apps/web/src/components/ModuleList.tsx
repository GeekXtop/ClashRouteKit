import { Plus, Search } from "lucide-react";
import type { RouteModule } from "@clash-route-kit/core";

function isEnabled(module: RouteModule): boolean {
  return module.enabled !== false;
}

function ModuleRow({
  module,
  onSelect,
  onToggle,
  selected,
}: {
  module: RouteModule;
  onSelect: () => void;
  onToggle: () => void;
  selected: boolean;
}) {
  const enabled = isEnabled(module);

  return (
    <button className={`module-row ${selected ? "selected" : ""}`} type="button" onClick={onSelect}>
      <span className={`status-dot ${enabled ? "active" : "paused"}`} />
      <span className="module-main">
        <span className="module-name">{module.id}</span>
        <span className="module-policy">{module.policy}</span>
      </span>
      <label className="switch" onClick={(event) => event.stopPropagation()}>
        <input checked={enabled} type="checkbox" onChange={onToggle} />
        <span />
      </label>
    </button>
  );
}

export function ModuleList({
  modules,
  onCreateModule,
  onSearchChange,
  onSelectModule,
  onToggleModule,
  search,
  selectedModuleId,
}: {
  modules: RouteModule[];
  onCreateModule: () => void;
  onSearchChange: (value: string) => void;
  onSelectModule: (moduleId: string) => void;
  onToggleModule: (moduleId: string) => void;
  search: string;
  selectedModuleId: string;
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const visibleModules = normalizedSearch
    ? modules.filter((module) => `${module.id} ${module.policy}`.toLowerCase().includes(normalizedSearch))
    : modules;

  return (
    <section className="panel module-panel">
      <div className="panel-heading">
        <div>
          <h2>模块</h2>
          <span>
            {visibleModules.length} / {modules.length} total
          </span>
        </div>
        <button className="icon-button" aria-label="create module" title="新增模块" type="button" onClick={onCreateModule}>
          <Plus size={16} />
        </button>
      </div>
      <label className="search-field">
        <Search size={15} />
        <input
          placeholder="搜索模块或策略"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      <div className="module-list">
        {visibleModules.map((module) => (
          <ModuleRow
            key={module.id}
            module={module}
            selected={selectedModuleId === module.id}
            onSelect={() => onSelectModule(module.id)}
            onToggle={() => onToggleModule(module.id)}
          />
        ))}
        {visibleModules.length === 0 ? <div className="empty-state">没有匹配模块</div> : null}
      </div>
    </section>
  );
}
