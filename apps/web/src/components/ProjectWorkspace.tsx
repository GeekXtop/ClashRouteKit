import { FileCode2, Globe2, ListTree } from "lucide-react";
import type { ReactNode } from "react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import type { ProjectControllerState } from "../projectController.js";

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ProjectWorkspace({
  config,
  project,
  routeRowsCount,
  subscriptionPanel,
}: {
  config: RouteKitProjectConfig;
  project: ProjectControllerState;
  routeRowsCount: number;
  subscriptionPanel: ReactNode;
}) {
  return (
    <>
      <div className="metrics-grid">
        <Metric label="规则行" value={routeRowsCount} />
        <Metric label="RuleSets" value={config.ruleSets.length} />
        <Metric label="Proxy Groups" value={config.customProxyGroups.length} />
        <Metric label="Providers" value={config.ruleProviders?.length ?? 0} />
      </div>

      <section className="panel project-overview">
        <div className="panel-heading">
          <div>
            <h2>本地项目</h2>
            <span>{project.status}</span>
          </div>
          <FileCode2 size={18} />
        </div>
        <div className="project-grid">
          <div className="project-card">
            <Globe2 size={18} />
            <strong>Publish Base URL</strong>
            <span>{config.publishBaseUrl}</span>
          </div>
          <div className="project-card">
            <FileCode2 size={18} />
            <strong>Template Output</strong>
            <span>{config.template.output}</span>
          </div>
          <div className="project-card">
            <ListTree size={18} />
            <strong>YAML Source</strong>
            <span>config/routes.yaml</span>
          </div>
        </div>
      </section>

      {subscriptionPanel}
    </>
  );
}
