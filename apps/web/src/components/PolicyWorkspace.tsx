import { Settings2 } from "lucide-react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import type { PolicyStat } from "../routeSummary.js";

export function PolicyWorkspace({
  config,
  policyStats,
}: {
  config: RouteKitProjectConfig;
  policyStats: PolicyStat[];
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>策略组</h2>
          <span>{policyStats.length} groups</span>
        </div>
        <Settings2 size={18} />
      </div>
      <div className="policy-list wide-list">
        {config.proxyGroups.map((group) => {
          const stat = policyStats.find((item) => item.name === group.name);
          return (
            <div className="policy-row" key={group.name}>
              <span>{group.name}</span>
              <small>
                {group.type} / {stat?.modules ?? 0} modules / {group.options.length} options
              </small>
            </div>
          );
        })}
      </div>
    </section>
  );
}
