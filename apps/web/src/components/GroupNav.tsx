import { useEffect, type ReactNode } from "react";
import { Dropdown, Space } from "antd";
import { CircleAlert, Gauge, Layers, LifeBuoy, Plus, Scale, Settings } from "lucide-react";
import type { CustomProxyGroup, Diagnostic } from "@clash-route-kit/core";
import { attrSelector, locateElement } from "../domLocate.js";
import type { CustomProxyGroupStat } from "../routeSummary.js";

const GROUP_TYPES: CustomProxyGroup["type"][] = [
  "select",
  "url-test",
  "fallback",
  "load-balance",
];

const GROUP_TYPE_ICONS: Record<CustomProxyGroup["type"], typeof Layers> = {
  select: Layers,
  "url-test": Gauge,
  fallback: LifeBuoy,
  "load-balance": Scale,
};

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

export interface GroupLocate {
  groupName: string;
  nonce: number;
}

/** 紧凑策略组列表：条目 = 类型图标 + 组名 + 「被 N 条路由使用」；点击直接打开编辑抽屉。 */
export function GroupNav(props: {
  groups: CustomProxyGroup[];
  stats: CustomProxyGroupStat[];
  diagnosticsByGroup?: ReadonlyMap<string, readonly Diagnostic[]>;
  totalRules: number;
  selectedGroup: string | null;
  locate?: GroupLocate | null;
  onSelectGroup: (name: string | null) => void;
  onEditGroup: (name: string) => void;
  onCreateGroup: (type: CustomProxyGroup["type"]) => void;
  onOpenDefaults: () => void;
}) {
  const stats = new Map(props.stats.map((item) => [item.name, item]));

  useEffect(() => {
    if (!props.locate) return;
    locateElement(attrSelector("data-group-row", props.locate.groupName), "nearest");
  }, [props.locate]);

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
        <button
          type="button"
          className={`rk-nav-row ${props.selectedGroup === null ? "on" : ""}`}
          onClick={() => props.onSelectGroup(null)}
        >
          <span className="rk-nav-name">全部规则</span>
          <span className="rk-nav-count">{props.totalRules} 条</span>
        </button>
        {props.groups.map((group) => {
          const stat = stats.get(group.name);
          const issues = props.diagnosticsByGroup?.get(group.name) ?? [];
          const Icon = GROUP_TYPE_ICONS[group.type];
          const locateHit = props.locate?.groupName === group.name;
          return (
            <button
              type="button"
              key={group.name}
              data-group-row={group.name}
              title={issues.map((issue) => issue.message).join("\n") || undefined}
              className={[
                "rk-nav-row",
                props.selectedGroup === group.name ? "on" : "",
                issues.length > 0 ? "has-issues" : "",
                locateHit ? "hit" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => props.onEditGroup(group.name)}
            >
              <Icon size={13} aria-hidden className="rk-nav-icon" />
              <span className="rk-nav-name">{group.name}</span>
              <span className="rk-tag rk-nav-type">{group.type}</span>
              {issues.length > 0 ? (
                <span className="rk-nav-issue">
                  <CircleAlert size={12} aria-hidden />
                  {issues.length}
                </span>
              ) : null}
              <span className="rk-nav-count">被 {stat?.directRuleSetCount ?? 0} 条路由使用</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
