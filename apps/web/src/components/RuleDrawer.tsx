import { useEffect, useState } from "react";
import { Alert, Button, Drawer, Input, Popconfirm, Select, Space, Switch } from "antd";
import {
  LEGACY_RULE_PROVIDER_INTERVAL,
  resolveGeoipNoResolve,
  resolveRuleProviderInterval,
  type ProviderBehavior,
  type ResolvedConfigValue,
  type RouteKitDefaults,
  type RuleSet,
  type RuleSetSource,
} from "@clash-route-kit/core";
import {
  createRuleSetDraft,
  finalizeRuleSetDraft,
  type EditableRuleSet,
  type EditableRuleSetSource,
} from "../drawerDrafts.js";
import { InheritedNumberSetting } from "./InheritedSettingField.js";

const SOURCE_TYPES: RuleSetSource["type"][] = ["geosite", "geoip", "rule-provider", "final"];
const SOURCE_LABELS: Record<RuleSetSource["type"], string> = {
  geosite: "GEOSITE",
  geoip: "GEOIP",
  "rule-provider": "规则源 / 列表",
  final: "FINAL（兜底）",
};
const BEHAVIORS: ProviderBehavior[] = ["domain", "classical", "ipcidr"];

function makeSource(type: RuleSetSource["type"]): EditableRuleSetSource {
  if (type === "geosite") return { type: "geosite", value: "" };
  if (type === "geoip") return { type: "geoip", value: "" };
  if (type === "rule-provider") return { type: "rule-provider", behavior: "domain", file: "" };
  return { type: "final" };
}

function booleanCaption(resolved: ResolvedConfigValue<boolean>): string {
  const value = resolved.value ? "开启" : "关闭";
  if (resolved.source === "item") return `当前使用单项覆盖：${value}`;
  if (resolved.source === "project") return `继承项目默认值：${value}`;
  return `使用程序默认值：${value}`;
}

export function RuleDrawer(props: {
  open: boolean;
  ruleSet: RuleSet | undefined;
  ruleSetIds: string[];
  policies: string[];
  defaults?: RouteKitDefaults;
  onSave: (nextRuleSet: RuleSet) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<EditableRuleSet | null>(() =>
    props.ruleSet ? createRuleSetDraft(props.ruleSet) : null,
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (props.open && props.ruleSet) {
      setDraft(createRuleSetDraft(props.ruleSet));
      setError("");
    }
  }, [props.open, props.ruleSet?.id]);

  function updateDraft(patch: Partial<EditableRuleSet>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
    setError("");
  }

  function patchSource(source: EditableRuleSetSource) {
    updateDraft({ source });
  }

  function handleSave() {
    if (!draft || !props.ruleSet) return;
    const result = finalizeRuleSetDraft(
      draft,
      props.ruleSetIds,
      props.ruleSet.id,
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    props.onSave(result.value);
  }

  if (!props.ruleSet || !draft) {
    return (
      <Drawer
        open={props.open}
        onClose={props.onCancel}
        width={420}
        title="规则"
      />
    );
  }

  const source = draft.source;

  return (
    <Drawer
      open={props.open}
      onClose={props.onCancel}
      width={420}
      title={`规则 · ${props.ruleSet.id}`}
      footer={(
        <Space style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={props.onCancel}>取消</Button>
          <Button type="primary" onClick={handleSave}>保存</Button>
        </Space>
      )}
    >
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        {error ? <Alert type="error" showIcon message={error} /> : null}
        <div>
          <div className="rk-field-label">ID</div>
          <Input
            aria-label="规则 ID"
            value={draft.id}
            onChange={(event) => updateDraft({ id: event.target.value })}
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
            <div>
              <div className="rk-field-label">no-resolve</div>
              <Select
                aria-label="GEOIP no-resolve"
                style={{ width: "100%" }}
                value={
                  source.noResolve === undefined
                    ? "inherit"
                    : source.noResolve
                      ? "enabled"
                      : "disabled"
                }
                options={[
                  { value: "inherit", label: "继承项目默认值" },
                  { value: "enabled", label: "开启" },
                  { value: "disabled", label: "关闭" },
                ]}
                onChange={(value) =>
                  patchSource({
                    ...source,
                    noResolve: value === "inherit" ? undefined : value === "enabled",
                  })
                }
              />
              <div className="rk-setting-hint">
                {booleanCaption(resolveGeoipNoResolve(source, props.defaults))}
              </div>
            </div>
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
            <InheritedNumberSetting
              label="更新间隔（秒）"
              value={source.interval}
              resolved={resolveRuleProviderInterval(
                { ...source, interval: source.interval ?? undefined },
                props.defaults,
              )}
              customFallback={LEGACY_RULE_PROVIDER_INTERVAL}
              min={1}
              unit="秒"
              onChange={(interval) => patchSource({ ...source, interval })}
            />
          </>
        ) : null}
        <div>
          <div className="rk-field-label">归属策略组</div>
          <Select
            aria-label="归属策略组"
            style={{ width: "100%" }}
            value={draft.policy}
            options={props.policies.map((policy) => ({ value: policy, label: policy }))}
            onChange={(policy) => updateDraft({ policy })}
          />
        </div>
        <div>
          <div className="rk-field-label">分节（可空）</div>
          <Input
            value={draft.section ?? ""}
            onChange={(event) => updateDraft({ section: event.target.value })}
          />
        </div>
        {source.type !== "final" ? (
          <>
            <Space>
              <Switch
                checked={draft.enabled !== false}
                onChange={(enabled) => updateDraft({ enabled })}
              />
              <span className="rk-field-label">启用</span>
            </Space>
            <Popconfirm title={`删除规则 ${props.ruleSet.id}？`} okText="删除" cancelText="取消" onConfirm={props.onDelete}>
              <Button danger>删除规则</Button>
            </Popconfirm>
          </>
        ) : null}
      </Space>
    </Drawer>
  );
}
