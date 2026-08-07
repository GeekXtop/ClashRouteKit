import type { DragEvent } from "react";
import { Switch, Tag } from "antd";
import { GripVertical, Pencil } from "lucide-react";
import type { RuleSet } from "@clash-route-kit/core";
import type { PolicyTone } from "../proxyGroups.js";

export function RuleRow({
  ruleSet,
  sourceText,
  tone,
  selected,
  onSelect,
  onToggle,
  onEdit,
  incompleteProvider = false,
  dragHandlers,
}: {
  ruleSet: RuleSet;
  sourceText: string;
  tone: PolicyTone;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onEdit: () => void;
  incompleteProvider?: boolean;
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
      className={`rk-rule-row tone-${tone} ${selected ? "sel" : ""}`}
      draggable={dragHandlers.draggable}
      onDragStart={dragHandlers.onDragStart}
      onDragOver={dragHandlers.onDragOver}
      onDrop={dragHandlers.onDrop}
      onClick={onSelect}
    >
      <GripVertical size={14} className="rk-grip" />
      <span className="rk-src">{sourceText}</span>
      {incompleteProvider ? <span className="rk-tag warn">规则源待补全</span> : null}
      <Tag style={{ marginLeft: "auto" }}>{ruleSet.policy}</Tag>
      {!isFinal ? (
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
