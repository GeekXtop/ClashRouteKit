import { useRef } from "react";
import { Button } from "antd";
import { Plus } from "lucide-react";
import type { RuleSet } from "@clash-route-kit/core";
import { policyTone } from "../proxyGroups.js";
import { ruleSetSourceText } from "../routeSummary.js";
import { RuleRow } from "./RuleRow.js";

export function RuleStream(props: {
  ruleSets: RuleSet[];
  selectedGroup: string | null;
  selectedRuleSetId: string;
  onSelectRuleSet: (id: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  allOrderedIds: string[];
  onAddRule: () => void;
}) {
  const dragId = useRef<string | null>(null);
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
                sourceText={ruleSetSourceText(ruleSet)}
                tone={ruleSet.source.type === "final" ? "fin" : policyTone(ruleSet.policy)}
                selected={ruleSet.id === props.selectedRuleSetId}
                onSelect={() => props.onSelectRuleSet(ruleSet.id)}
                onToggle={() => props.onToggle(ruleSet.id)}
                onDelete={() => props.onDelete(ruleSet.id)}
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
        {props.ruleSets.length === 0 ? <div className="rk-empty">没有匹配规则</div> : null}
      </div>
    </div>
  );
}
