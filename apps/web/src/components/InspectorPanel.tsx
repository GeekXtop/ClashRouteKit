import { CheckCircle2, CircleDot, Layers3, Settings2 } from "lucide-react";
import type { RouteKitProjectConfig, RouteModule } from "@clash-route-kit/core";
import type { ProjectControllerState, SaveReadiness } from "../projectController.js";
import type { PolicyStat } from "../routeSummary.js";
import { TagList } from "./TagList.js";
import { YamlDiffPanel } from "./YamlDiffPanel.js";

export function InspectorPanel({
  config,
  policyStats,
  project,
  routeRowsCount,
  saveReadiness,
  selectedModule,
}: {
  config: RouteKitProjectConfig;
  policyStats: PolicyStat[];
  project: ProjectControllerState;
  routeRowsCount: number;
  saveReadiness: SaveReadiness;
  selectedModule: RouteModule | undefined;
}) {
  const providerCount = config.ruleProviders?.length ?? 0;

  return (
    <>
      <section className="panel local-project-panel">
        <div className="panel-heading">
          <div>
            <h2>状态</h2>
            <span>{project.status}</span>
          </div>
          <Settings2 size={18} />
        </div>
        <div className="local-project-actions">
          <p className={`project-message ${project.status}`}>{project.message}</p>
          <p className="project-message">目标文件：config/modules.yaml</p>
          <p className="project-message">草稿 YAML {project.draftYaml.length} 字符</p>
          <p className="project-message">当前视图 {project.selectedView}</p>
          <p className={`project-message ${saveReadiness.ok ? "success" : "error"}`}>
            保存状态：{saveReadiness.ok ? "可以保存" : saveReadiness.reason}
          </p>
          <p className={`project-message ${project.validation.status}`}>
            检查状态：{project.validation.status}，{project.validation.output}
          </p>
        </div>
      </section>

      <YamlDiffPanel project={project} />

      <section className="panel detail-panel">
        <div className="panel-heading">
          <div>
            <h2>选中模块</h2>
            <span>{selectedModule?.policy ?? "未选择"}</span>
          </div>
          <CircleDot size={18} />
        </div>
        {selectedModule ? (
          <div className="detail-body">
            <div className="detail-title">
              <strong>{selectedModule.id}</strong>
              <span className={selectedModule.enabled === false ? "state paused" : "state active"}>
                {selectedModule.enabled === false ? "paused" : "active"}
              </span>
            </div>
            <TagList title="GEOSITE" tags={selectedModule.geosite ?? []} />
            <TagList title="GEOIP" tags={selectedModule.geoip ?? []} />
            <TagList title="Provider" tags={(selectedModule.providers ?? []).map((provider) => provider.file)} />
          </div>
        ) : (
          <div className="empty-state">未选择模块</div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>摘要</h2>
            <span>{routeRowsCount} rule rows</span>
          </div>
          <CheckCircle2 size={18} />
        </div>
        <div className="policy-list">
          <div className="policy-row">
            <span>策略组</span>
            <small>{policyStats.length} groups</small>
          </div>
          <div className="policy-row">
            <span>Provider 输出</span>
            <small>{providerCount} files</small>
          </div>
        </div>
      </section>

      <section className="panel inspector-secondary">
        <div className="panel-heading">
          <div>
            <h2>策略使用</h2>
            <span>{policyStats.length} groups</span>
          </div>
          <Layers3 size={18} />
        </div>
        <div className="policy-list">
          {policyStats.map((policy) => (
            <div className="policy-row" key={policy.name}>
              <span>{policy.name}</span>
              <small>
                {policy.modules} modules / {policy.options} options
              </small>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
