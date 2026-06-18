import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CustomProxyGroup } from "@clash-route-kit/core";
import {
  REGION_PRESETS,
  buildProxyGroupTree,
  composeNodeFilter,
  detectProxyGroupCycles,
  type NodeFilterScopeType,
  type ProxyGroupTreeNode,
} from "../proxyGroups.js";
import type { InboundRuleSetRow } from "../routeSummary.js";

const groupTypes: CustomProxyGroup["type"][] = ["select", "url-test", "fallback", "load-balance"];

function previewCustomProxyGroup(group: CustomProxyGroup): string {
  const optionRefs = group.options.map((option) => `[]${option}`);
  const options = [...optionRefs, ...(group.nodeFilters ?? [])].join("`");
  if (group.type === "select") {
    return `custom_proxy_group=${group.name}\`select\`${options}`;
  }

  const url = group.url ?? "https://cp.cloudflare.com/generate_204";
  const interval = group.interval ?? 300;
  const tolerance = group.tolerance ?? 50;
  return `custom_proxy_group=${group.name}\`${group.type}\`${options}\`${url}\`${interval},,${tolerance}`;
}

function renderTreeNode(node: ProxyGroupTreeNode, path: string): ReactNode {
  return (
    <div key={path} className="tree-node">
      <span className={`tree-label ${node.cyclic ? "cyclic" : ""} ${node.external ? "external" : ""}`}>
        {node.name}
        {node.cyclic ? " ↺ (环)" : ""}
      </span>
      {node.children.length > 0 ? (
        <div className="tree-children">
          {node.children.map((child, index) => renderTreeNode(child, `${path}/${child.name}-${index}`))}
        </div>
      ) : null}
    </div>
  );
}

