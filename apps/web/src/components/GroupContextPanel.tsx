import type { ReactNode } from "react";
import { Button, Space } from "antd";
import { Pencil } from "lucide-react";
import type { CustomProxyGroup, ResolvedConfigValue } from "@clash-route-kit/core";
import type { CustomProxyGroupDetails } from "../routeSummary.js";

function sourceLabel(source: ResolvedConfigValue<unknown>["source"]): string {
  if (source === "item") return "单项覆盖";
  if (source === "project") return "继承项目默认值";
  if (source === "empty") return "明确留空";
  return "程序默认值";
}

function EffectiveValue(props: {
  label: string;
  resolved: ResolvedConfigValue<string | number>;
  unit?: string;
}) {
  const value =
    props.resolved.value === undefined
      ? "留空"
      : `${props.resolved.value}${props.unit ? ` ${props.unit}` : ""}`;
  return (
    <div className="rk-group-effective-row">
      <span className="rk-group-effective-label">{props.label}</span>
      <span className="rk-group-effective-value">{value}</span>
      <span className="rk-tag">{sourceLabel(props.resolved.source)}</span>
    </div>
  );
}

export function GroupContextPanel(props: {
  group: CustomProxyGroup;
  details: CustomProxyGroupDetails;
  onEdit: () => void;
  onSelectParent: (name: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="rk-group-context">
      <div className="rk-group-context-summary">
        <div className="rk-group-context-head">
          <Space>
            <strong>{props.group.name}</strong>
            <span className="rk-tag">{props.group.type}</span>
            <span className="rk-nav-count">成员 {props.details.memberCount}</span>
          </Space>
          <Button size="small" icon={<Pencil size={13} />} onClick={props.onEdit}>
            编辑策略组
          </Button>
        </div>

        <div className="rk-group-context-grid">
          <section>
            <div className="rk-field-label">被以下策略组引用</div>
            {props.details.referencedByGroups.length > 0 ? (
              props.details.referencedByGroups.map((parent) => (
                <button
                  type="button"
                  key={parent.name}
                  className="rk-group-ref"
                  onClick={() => props.onSelectParent(parent.name)}
                >
                  <span>{parent.name}</span>
                  <span className="rk-tag">{parent.type}</span>
                </button>
              ))
            ) : (
              <div className="rk-setting-hint">没有其他策略组引用此组</div>
            )}
          </section>

          <section>
            <div className="rk-field-label">下游策略组 / 内置策略</div>
            <div className="rk-group-token-list">
              {props.group.options.length > 0
                ? props.group.options.map((option) => (
                    <span key={option} className="rk-tag">
                      {option}
                    </span>
                  ))
                : <span className="rk-setting-hint">无</span>}
            </div>
            <div className="rk-field-label rk-group-sub-label">节点过滤正则</div>
            <div className="rk-group-token-list">
              {(props.group.nodeFilters ?? []).length > 0
                ? props.group.nodeFilters?.map((filter) => (
                    <code key={filter} className="rk-group-filter">
                      {filter}
                    </code>
                  ))
                : <span className="rk-setting-hint">无</span>}
            </div>
          </section>
        </div>

        {props.details.healthCheck ? (
          <section className="rk-group-health">
            <div className="rk-field-label">有效健康检查</div>
            <EffectiveValue label="测速 URL" resolved={props.details.healthCheck.url} />
            <EffectiveValue label="测速间隔" resolved={props.details.healthCheck.interval} unit="秒" />
            <EffectiveValue label="测速超时" resolved={props.details.healthCheck.timeout} unit="秒" />
            {props.group.type === "url-test" ? (
              <EffectiveValue label="URLTest 容差" resolved={props.details.healthCheck.tolerance} unit="毫秒" />
            ) : null}
          </section>
        ) : null}
      </div>
      <div className="rk-group-context-rules">{props.children}</div>
    </div>
  );
}
