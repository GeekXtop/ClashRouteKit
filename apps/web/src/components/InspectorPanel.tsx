import { CheckCircle2, CircleDot, Layers3, Settings2 } from "lucide-react";
import type { RouteKitProjectConfig, RuleSet } from "@clash-route-kit/core";
import type { ProjectControllerState, SaveReadiness } from "../projectController.js";
import type { CustomProxyGroupStat } from "../routeSummary.js";
import { YamlDiffPanel } from "./YamlDiffPanel.js";

function sourceText(ruleSet: RuleSet): string {
  const source = ruleSet.source;
  if (source.type === "rule-provider") return `${source.behavior}:${source.file}`;
  if (source.type === "geosite") return `[]GEOSITE,${source.value}`;
  if (source.type === "geoip") return `[]GEOIP,${source.value}`;
  return "[]FINAL";
}

export function InspectorPanel({
  config,
  customProxyGroupStats,
  project,
  routeRowsCount,
  saveReadiness,
  selectedRuleSet,
}: {
  config: RouteKitProjectConfig;
  customProxyGroupStats: CustomProxyGroupStat[];
  project: ProjectControllerState;
  routeRowsCount: number;
  saveReadiness: SaveReadiness;
  selectedRuleSet: RuleSet | undefined;
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
          <p className="project-message">目标文件：config/routes.yaml</p>
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
            <h2>选中 RuleSet</h2>
            <span>{selectedRuleSet?.policy ?? "未选择"}</span>
          </div>
          <CircleDot size={18} />
        </div>
        {selectedRuleSet ? (
          <div className="detail-body">
            <div className="detail-title">
              <strong>{selectedRuleSet.id}</strong>
              <span className={selectedRuleSet.enabled === false ? "state paused" : "state active"}>
                {selectedRuleSet.enabled === false ? "paused" : "active"}
              </span>
            </div>
            <div className="policy-row">
              <span>policy</span>
              <small>{selectedRuleSet.policy}</small>
            </div>
            <div className="policy-row">
              <span>source</span>
              <small>{sourceText(selectedRuleSet)}</small>
            </div>
          </div>
        ) : (
          <div className="empty-state">未选择 ruleset</div>
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
            <span>custom_proxy_group</span>
            <small>{customProxyGroupStats.length} groups</small>
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
            <span>{customProxyGroupStats.length} groups</span>
          </div>
          <Layers3 size={18} />
        </div>
        <div className="policy-list">
          {customProxyGroupStats.map((group) => (
            <div className="policy-row" key={group.name}>
              <span>{group.name}</span>
              <small>
                {group.ruleSets} rulesets / {group.options} options
              </small>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
