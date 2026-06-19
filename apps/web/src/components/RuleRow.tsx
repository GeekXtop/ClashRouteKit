import type { DragEvent } from "react";
import { Switch, Tag } from "antd";
import { GripVertical, X } from "lucide-react";
import type { RuleSet } from "@clash-route-kit/core";
import type { PolicyTone } from "../proxyGroups.js";

export function RuleRow({
  ruleSet,
  sourceText,
  tone,
  selected,
  onSelect,
  onToggle,
  onDelete,
  dragHandlers,
}: {
  ruleSet: RuleSet;
  sourceText: string;
  tone: PolicyTone;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
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
      <Tag style={{ marginLeft: "auto" }}>{ruleSet.policy}</Tag>
      {!isFinal ? (
        <Switch
          size="small"
          checked={ruleSet.enabled !== false}
          onClick={(_checked, e) => e.stopPropagation()}
          onChange={onToggle}
        />
      ) : null}
      {!isFinal ? (
        <button
          type="button"
          aria-label={`删除 ${ruleSet.id}`}
          className="rk-iconbtn rk-del"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <X size={13} />
        </button>
      ) : null}
    </div>
  );
}
