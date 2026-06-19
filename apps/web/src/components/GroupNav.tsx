import type { ReactNode } from "react";
import { Collapse } from "antd";
import { Pencil, Plus } from "lucide-react";
import type { CustomProxyGroup } from "@clash-route-kit/core";
import type { CustomProxyGroupStat } from "../routeSummary.js";

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="rk-iconbtn"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

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
      <span className="rk-nav-name">{g.name}</span>
      <IconAction label={`编辑 ${g.name}`} onClick={() => props.onEditGroup(g.name)}>
        <Pencil size={12} />
      </IconAction>
      <span className="rk-nav-count">{g.type === "url-test" ? "url-test" : stat.get(g.name)?.ruleSets ?? 0}</span>
    </div>
  );

  return (
    <div className="rk-groupnav">
      <div
        className={`rk-nav-row rk-nav-all ${props.selectedGroup === null ? "on" : ""}`}
        onClick={() => props.onSelectGroup(null)}
      >
        <span className="rk-nav-name">全部规则</span>
        <span className="rk-nav-count">{props.totalRules}</span>
      </div>
      <Collapse
        defaultActiveKey={["service", "region"]}
        ghost
        items={[
          {
            key: "service",
            label: "服务组",
            extra: (
              <IconAction label="新建策略组" onClick={props.onCreateGroup}>
                <Plus size={14} />
              </IconAction>
            ),
            children: service.map(Row),
          },
          {
            key: "region",
            label: "地区组",
            children: region.map(Row),
          },
        ]}
      />
    </div>
  );
}
