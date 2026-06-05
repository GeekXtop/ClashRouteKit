import { CircleDot } from "lucide-react";
import type { RouteModule } from "@clash-route-kit/core";
import { TagList } from "./TagList.js";

export function ModuleEditor({
  module,
  onToggleModule,
}: {
  module: RouteModule | undefined;
  onToggleModule: (moduleId: string) => void;
}) {
  if (!module) {
    return (
      <section className="panel detail-panel module-editor">
        <div className="empty-state">选择一个模块开始编辑</div>
      </section>
    );
  }

  const enabled = module.enabled !== false;

  return (
    <section className="panel detail-panel module-editor">
      <div className="panel-heading">
        <div>
          <h2>模块详情</h2>
          <span>{module.policy}</span>
        </div>
        <CircleDot size={18} />
      </div>
      <div className="detail-body">
        <div className="detail-title">
          <strong>{module.id}</strong>
          <button
            className={`state ${enabled ? "active" : "paused"}`}
            type="button"
            onClick={() => onToggleModule(module.id)}
          >
            {enabled ? "active" : "paused"}
          </button>
        </div>
        <div className="read-only-grid">
          <label>
            <span>Policy</span>
            <input readOnly value={module.policy} />
          </label>
          <label>
            <span>Enabled</span>
            <input readOnly value={enabled ? "true" : "false"} />
          </label>
        </div>
        <TagList title="GEOSITE" tags={module.geosite ?? []} />
        <TagList title="GEOIP" tags={module.geoip ?? []} />
        <TagList title="Provider" tags={(module.providers ?? []).map((provider) => provider.file)} />
        <p className="operation-hint">
          表单编辑会在下一步接入；当前先保持现有启停行为，并把模块详情从右侧杂糅面板中拆出来。
        </p>
      </div>
    </section>
  );
}
