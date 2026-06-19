import type { DragEvent } from "react";
import { Select, Switch } from "antd";
import { GripVertical, Pencil, X } from "lucide-react";
import type { RuleSet } from "@clash-route-kit/core";
import type { PolicyTone } from "../proxyGroups.js";

export function RuleRow({
  ruleSet,
  sourceText,
  tone,
  policies,
  selected,
  onSelect,
  onPolicyChange,
  onToggle,
  onDelete,
  onEditSource,
  dragHandlers,
}: {
  ruleSet: RuleSet;
  sourceText: string;
  tone: PolicyTone;
  policies: string[];
  selected: boolean;
  onSelect: () => void;
  onPolicyChange: (policy: string) => void;
  onToggle: () => void;
  onDelete: () => void;
  onEditSource: () => void;
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
      {!isFinal ? (
        <button
          type="button"
          aria-label={`编辑来源 ${ruleSet.id}`}
          className="rk-iconbtn"
          onClick={(e) => {
            e.stopPropagation();
            onEditSource();
          }}
        >
          <Pencil size={12} />
        </button>
      ) : null}
      <Select
        size="small"
        value={ruleSet.policy}
        options={policies.map((name) => ({ value: name, label: name }))}
        onClick={(e) => e.stopPropagation()}
        onChange={onPolicyChange}
        style={{ marginLeft: "auto", minWidth: 120 }}
      />
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
