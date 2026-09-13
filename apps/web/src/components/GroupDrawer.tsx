import { useEffect, useState } from "react";
import { Alert, Button, Drawer, Input, Popconfirm, Select, Space } from "antd";
import {
  LEGACY_HEALTH_CHECK_INTERVAL,
  LEGACY_HEALTH_CHECK_URL,
  LEGACY_URL_TEST_TOLERANCE,
  resolveProxyGroupHealthCheck,
  type CustomProxyGroup,
  type RouteKitDefaults,
} from "@clash-route-kit/core";
import {
  createCustomProxyGroupDraft,
  finalizeCustomProxyGroupDraft,
  type CustomProxyGroupDraft,
  type EditableCustomProxyGroup,
} from "../drawerDrafts.js";
import { InheritedNumberSetting, InheritedTextSetting } from "./InheritedSettingField.js";

const GROUP_TYPES: CustomProxyGroup["type"][] = ["select", "url-test", "fallback", "load-balance"];

export function GroupDrawer(props: {
  open: boolean;
  group: CustomProxyGroup | undefined;
  groups: CustomProxyGroup[];
  defaults?: RouteKitDefaults;
  inboundCount: number;
  onSave: (nextGroup: CustomProxyGroup) => void;
  onCancel: () => void;
  onDelete: () => void;
  onFilterInRouteList: (groupName: string) => void;
}) {
  const [draft, setDraft] = useState<CustomProxyGroupDraft | null>(() =>
    props.group ? createCustomProxyGroupDraft(props.group) : null,
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (props.open && props.group) {
      setDraft(createCustomProxyGroupDraft(props.group));
      setError("");
    }
  }, [props.open, props.group?.name]);

  function updateGroup(patch: Partial<EditableCustomProxyGroup>) {
    setDraft((current) =>
      current
        ? { ...current, group: { ...current.group, ...patch } }
        : current,
    );
    setError("");
  }

  function handleSave() {
    if (!draft || !props.group) return;
    const result = finalizeCustomProxyGroupDraft(
      draft,
      props.groups,
      props.group.name,
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    props.onSave(result.value);
  }

  const group = draft?.group;
  if (!props.group || !draft || !group) {
    return (
      <Drawer
        open={props.open}
        onClose={props.onCancel}
        width={420}
        title="策略组"
      />
    );
  }

  // 筛选按已保存的组名（规则 policy 指向原名）；抽屉内未保存的改名不影响它。
  const savedGroupName = props.group.name;

  const memberOptions = [
    ...props.groups.filter((g) => g.name !== props.group?.name).map((g) => g.name),
    "DIRECT",
    "REJECT",
  ].map((value) => ({ value, label: value }));
  const healthCheckGroup: CustomProxyGroup = {
    ...group,
    interval: group.interval ?? undefined,
  };
  const healthCheck = group.type === "select"
    ? undefined
    : resolveProxyGroupHealthCheck(healthCheckGroup, props.defaults);

  return (
    <Drawer
      open={props.open}
      onClose={props.onCancel}
      width={420}
      title={`策略组 · ${props.group.name}`}
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
          <div className="rk-field-label">名称</div>
          <Input
            data-rk-name="1"
            value={group.name}
            onChange={(event) => updateGroup({ name: event.target.value })}
          />
        </div>
        <div>
          <div className="rk-field-label">类型</div>
          <Select
            aria-label="策略组类型"
            style={{ width: "100%" }}
            value={group.type}
            options={GROUP_TYPES.map((t) => ({ value: t, label: t }))}
            onChange={(type) => updateGroup({ type })}
          />
        </div>
        <div>
          <div className="rk-field-label">成员（可多选 / 排序）</div>
          <Select
            aria-label="策略组成员"
            mode="multiple"
            style={{ width: "100%" }}
            value={group.options}
            options={memberOptions}
            onChange={(options) => updateGroup({ options })}
          />
        </div>
        <div>
          <div className="rk-field-label">节点过滤正则</div>
          <Input.TextArea
            aria-label="节点过滤正则"
            value={draft.nodeFiltersText}
            autoSize={{ minRows: 3, maxRows: 10 }}
            onChange={(event) => {
              setDraft((current) => current
                ? { ...current, nodeFiltersText: event.target.value }
                : current);
              setError("");
            }}
          />
        </div>
        {healthCheck ? (
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            <InheritedTextSetting
              label="测速 URL"
              value={group.url}
              resolved={healthCheck.url}
              customFallback={LEGACY_HEALTH_CHECK_URL}
              onChange={(url) => updateGroup({ url })}
            />
            <InheritedNumberSetting
              label="测速间隔（秒）"
              value={group.interval}
              resolved={healthCheck.interval}
              customFallback={LEGACY_HEALTH_CHECK_INTERVAL}
              min={1}
              unit="秒"
              onChange={(interval) => updateGroup({ interval })}
            />
            <InheritedNumberSetting
              label="测速超时（秒）"
              value={group.timeout}
              resolved={healthCheck.timeout}
              customFallback={5}
              min={1}
              unit="秒"
              onChange={(timeout) => updateGroup({ timeout })}
            />
            {group.type === "url-test" ? (
              <InheritedNumberSetting
                label="URLTest 容差（毫秒）"
                value={group.tolerance}
                resolved={healthCheck.tolerance}
                customFallback={LEGACY_URL_TEST_TOLERANCE}
                min={0}
                unit="毫秒"
                onChange={(tolerance) => updateGroup({ tolerance })}
              />
            ) : null}
          </Space>
        ) : null}
        <div>
          <div className="rk-field-label">被 {props.inboundCount} 条路由使用</div>
          <Button
            size="small"
            onClick={() => props.onFilterInRouteList(savedGroupName)}
          >
            在路由列表中筛选
          </Button>
        </div>
        <Popconfirm title={`删除策略组 ${group.name}？`} onConfirm={props.onDelete} okText="删除" cancelText="取消">
          <Button danger>删除策略组</Button>
        </Popconfirm>
      </Space>
    </Drawer>
  );
}
