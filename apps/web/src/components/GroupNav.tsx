import { Button } from "antd";
import { Pencil, Plus } from "lucide-react";
import type { CustomProxyGroup } from "@clash-route-kit/core";
import type { CustomProxyGroupStat } from "../routeSummary.js";
import { policyTone } from "../proxyGroups.js";

export function GroupNav(props: {
  groups: CustomProxyGroup[];
  stats: CustomProxyGroupStat[];
  totalRules: number;
  selectedGroup: string | null;
  onSelectGroup: (name: string | null) => void;
  onEditGroup: (name: string) => void;
  onCreateGroup: () => void;
}) {
  const stat = new Map(props.stats.map((s) => [s.name, s]));
  const service = props.groups.filter((g) => g.type !== "url-test");
  const region = props.groups.filter((g) => g.type === "url-test");

  const Row = (g: CustomProxyGroup) => (
    <div
      key={g.name}
      className={`rk-nav-row ${props.selectedGroup === g.name ? "on" : ""}`}
      onClick={() => props.onSelectGroup(g.name)}
    >
      <span className={`rk-dot tone-${policyTone(g.name)}`} />
      <span className="rk-nav-name">{g.name}</span>
      <button
        type="button"
        aria-label={`编辑 ${g.name}`}
        className="rk-nav-edit"
        onClick={(e) => {
          e.stopPropagation();
          props.onEditGroup(g.name);
        }}
      >
        <Pencil size={12} />
      </button>
      <span className="rk-nav-count">{g.type === "url-test" ? "url-test" : stat.get(g.name)?.ruleSets ?? 0}</span>
    </div>
  );

  return (
    <div className="rk-groupnav">
      <div className="rk-nav-head">
        <strong>策略组</strong>
        <Button size="small" type="text" aria-label="新建策略组" icon={<Plus size={16} />} onClick={props.onCreateGroup} />
      </div>
      <div style={{ overflow: "auto", paddingTop: 6 }}>
        <div
          className={`rk-nav-row ${props.selectedGroup === null ? "on" : ""}`}
          onClick={() => props.onSelectGroup(null)}
        >
          <span className="rk-nav-name">全部规则</span>
          <span className="rk-nav-count">{props.totalRules}</span>
        </div>
        <div className="rk-nav-sec">服务组</div>
        {service.map(Row)}
        <div className="rk-nav-sec">地区组</div>
        {region.map(Row)}
      </div>
    </div>
  );
}
