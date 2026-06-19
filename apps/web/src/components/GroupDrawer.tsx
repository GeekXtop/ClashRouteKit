import { useEffect, useState } from "react";
import { Button, Drawer, Input, InputNumber, Popconfirm, Select, Space } from "antd";
import type { CustomProxyGroup } from "@clash-route-kit/core";
import type { InboundRuleSetRow } from "../routeSummary.js";

const GROUP_TYPES: CustomProxyGroup["type"][] = ["select", "url-test", "fallback", "load-balance"];

export function GroupDrawer(props: {
  open: boolean;
  group: CustomProxyGroup | undefined;
  groups: CustomProxyGroup[];
  inbound: InboundRuleSetRow[];
  onClose: () => void;
  onUpdate: (patch: Partial<CustomProxyGroup>) => void;
  onRename: (next: string) => void;
  onSetListField: (field: "options" | "nodeFilters", values: string[]) => void;
  onDelete: () => void;
  onJumpToRule: (id: string) => void;
}) {
  const { group } = props;
  const [name, setName] = useState(group?.name ?? "");
  useEffect(() => {
    setName(group?.name ?? "");
  }, [group?.name]);
  if (!group) return <Drawer open={props.open} onClose={props.onClose} width={420} title="策略组" />;

  const memberOptions = [
    ...props.groups.filter((g) => g.name !== group.name).map((g) => g.name),
    "DIRECT",
    "REJECT",
  ].map((value) => ({ value, label: value }));

  return (
    <Drawer open={props.open} onClose={props.onClose} width={420} title={`策略组 · ${group.name}`}>
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <div>
          <div className="rk-field-label">名称</div>
          <Input
            data-rk-name="1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name.trim() !== group.name && props.onRename(name.trim())}
          />
        </div>
        <div>
          <div className="rk-field-label">类型</div>
          <Select
            style={{ width: "100%" }}
            value={group.type}
            options={GROUP_TYPES.map((t) => ({ value: t, label: t }))}
            onChange={(type) => props.onUpdate({ type })}
          />
        </div>
        <div>
          <div className="rk-field-label">成员（可多选 / 排序）</div>
          <Select
            mode="multiple"
            style={{ width: "100%" }}
            value={group.options}
            options={memberOptions}
            onChange={(values) => props.onSetListField("options", values)}
          />
        </div>
        <div>
          <div className="rk-field-label">节点过滤正则</div>
          <Select
            mode="tags"
            style={{ width: "100%" }}
            value={group.nodeFilters ?? []}
            onChange={(values) => props.onSetListField("nodeFilters", values)}
          />
        </div>
        {group.type === "url-test" ? (
          <Space wrap>
            <Input
              addonBefore="测速 URL"
              value={group.url ?? ""}
              onChange={(e) => props.onUpdate({ url: e.target.value })}
              style={{ width: 320 }}
            />
            <InputNumber
              addonBefore="间隔"
              value={group.interval}
              onChange={(value) => props.onUpdate({ interval: value ?? undefined })}
            />
            <InputNumber
              addonBefore="容差"
              value={group.tolerance}
              onChange={(value) => props.onUpdate({ tolerance: value ?? undefined })}
            />
          </Space>
        ) : null}
        <div>
          <div className="rk-field-label">命中此组的规则（{props.inbound.length}）</div>
          {props.inbound.map((row) => (
            <div key={row.id} className="rk-lib-row" onClick={() => props.onJumpToRule(row.id)}>
              <span className="rk-lib-name">{row.id}</span>
              <span className="rk-lib-meta">{row.source}</span>
            </div>
          ))}
        </div>
        <Popconfirm title={`删除策略组 ${group.name}？`} onConfirm={props.onDelete} okText="删除" cancelText="取消">
          <Button danger>删除策略组</Button>
        </Popconfirm>
      </Space>
    </Drawer>
  );
}
