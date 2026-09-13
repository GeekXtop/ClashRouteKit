import type { DragEvent } from "react";
import { Switch, Tag } from "antd";
import { CircleAlert, GripVertical, Pencil } from "lucide-react";
import type { Diagnostic, RuleSet } from "@clash-route-kit/core";
import type { PolicyTone } from "../proxyGroups.js";

export function RuleRow({
  ruleSet,
  sourceText,
  tone,
  selected,
  located = false,
  issues = [],
  onSelect,
  onToggle,
  onEdit,
  incompleteProvider = false,
  showToggle = true,
  dragHandlers,
}: {
  ruleSet: RuleSet;
  sourceText: string;
  tone: PolicyTone;
  selected: boolean;
  located?: boolean;
  issues?: readonly Diagnostic[];
  onSelect: () => void;
  onToggle: () => void;
  onEdit: () => void;
  incompleteProvider?: boolean;
  /** v2 路由无 enabled 语义，列表开关隐藏。 */
  showToggle?: boolean;
  dragHandlers: {
    draggable: boolean;
    onDragStart: () => void;
    onDragOver: (e: DragEvent) => void;
    onDrop: () => void;
  };
}) {
  const isFinal = ruleSet.source.type === "final";
  return (
    <div
      data-testid={`route-row-${ruleSet.id}`}
      tabIndex={-1}
      className={`rk-rule-row tone-${tone} ${selected ? "sel" : ""} ${located ? "hit" : ""}`}
      draggable={dragHandlers.draggable}
      onDragStart={dragHandlers.onDragStart}
      onDragOver={dragHandlers.onDragOver}
      onDrop={dragHandlers.onDrop}
      onClick={onSelect}
    >
      <GripVertical size={14} className="rk-grip" />
      <span className="rk-src">{sourceText}</span>
      {incompleteProvider ? <span className="rk-tag warn">规则源待补全</span> : null}
      {issues.length > 0 ? (
        <span
          className="rk-diag"
          title={issues.map((issue) => issue.message).join("\n")}
        >
          <CircleAlert size={12} aria-hidden />
          {issues[0]!.message}
        </span>
      ) : null}
      <Tag style={{ marginLeft: "auto" }}>{ruleSet.policy}</Tag>
      {showToggle && !isFinal ? (
        <Switch
          size="small"
          checked={ruleSet.enabled !== false}
          onClick={(_checked, e) => e.stopPropagation()}
          onChange={onToggle}
        />
      ) : null}
      <button
        type="button"
        aria-label={`编辑 ${ruleSet.id}`}
        className="rk-iconbtn"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
      >
        <Pencil size={13} />
      </button>
    </div>
  );
}
