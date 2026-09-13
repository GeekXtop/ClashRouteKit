import { useEffect, useState } from "react";
import { Alert, Button, Drawer, Input, Popconfirm, Select, Space } from "antd";
import { Plus, X } from "lucide-react";
import {
  LEGACY_HEALTH_CHECK_INTERVAL,
  LEGACY_HEALTH_CHECK_URL,
  LEGACY_URL_TEST_TOLERANCE,
  resolveProxyGroupHealthCheck,
  type CustomProxyGroup,
  type MemberSet,
  type ProxyGroupV2,
  type RouteKitDefaults,
  type TypedMember,
} from "@clash-route-kit/core";
import {
  createCustomProxyGroupDraft,
  finalizeCustomProxyGroupDraft,
  type CustomProxyGroupDraft,
  type EditableCustomProxyGroup,
} from "../drawerDrafts.js";
import {
  createV2GroupDraft,
  finalizeV2GroupDraft,
  memberFromOptionValue,
  memberOptionValue,
  type EditableProxyGroupV2,
  type V2GroupDraft,
} from "../v2/drawerDrafts.js";
import { InheritedNumberSetting, InheritedTextSetting } from "./InheritedSettingField.js";

const GROUP_TYPES: CustomProxyGroup["type"][] = ["select", "url-test", "fallback", "load-balance"];

/** 「成员来源」Select 里代表内联成员的哨兵值。 */
const INLINE_MEMBERS = "__inline__";

const V2_SET_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * TypedMember 行编辑器：v2 组内联成员与 memberSet 集合成员共用。
 * 行下拉：其他策略组（写 group id）、内置 DIRECT/REJECT、成员集合（写 preset id）。
 */
function TypedMemberRows(props: {
  members: TypedMember[];
  groupOptions: { id: string; name: string }[];
  memberSetIds: string[];
  /** 组编辑场景排除自身，避免自引用。 */
  selfGroupId?: string;
  onChange: (members: TypedMember[]) => void;
  addButtonLabel: string;
}) {
  const options = [
    ...props.groupOptions
      .filter((group) => group.id !== props.selfGroupId)
      .map((group) => ({ value: `group:${group.id}`, label: group.name })),
    { value: "builtin:DIRECT", label: "DIRECT" },
    { value: "builtin:REJECT", label: "REJECT" },
    ...props.memberSetIds.map((id) => ({ value: `preset:${id}`, label: `集合 · ${id}` })),
  ];
  return (
    <div>
      {props.members.map((member, index) => (
        <Space key={index} style={{ display: "flex", marginBottom: 4 }}>
          <Select
            aria-label={`成员 ${index + 1}`}
            style={{ width: 220 }}
            value={memberOptionValue(member)}
            options={options}
            onChange={(value) => {
              const next = memberFromOptionValue(value);
              if (!next) return;
              props.onChange(props.members.map((m, i) => (i === index ? next : m)));
            }}
          />
          <button
            type="button"
            aria-label={`删除成员 ${index + 1}`}
            className="rk-iconbtn rk-del"
            onClick={() => props.onChange(props.members.filter((_m, i) => i !== index))}
          >
            <X size={13} />
          </button>
        </Space>
      ))}
      <Button
        size="small"
        icon={<Plus size={13} />}
        aria-label={props.addButtonLabel}
        onClick={() => props.onChange([...props.members, { builtin: "DIRECT" }])}
      >
        添加成员
      </Button>
    </div>
  );
}

function cloneMembers(members: readonly TypedMember[]): TypedMember[] {
  return members.map((member) => ({ ...member }));
}