export function CustomProxyGroupEditor({
  group,
  groups,
  onDeleteGroup,
  onRenameGroup,
  onSetGroupListField,
  onUpdateGroup,
  inboundRuleSets = [],
  onJumpToRuleSet,
  onDeleteRuleSet,
  onAddInboundRule,
}: {
  group: CustomProxyGroup | undefined;
  groups: CustomProxyGroup[];
  onDeleteGroup: (groupName: string) => void;
  onRenameGroup: (groupName: string, nextGroupName: string) => void;
  onSetGroupListField: (groupName: string, field: "options" | "nodeFilters", values: string[]) => void;
  onUpdateGroup: (groupName: string, patch: Partial<CustomProxyGroup>) => void;
  inboundRuleSets?: InboundRuleSetRow[];
  onJumpToRuleSet?: (ruleSetId: string) => void;
  onDeleteRuleSet?: (ruleSetId: string) => void;
  onAddInboundRule?: () => void;
}) {
  const [nameDraft, setNameDraft] = useState(group?.name ?? "");
  const [scopeType, setScopeType] = useState<NodeFilterScopeType>("all");
  const [scopeValue, setScopeValue] = useState("");
  const [regex, setRegex] = useState("");
  const dragIndexRef = useRef<number | null>(null);

  useEffect(() => {
    setNameDraft(group?.name ?? "");
  }, [group?.name]);

  if (!group) {
    return (
      <section className="panel editor-panel">
        <div className="empty-state">暂无 custom_proxy_group</div>
      </section>
    );
  }

  const options = group.options;
  const nodeFilters = group.nodeFilters ?? [];

  function commitNameDraft() {
    if (!group || nameDraft === group.name) return;
    onRenameGroup(group.name, nameDraft);
  }

  function addReference(name: string) {
    if (!group || !name || options.includes(name)) return;
    onSetGroupListField(group.name, "options", [...options, name]);
  }

  function removeReference(option: string) {
    if (!group) return;
    onSetGroupListField(
      group.name,
      "options",
      options.filter((item) => item !== option),
    );
  }

  function moveReference(from: number, to: number) {
    if (!group || from === to) return;
    const next = [...options];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    onSetGroupListField(group.name, "options", next);
  }

  function addNodeFilter() {
    if (!group) return;
    const composed = composeNodeFilter({ scopeType, scopeValue, regex });
    onSetGroupListField(group.name, "nodeFilters", [...nodeFilters, composed]);
    setRegex("");
  }

  function removeNodeFilter(index: number) {
    if (!group) return;
    onSetGroupListField(
      group.name,
      "nodeFilters",
      nodeFilters.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  const referenceCandidates = [
    ...groups.filter((item) => item.name !== group.name).map((item) => item.name),
    "DIRECT",
    "REJECT",
  ].filter((name) => !options.includes(name));

  const relevantCycle = detectProxyGroupCycles(groups).find((cycle) => cycle.includes(group.name));

  return (
    <section className="panel editor-panel">
      <div className="panel-heading">
        <div>
          <h2>编辑 Custom Proxy Group</h2>
          <span>{group.name}</span>
        </div>
        <button
          className="del-x"
          type="button"
          aria-label={`删除 ${group.name}`}
          onClick={() => {
            if (window.confirm(`删除 custom_proxy_group ${group.name}？`)) onDeleteGroup(group.name);
          }}
        >
          ✕
        </button>
      </div>

      {relevantCycle ? (
        <p className="project-message error cycle-warning">
          ⚠ 检测到引用环：{[...relevantCycle, relevantCycle[0]].join(" → ")}
        </p>
      ) : null}

      <div className="form-grid">
        <label>
          <span>名称</span>
          <input
            value={nameDraft}
            onBlur={commitNameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </label>
        <label>
          <span>类型</span>
          <select
            value={group.type}
            onChange={(event) => onUpdateGroup(group.name, { type: event.target.value as CustomProxyGroup["type"] })}
          >
            {groupTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <label>
          <span>测速 URL</span>
          <input
            value={group.url ?? ""}
            onChange={(event) => onUpdateGroup(group.name, { url: event.target.value || undefined })}
          />
        </label>
        <label>
          <span>间隔</span>
          <input
            inputMode="numeric"
            value={group.interval ?? ""}
            onChange={(event) =>
              onUpdateGroup(group.name, { interval: event.target.value ? Number(event.target.value) : undefined })
            }
          />
        </label>
        <label>
          <span>容差</span>
          <input
            inputMode="numeric"
            value={group.tolerance ?? ""}
            onChange={(event) =>
              onUpdateGroup(group.name, { tolerance: event.target.value ? Number(event.target.value) : undefined })
            }
          />
        </label>
      </div>

      <div className="group-section">
        <div className="entity-list-header">
          <h3>
            指向本组的规则 <span className="muted-count">{inboundRuleSets.length}</span>
          </h3>
          <button type="button" className="link-button" onClick={() => onAddInboundRule?.()}>
            + 添加规则
          </button>
        </div>
        <p className="section-hint">命中这些规则的流量进入本组（在路由页按顺序匹配）。</p>
        <div className="inbound-rules">
          {inboundRuleSets.map((row) => (
            <div key={row.id} className={`inbound-rule ${row.enabled ? "" : "disabled"}`}>
              <code>{row.source}</code>
              <button
                type="button"
                className="inbound-jump"
                aria-label={`在路由中查看 ${row.id}`}
                onClick={() => onJumpToRuleSet?.(row.id)}
              >
                ↗ 路由
              </button>
              <button
                type="button"
                className="inbound-remove"
                aria-label={`移除规则 ${row.id}`}
                onClick={() => onDeleteRuleSet?.(row.id)}
              >
                ×
              </button>
            </div>
          ))}
          {inboundRuleSets.length === 0 ? <span className="empty-line">暂无规则指向本组</span> : null}
        </div>
      </div>

      <div className="group-section">
        <div className="entity-list-header">
          <h3>引用（出口顺序）</h3>
          <select
            aria-label="添加引用"
            value=""
            onChange={(event) => {
              addReference(event.target.value);
            }}
          >
            <option value="">+ 添加引用</option>
            {referenceCandidates.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className="reference-chips">
          {options.map((option, index) => (
            <span
              key={`${option}-${index}`}
              className="reference-chip"
              data-testid={`chip-${option}`}
              draggable
              onDragStart={() => {
                dragIndexRef.current = index;
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const from = dragIndexRef.current;
                dragIndexRef.current = null;
                if (from !== null) moveReference(from, index);
              }}
            >
              <span>{option}</span>
              <button type="button" aria-label={`移除 ${option}`} onClick={() => removeReference(option)}>
                ×
              </button>
            </span>
          ))}
          {options.length === 0 ? <span className="empty-line">暂无引用</span> : null}
        </div>
      </div>

      <div className="group-section">
        <div className="entity-list-header">
          <h3>节点筛选</h3>
        </div>
        <div className="node-filter-composer">
          <select
            aria-label="来源范围"
            value={scopeType}
            onChange={(event) => setScopeType(event.target.value as NodeFilterScopeType)}
          >
            <option value="all">全部节点</option>
            <option value="groupId">按 GROUPID</option>
            <option value="group">按 GROUP 标签</option>
          </select>
          {scopeType !== "all" ? (
            <input
              aria-label="范围值"
              placeholder={scopeType === "groupId" ? "组序号，如 0" : "组标签"}
              value={scopeValue}
              onChange={(event) => setScopeValue(event.target.value)}
            />
          ) : null}
          <input
            aria-label="名称正则"
            placeholder="正则，如 (港|HK)"
            value={regex}
            onChange={(event) => setRegex(event.target.value)}
          />
          <button type="button" className="command-button" onClick={addNodeFilter}>
            添加筛选
          </button>
        </div>
        <div className="region-presets">
          {REGION_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.label}
              className="preset-chip"
              onClick={() => setRegex(preset.regex)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="reference-chips">
          {nodeFilters.map((filter, index) => (
            <span key={`${filter}-${index}`} className="reference-chip">
              <span>{filter}</span>
              <button type="button" aria-label={`移除筛选 ${filter}`} onClick={() => removeNodeFilter(index)}>
                ×
              </button>
            </span>
          ))}
          {nodeFilters.length === 0 ? <span className="empty-line">暂无节点筛选</span> : null}
        </div>
      </div>

      <div className="group-section">
        <div className="entity-list-header">
          <h3>引用关系树</h3>
        </div>
        <div className="reference-tree">{renderTreeNode(buildProxyGroupTree(groups, group.name), group.name)}</div>
      </div>

      <div className="group-section">
        <label className="wide-field">
          <span>custom_proxy_group= 预览</span>
          <code className="output-line">{previewCustomProxyGroup(group)}</code>
        </label>
      </div>
    </section>
  );
}
