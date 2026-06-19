import { useEffect, useState } from "react";
import { Button, Drawer, Input, InputNumber, Popconfirm, Select, Space, Switch } from "antd";
import type { ProviderBehavior, RuleSet, RuleSetSource } from "@clash-route-kit/core";

const SOURCE_TYPES: RuleSetSource["type"][] = ["geosite", "geoip", "rule-provider", "final"];
const SOURCE_LABELS: Record<RuleSetSource["type"], string> = {
  geosite: "GEOSITE",
  geoip: "GEOIP",
  "rule-provider": "规则源 / 列表",
  final: "FINAL（兜底）",
};
const BEHAVIORS: ProviderBehavior[] = ["domain", "classical", "ipcidr"];

function makeSource(type: RuleSetSource["type"]): RuleSetSource {
  if (type === "geosite") return { type: "geosite", value: "" };
  if (type === "geoip") return { type: "geoip", value: "", noResolve: true };
  if (type === "rule-provider") return { type: "rule-provider", behavior: "domain", file: "" };
  return { type: "final" };
}

export function RuleDrawer(props: {
  open: boolean;
  ruleSet: RuleSet | undefined;
  policies: string[];
  onClose: () => void;
  onUpdate: (patch: Partial<RuleSet>) => void;
  onDelete: () => void;
}) {
  const { ruleSet } = props;
  const [id, setId] = useState(ruleSet?.id ?? "");
  useEffect(() => setId(ruleSet?.id ?? ""), [ruleSet?.id]);
  if (!ruleSet) return <Drawer open={props.open} onClose={props.onClose} width={420} title="规则" />;

  const source = ruleSet.source;
  const patchSource = (next: RuleSetSource) => props.onUpdate({ source: next });

  return (
    <Drawer open={props.open} onClose={props.onClose} width={420} title={`规则 · ${ruleSet.id}`}>
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <div>
          <div className="rk-field-label">ID</div>
          <Input
            aria-label="规则 ID"
            value={id}
            onChange={(e) => setId(e.target.value)}
            onBlur={() => id.trim() && id.trim() !== ruleSet.id && props.onUpdate({ id: id.trim() })}
          />
        </div>
        <div>
          <div className="rk-field-label">来源类型</div>
          <Select
            aria-label="来源类型"
            style={{ width: "100%" }}
            value={source.type}
            options={SOURCE_TYPES.map((t) => ({ value: t, label: SOURCE_LABELS[t] }))}
            onChange={(type) => patchSource(makeSource(type))}
          />
        </div>
        {source.type === "geosite" ? (
          <div>
            <div className="rk-field-label">GEOSITE 值</div>
            <Input value={source.value} onChange={(e) => patchSource({ type: "geosite", value: e.target.value })} />
          </div>
        ) : null}
        {source.type === "geoip" ? (
          <>
            <div>
              <div className="rk-field-label">GEOIP 值</div>
              <Input
                value={source.value}
                onChange={(e) => patchSource({ ...source, value: e.target.value })}
              />
            </div>
            <Space>
              <Switch checked={source.noResolve !== false} onChange={(checked) => patchSource({ ...source, noResolve: checked })} />
              <span className="rk-field-label">no-resolve</span>
            </Space>
          </>
        ) : null}
        {source.type === "rule-provider" ? (
          <>
            <div>
              <div className="rk-field-label">behavior</div>
              <Select
                style={{ width: "100%" }}
                value={source.behavior}
                options={BEHAVIORS.map((b) => ({ value: b, label: b }))}
                onChange={(behavior) => patchSource({ ...source, behavior })}
              />
            </div>
            <div>
              <div className="rk-field-label">文件 / 列表（如 AI_Domain.yaml）</div>
              <Input value={source.file} onChange={(e) => patchSource({ ...source, file: e.target.value })} />
            </div>
            <div>
              <div className="rk-field-label">更新间隔（秒，可空）</div>
              <InputNumber
                style={{ width: "100%" }}
                value={source.interval}
                onChange={(value) => patchSource({ ...source, interval: value ?? undefined })}
              />
            </div>
          </>
        ) : null}
        <div>
          <div className="rk-field-label">归属策略组</div>
          <Select
            aria-label="归属策略组"
            style={{ width: "100%" }}
            value={ruleSet.policy}
            options={props.policies.map((p) => ({ value: p, label: p }))}
            onChange={(policy) => props.onUpdate({ policy })}
          />
        </div>
        <div>
          <div className="rk-field-label">分节（可空）</div>
          <Input
            value={ruleSet.section ?? ""}
            onChange={(e) => props.onUpdate({ section: e.target.value || undefined })}
          />
        </div>
        {source.type !== "final" ? (
          <>
            <Space>
              <Switch checked={ruleSet.enabled !== false} onChange={(checked) => props.onUpdate({ enabled: checked })} />
              <span className="rk-field-label">启用</span>
            </Space>
            <Popconfirm title={`删除规则 ${ruleSet.id}？`} okText="删除" cancelText="取消" onConfirm={props.onDelete}>
              <Button danger>删除规则</Button>
            </Popconfirm>
          </>
        ) : null}
      </Space>
    </Drawer>
  );
}