export function GroupDrawer(props: {
  open: boolean;
  group?: CustomProxyGroup | undefined;
  groups: CustomProxyGroup[];
  defaults?: RouteKitDefaults;
  inboundCount: number;
  onSave: (nextGroup: CustomProxyGroup) => void;
  onCancel: () => void;
  onDelete: () => void;
  onFilterInRouteList: (groupName: string) => void;
  /** 存在时走 Schema v2 稳定 ID 通路（成员编辑为 memberSet 引用 + 内联模式）。 */
  v2?: {
    group: ProxyGroupV2;
    memberSets: Record<string, MemberSet>;
    groupOptions: { id: string; name: string }[];
    onSave: (nextGroup: ProxyGroupV2) => void;
    onUpsertMemberSet: (setId: string, members: TypedMember[]) => void;
    onRemoveMemberSet: (setId: string) => void;
  };
}) {
  const [v1Draft, setV1Draft] = useState<CustomProxyGroupDraft | null>(() =>
    props.group ? createCustomProxyGroupDraft(props.group) : null,
  );
  const [v2Draft, setV2Draft] = useState<V2GroupDraft | null>(() =>
    props.v2 ? createV2GroupDraft(props.v2.group) : null,
  );
  const [setEditor, setSetEditor] = useState<{ setId: string; members: TypedMember[] } | null>(null);
  const [newSetId, setNewSetId] = useState("");
  const [setActionError, setSetActionError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (props.open && props.v2?.group) {
      setV2Draft(createV2GroupDraft(props.v2.group));
      setV1Draft(null);
      setSetEditor(null);
      setNewSetId("");
      setSetActionError("");
      setError("");
    }
  }, [props.open, props.v2?.group?.id]);

  useEffect(() => {
    if (props.open && props.group && !props.v2) {
      setV1Draft(createCustomProxyGroupDraft(props.group));
      setV2Draft(null);
      setError("");
    }
  }, [props.open, props.group?.name, props.v2]);

  function updateGroup(patch: Partial<EditableCustomProxyGroup>) {
    setV1Draft((current) =>
      current ? { ...current, group: { ...current.group, ...patch } } : current,
    );
    setError("");
  }

  function updateV2Group(patch: Partial<EditableProxyGroupV2>) {
    setV2Draft((current) =>
      current ? { ...current, group: { ...current.group, ...patch } } : current,
    );
    setError("");
  }

  function handleSave() {
    if (props.v2) {
      if (!v2Draft) return;
      const result = finalizeV2GroupDraft(v2Draft, props.v2.groupOptions, props.v2.group.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      props.v2.onSave(result.value);
      return;
    }
    if (!v1Draft || !props.group) return;
    const result = finalizeCustomProxyGroupDraft(v1Draft, props.groups, props.group.name);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    props.onSave(result.value);
  }

  const emptyDrawer = (
    <Drawer open={props.open} onClose={props.onCancel} width={420} title="策略组" />
  );

  // ---------------------------------------------------------------------------
  // Schema v2 分支：稳定 ID + memberSet 引用 / 内联成员
  // ---------------------------------------------------------------------------
  if (props.v2) {
    if (!props.v2.group || !v2Draft) return emptyDrawer;
    const v2 = props.v2;
    const v2Group = v2Draft.group;
    const memberSetIds = Object.keys(v2.memberSets);
    const savedGroupName = v2.group.name;
    const v2HealthGroup: CustomProxyGroup = {
      name: v2Group.name,
      type: v2Group.type,
      options: [],
      ...(v2Group.url !== undefined ? { url: v2Group.url } : {}),
      interval: (v2Group.interval ?? undefined) as number | undefined,
      ...(v2Group.timeout !== undefined ? { timeout: v2Group.timeout } : {}),
      ...(v2Group.tolerance !== undefined ? { tolerance: v2Group.tolerance } : {}),
    };
    const healthCheck =
      v2Group.type === "select" ? undefined : resolveProxyGroupHealthCheck(v2HealthGroup, props.defaults);

    return (
      <Drawer
        open={props.open}
        onClose={props.onCancel}
        width={420}
        title={`策略组 · ${savedGroupName}`}
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
              value={v2Group.name}
              onChange={(event) => updateV2Group({ name: event.target.value })}
            />
          </div>
          <div>
            <div className="rk-field-label">类型</div>
            <Select
              aria-label="策略组类型"
              style={{ width: "100%" }}
              value={v2Group.type}
              options={GROUP_TYPES.map((t) => ({ value: t, label: t }))}
              onChange={(type) => updateV2Group({ type })}
            />
          </div>
          <div>
            <div className="rk-field-label">成员来源</div>
            <Select
              aria-label="成员来源"
              style={{ width: "100%" }}
              value={v2Draft.presetId ?? INLINE_MEMBERS}
              options={[
                { value: INLINE_MEMBERS, label: "内联成员" },
                ...memberSetIds.map((id) => ({ value: id, label: `集合 · ${id}` })),
              ]}
              onChange={(value) => {
                setError("");
                if (value === INLINE_MEMBERS) {
                  setV2Draft((current) => {
                    if (!current) return current;
                    const expanded =
                      current.presetId !== null && current.group.members.length === 1
                        ? cloneMembers(v2.memberSets[current.presetId]?.members ?? [])
                        : current.group.members;
                    return {
                      ...current,
                      presetId: null,
                      group: { ...current.group, members: expanded },
                    };
                  });
                  return;
                }
                setV2Draft((current) =>
                  current
                    ? {
                        ...current,
                        presetId: value,
                        group: { ...current.group, members: [{ preset: value }] },
                      }
                    : current,
                );
              }}
            />
          </div>
          {v2Draft.presetId === null ? (
            <div>
              <div className="rk-field-label">成员（内联，可排序）</div>
              <TypedMemberRows
                members={v2Group.members}
                groupOptions={v2.groupOptions}
                memberSetIds={memberSetIds}
                selfGroupId={v2.group.id}
                addButtonLabel="添加成员"
                onChange={(members) => updateV2Group({ members })}
              />
            </div>
          ) : null}
          <div>
            <div className="rk-field-label">成员集合管理</div>
            {memberSetIds.length === 0 ? (
              <div className="rk-setting-hint">尚无成员集合，可在下方新建</div>
            ) : null}
            {memberSetIds.map((id) => (
              <Space
                key={id}
                style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}
              >
                <span>{`${id}（${v2.memberSets[id]?.members.length ?? 0} 个成员）`}</span>
                <Space size={0}>
                  <button
                    type="button"
                    aria-label={`编辑集合 ${id}`}
                    className="rk-iconbtn"
                    onClick={() =>
                      setSetEditor((current) =>
                        current?.setId === id
                          ? null
                          : { setId: id, members: cloneMembers(v2.memberSets[id]?.members ?? []) },
                      )
                    }
                  >
                    编辑
                  </button>
                  <Popconfirm
                    title={`删除成员集合 ${id}？`}
                    okText="删除"
                    cancelText="取消"
                    onConfirm={() => v2.onRemoveMemberSet(id)}
                  >
                    <button type="button" aria-label={`删除集合 ${id}`} className="rk-iconbtn rk-del">
                      <X size={13} />
                    </button>
                  </Popconfirm>
                </Space>
              </Space>
            ))}
            {setEditor ? (
              <div style={{ marginTop: 8 }}>
                <div className="rk-field-label">集合成员 · {setEditor.setId}</div>
                <TypedMemberRows
                  members={setEditor.members}
                  groupOptions={v2.groupOptions}
                  memberSetIds={memberSetIds.filter((id) => id !== setEditor.setId)}
                  addButtonLabel="添加集合成员"
                  onChange={(members) => setSetEditor({ ...setEditor, members })}
                />
                <Space style={{ marginTop: 8 }}>
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => {
                      v2.onUpsertMemberSet(setEditor.setId, setEditor.members);
                      setSetEditor(null);
                    }}
                  >
                    保存集合
                  </Button>
                  <Button size="small" onClick={() => setSetEditor(null)}>取消编辑</Button>
                </Space>
              </div>
            ) : null}
            <Space.Compact style={{ width: "100%", marginTop: 8 }}>
              <Input
                aria-label="新集合 ID"
                placeholder="如 set-streaming"
                value={newSetId}
                onChange={(event) => {
                  setNewSetId(event.target.value);
                  setSetActionError("");
                }}
              />
              <Button
                onClick={() => {
                  const id = newSetId.trim();
                  if (!V2_SET_ID_PATTERN.test(id)) {
                    setSetActionError("集合 ID 需为小写字母/数字开头，仅含小写字母、数字、-、_");
                    return;
                  }
                  if (memberSetIds.includes(id)) {
                    setSetActionError(`成员集合 "${id}" 已存在`);
                    return;
                  }
                  v2.onUpsertMemberSet(id, [{ builtin: "DIRECT" }]);
                  setNewSetId("");
                }}
              >
                新建集合
              </Button>
            </Space.Compact>
            {setActionError ? <div className="rk-setting-hint">{setActionError}</div> : null}
          </div>
          <div>
            <div className="rk-field-label">节点过滤正则</div>
            <Input.TextArea
              aria-label="节点过滤正则"
              value={v2Draft.nodeFiltersText}
              autoSize={{ minRows: 3, maxRows: 10 }}
              onChange={(event) => {
                setV2Draft((current) =>
                  current ? { ...current, nodeFiltersText: event.target.value } : current,
                );
                setError("");
              }}
            />
          </div>
          {healthCheck ? (
            <Space direction="vertical" style={{ width: "100%" }} size="middle">
              <InheritedTextSetting
                label="测速 URL"
                value={v2Group.url}
                resolved={healthCheck.url}
                customFallback={LEGACY_HEALTH_CHECK_URL}
                onChange={(url) => updateV2Group({ url })}
              />
              <InheritedNumberSetting
                label="测速间隔（秒）"
                value={v2Group.interval}
                resolved={healthCheck.interval}
                customFallback={LEGACY_HEALTH_CHECK_INTERVAL}
                min={1}
                unit="秒"
                onChange={(interval) => updateV2Group({ interval })}
              />
              <InheritedNumberSetting
                label="测速超时（秒）"
                value={v2Group.timeout}
                resolved={healthCheck.timeout}
                customFallback={5}
                min={1}
                unit="秒"
                onChange={(timeout) => updateV2Group({ timeout })}
              />
              {v2Group.type === "url-test" ? (
                <InheritedNumberSetting
                  label="URLTest 容差（毫秒）"
                  value={v2Group.tolerance}
                  resolved={healthCheck.tolerance}
                  customFallback={LEGACY_URL_TEST_TOLERANCE}
                  min={0}
                  unit="毫秒"
                  onChange={(tolerance) => updateV2Group({ tolerance })}
                />
              ) : null}
            </Space>
          ) : null}
          <div>
            <div className="rk-field-label">被 {props.inboundCount} 条路由使用</div>
            <Button size="small" onClick={() => props.onFilterInRouteList(savedGroupName)}>
              在路由列表中筛选
            </Button>
          </div>
          <Popconfirm
            title={`删除策略组 ${v2Group.name}？`}
            onConfirm={props.onDelete}
            okText="删除"
            cancelText="取消"
          >
            <Button danger>删除策略组</Button>
          </Popconfirm>
        </Space>
      </Drawer>
    );
  }

  const group = v1Draft?.group;
  if (!props.group || !v1Draft || !group) {
    return emptyDrawer;
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
            value={v1Draft.nodeFiltersText}
            autoSize={{ minRows: 3, maxRows: 10 }}
            onChange={(event) => {
              setV1Draft((current) => current
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
