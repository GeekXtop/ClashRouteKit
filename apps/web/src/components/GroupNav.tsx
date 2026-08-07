import type { ReactNode } from "react";
import { Dropdown, Space } from "antd";
import { Pencil, Plus, Settings } from "lucide-react";
import type { CustomProxyGroup } from "@clash-route-kit/core";
import type { CustomProxyGroupStat } from "../routeSummary.js";

const GROUP_TYPES: CustomProxyGroup["type"][] = [
  "select",
  "url-test",
  "fallback",
  "load-balance",
];

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="rk-iconbtn"
      onClick={(event) => {
        event.stopPropagation();
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
  onCreateGroup: (type: CustomProxyGroup["type"]) => void;
  onOpenDefaults: () => void;
}) {
  const stats = new Map(props.stats.map((item) => [item.name, item]));

  return (
    <div className="rk-groupnav">
      <div className="rk-nav-head">
        <strong>策略组</strong>
        <Space size={2}>
          <IconAction label="项目默认值" onClick={props.onOpenDefaults}>
            <Settings size={14} />
          </IconAction>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: GROUP_TYPES.map((type) => ({ key: type, label: type })),
              onClick: ({ key }) => props.onCreateGroup(key as CustomProxyGroup["type"]),
            }}
          >
            <button type="button" aria-label="新建策略组" className="rk-iconbtn">
              <Plus size={14} />
            </button>
          </Dropdown>
        </Space>
      </div>
      <div className="rk-nav-body">
        <div
          className={`rk-nav-row ${props.selectedGroup === null ? "on" : ""}`}
          onClick={() => props.onSelectGroup(null)}
        >
          <span className="rk-nav-name">全部规则</span>
          <span className="rk-nav-count">{props.totalRules}</span>
        </div>
        {props.groups.map((group) => {
          const stat = stats.get(group.name);
          return (
            <div
              key={group.name}
              className={`rk-nav-row ${props.selectedGroup === group.name ? "on" : ""}`}
              onClick={() => props.onSelectGroup(group.name)}
            >
              <span className="rk-nav-name">{group.name}</span>
              <span className="rk-tag rk-nav-type">{group.type}</span>
              <span className="rk-nav-count">
                规则 {stat?.directRuleSetCount ?? 0} · 引用 {stat?.referencedByGroupCount ?? 0}
              </span>
              <IconAction label={`编辑 ${group.name}`} onClick={() => props.onEditGroup(group.name)}>
                <Pencil size={12} />
              </IconAction>
            </div>
          );
        })}
      </div>
    </div>
  );
}
