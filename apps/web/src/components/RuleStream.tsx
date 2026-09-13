import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "antd";
import { Plus } from "lucide-react";
import type { Diagnostic, RouteKitDefaults, RuleSet } from "@clash-route-kit/core";
import { attrSelector, locateElement } from "../domLocate.js";
import { policyTone } from "../proxyGroups.js";
import { ruleSetSourceText } from "../routeSummary.js";
import { RuleRow } from "./RuleRow.js";

export interface RuleLocate {
  ruleId: string;
  nonce: number;
}

export function RuleStream(props: {
  ruleSets: RuleSet[];
  selectedGroup: string | null;
  selectedRuleSetId: string;
  incompleteProviderOutputs?: Set<string>;
  emptyDescription?: ReactNode;
  defaults?: RouteKitDefaults;
  issuesByRuleId?: ReadonlyMap<string, readonly Diagnostic[]>;
  locate?: RuleLocate | null;
  onSelectRuleSet: (id: string) => void;
  onToggle: (id: string) => void;
  onEditRule: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  allOrderedIds: string[];
  onAddRule: () => void;
  /** v2 路由无 enabled 语义：列表隐藏启用开关。 */
  showEnabledToggle?: boolean;
}) {
  const dragId = useRef<string | null>(null);

  useEffect(() => {
    if (!props.locate) return;
    locateElement(
      attrSelector("data-testid", `route-row-${props.locate.ruleId}`),
      "center",
    );
  }, [props.locate]);

  const sections: { label: string; rows: RuleSet[] }[] = [];
  for (const ruleSet of props.ruleSets) {
    const label = ruleSet.section?.trim() || "默认";
    const bucket = sections.find((s) => s.label === label);
    if (bucket) {
      bucket.rows.push(ruleSet);
    } else {
      sections.push({ label, rows: [ruleSet] });
    }
  }

  function drop(targetId: string) {
    const id = dragId.current;
    dragId.current = null;
    if (!id || id === targetId) return;
    const ids = props.allOrderedIds.filter((x) => x !== id);
    const at = ids.indexOf(targetId);
    if (at === -1) return;
    ids.splice(at, 0, id);
    props.onReorder(ids);
  }

  return (
    <div className="rk-stream">
      <div className="rk-stream-head">
        <strong>路由规则 · {props.selectedGroup ?? "全部"}</strong>
        <Button type="primary" size="small" icon={<Plus size={14} />} onClick={props.onAddRule}>
          {props.selectedGroup ? `给「${props.selectedGroup}」添加规则` : "添加规则"}
        </Button>
      </div>
      <div className="rk-stream-body">
        {sections.map((section) => (
          <div key={section.label}>
            {section.label === "默认" ? null : <div className="rk-section">; {section.label}</div>}
            {section.rows.map((ruleSet) => (
              <RuleRow
                key={ruleSet.id}
                ruleSet={ruleSet}
                sourceText={ruleSetSourceText(ruleSet, props.defaults)}
                tone={ruleSet.source.type === "final" ? "fin" : policyTone(ruleSet.policy)}
                selected={ruleSet.id === props.selectedRuleSetId}
                located={ruleSet.id === props.locate?.ruleId}
                issues={props.issuesByRuleId?.get(ruleSet.id) ?? []}
                incompleteProvider={
                  ruleSet.source.type === "rule-provider" &&
                  Boolean(props.incompleteProviderOutputs?.has(ruleSet.source.file))
                }
                showToggle={props.showEnabledToggle !== false}
                onSelect={() => props.onSelectRuleSet(ruleSet.id)}
                onToggle={() => props.onToggle(ruleSet.id)}
                onEdit={() => props.onEditRule(ruleSet.id)}
                dragHandlers={{
                  draggable: true,
                  onDragStart: () => (dragId.current = ruleSet.id),
                  onDragOver: (e) => e.preventDefault(),
                  onDrop: () => drop(ruleSet.id),
                }}
              />
            ))}
          </div>
        ))}
        {props.ruleSets.length === 0 ? (
          <div className="rk-empty">{props.emptyDescription ?? "没有匹配规则"}</div>
        ) : null}
      </div>
    </div>
  );
}
