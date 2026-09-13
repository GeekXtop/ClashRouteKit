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
  type RouteV2,
} from "@clash-route-kit/core";
import {
  createRuleSetDraft,
  finalizeRuleSetDraft,
  type EditableRuleSet,
  type EditableRuleSetSource,
} from "../drawerDrafts.js";
import {
  createV2RouteDraft,
  finalizeV2RouteDraft,
  makeV2RouteSource,
  type V2RouteDraft,
} from "../v2/drawerDrafts.js";
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
  ruleSet?: RuleSet | undefined;
  ruleSetIds: string[];
  policies: string[];
  defaults?: RouteKitDefaults;
  onSave: (nextRuleSet: RuleSet) => void;
  onCancel: () => void;
  onDelete: () => void;
  /** 存在时走 Schema v2 稳定 ID 通路：policy 写 { group: id }，来源为 RouteSourceV2。 */
  v2?: {
    route: RouteV2;
    groups: { id: string; name: string }[];
    providers: { id: string; name: string }[];
    routeIds: string[];
    onSave: (nextRoute: RouteV2) => void;
  };
}) {
  const [v1Draft, setV1Draft] = useState<EditableRuleSet | null>(() =>
    props.ruleSet ? createRuleSetDraft(props.ruleSet) : null,
  );
  const [v2Draft, setV2Draft] = useState<V2RouteDraft | null>(() =>
    props.v2 ? createV2RouteDraft(props.v2.route) : null,
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (props.open && props.v2?.route) {
      setV2Draft(createV2RouteDraft(props.v2.route));
      setV1Draft(null);
      setError("");
    }
  }, [props.open, props.v2?.route?.id]);

  useEffect(() => {
    if (props.open && props.ruleSet && !props.v2) {
      setV1Draft(createRuleSetDraft(props.ruleSet));
      setV2Draft(null);
      setError("");
    }
  }, [props.open, props.ruleSet?.id, props.v2]);

  function updateDraft(patch: Partial<EditableRuleSet>) {
    setV1Draft((current) => (current ? { ...current, ...patch } : current));
    setError("");
  }

  function updateV2Draft(patch: Partial<V2RouteDraft>) {
    setV2Draft((current) => (current ? { ...current, ...patch } : current));
    setError("");
  }

  function patchSource(source: EditableRuleSetSource) {
    updateDraft({ source });
  }

  function patchV2Source(source: V2RouteDraft["source"]) {
    updateV2Draft({ source });
  }

  function handleSave() {
    if (props.v2) {
      if (!v2Draft) return;
      const result = finalizeV2RouteDraft(v2Draft, props.v2.routeIds, props.v2.route.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      props.v2.onSave(result.value);
      return;
    }
    if (!v1Draft || !props.ruleSet) return;
    const result = finalizeRuleSetDraft(v1Draft, props.ruleSetIds, props.ruleSet.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    props.onSave(result.value);
  }

  const emptyDrawer = (
    <Drawer open={props.open} onClose={props.onCancel} width={420} title="规则" />
  );

  // ---------------------------------------------------------------------------
  // Schema v2 分支：policy 为组 ID / 内置，来源为 RouteSourceV2
  // ---------------------------------------------------------------------------
  if (props.v2) {
    if (!props.v2.route || !v2Draft) return emptyDrawer;
    const v2 = props.v2;
    const source = v2Draft.source;
    const policyValue = "builtin" in v2Draft.policy ? v2Draft.policy.builtin : v2Draft.policy.group;
    const policyOptions = [
      ...v2.groups.map((group) => ({ value: group.id, label: group.name })),
      { value: "DIRECT", label: "DIRECT" },
      { value: "REJECT", label: "REJECT" },
    ];

    return (
      <Drawer
        open={props.open}
        onClose={props.onCancel}
        width={420}
        title={`规则 · ${v2.route.id}`}
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
              value={v2Draft.id}
              onChange={(event) => updateV2Draft({ id: event.target.value })}
            />
          </div>
          <div>
            <div className="rk-field-label">来源类型</div>
            <Select
              aria-label="来源类型"
              style={{ width: "100%" }}
              value={source.type}
              options={SOURCE_TYPES.map((t) => ({ value: t, label: SOURCE_LABELS[t] }))}
              onChange={(type) => patchV2Source(makeV2RouteSource(type, v2.providers.map((p) => p.id)))}
            />
          </div>
          {source.type === "geosite" ? (
            <div>
              <div className="rk-field-label">GEOSITE 值</div>
              <Input
                value={source.value}
                onChange={(e) => patchV2Source({ type: "geosite", value: e.target.value })}
              />
            </div>
          ) : null}
          {source.type === "geoip" ? (
            <>
              <div>
                <div className="rk-field-label">GEOIP 值</div>
                <Input
                  value={source.value}
                  onChange={(e) => patchV2Source({ ...source, value: e.target.value })}
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
                    patchV2Source({
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
            <div>
              <div className="rk-field-label">规则提供者</div>
              <Select
                aria-label="规则提供者"
                style={{ width: "100%" }}
                value={source.provider || undefined}
                options={v2.providers.map((provider) => ({
                  value: provider.id,
                  label: provider.name,
                }))}
                onChange={(provider) => patchV2Source({ type: "rule-provider", provider })}
              />
            </div>
          ) : null}
          <div>
            <div className="rk-field-label">归属策略组</div>
            <Select
              aria-label="归属策略组"
              style={{ width: "100%" }}
              value={policyValue}
              options={policyOptions}
              onChange={(value) =>
                updateV2Draft({
                  policy:
                    value === "DIRECT" || value === "REJECT"
                      ? { builtin: value }
                      : { group: value },
                })
              }
            />
          </div>
          <div>
            <div className="rk-field-label">分节（可空）</div>
            <Input
              value={v2Draft.section ?? ""}
              onChange={(event) => updateV2Draft({ section: event.target.value })}
            />
          </div>
          {source.type !== "final" ? (
            <Popconfirm
              title={`删除规则 ${props.v2.route.id}？`}
              okText="删除"
              cancelText="取消"
              onConfirm={props.onDelete}
            >
              <Button danger>删除规则</Button>
            </Popconfirm>
          ) : null}
        </Space>
      </Drawer>
    );
  }

  if (!props.ruleSet || !v1Draft) {
    return emptyDrawer;
  }

  const source = v1Draft.source;

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
            value={v1Draft.id}
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
            value={v1Draft.policy}
            options={props.policies.map((policy) => ({ value: policy, label: policy }))}
            onChange={(policy) => updateDraft({ policy })}
          />
        </div>
        <div>
          <div className="rk-field-label">分节（可空）</div>
          <Input
            value={v1Draft.section ?? ""}
            onChange={(event) => updateDraft({ section: event.target.value })}
          />
        </div>
        {source.type !== "final" ? (
          <>
            <Space>
              <Switch
                checked={v1Draft.enabled !== false}
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
