import { useEffect, useState } from "react";
import type { CustomProxyGroup } from "@clash-route-kit/core";

const groupTypes: CustomProxyGroup["type"][] = ["select", "url-test", "fallback", "load-balance"];

function listText(values: string[] | undefined): string {
  return (values ?? []).join("\n");
}

function parseListText(value: string): string[] {
  return value.split("\n");
}

function previewCustomProxyGroup(group: CustomProxyGroup): string {
  const optionRefs = group.options.map((option) => `[]${option}`);
  const options = [...optionRefs, ...(group.nodeFilters ?? [])].join("`");
  if (group.type === "select") {
    return `custom_proxy_group=${group.name}\`select\`${options}`;
  }

  const url = group.url ?? "https://cp.cloudflare.com/generate_204";
  const interval = group.interval ?? 300;
  const tolerance = group.tolerance ?? 50;
  return `custom_proxy_group=${group.name}\`${group.type}\`${options}\`${url}\`${interval},,${tolerance}`;
}

export function CustomProxyGroupEditor({
  group,
  onDeleteGroup,
  onRenameGroup,
  onSetGroupListField,
  onUpdateGroup,
}: {
  group: CustomProxyGroup | undefined;
  onDeleteGroup: (groupName: string) => void;
  onRenameGroup: (groupName: string, nextGroupName: string) => void;
  onSetGroupListField: (groupName: string, field: "options" | "nodeFilters", values: string[]) => void;
  onUpdateGroup: (groupName: string, patch: Partial<CustomProxyGroup>) => void;
}) {
  const [nameDraft, setNameDraft] = useState(group?.name ?? "");

  useEffect(() => {
    setNameDraft(group?.name ?? "");
  }, [group?.name]);

  if (!group) {
    return (
      <section className="panel editor-panel">
        <div className="empty-state">暂无 custom_proxy_group</div>
      </section>
    );
  }

  function commitNameDraft() {
    if (!group || nameDraft === group.name) return;
    onRenameGroup(group.name, nameDraft);
  }

  return (
    <section className="panel editor-panel">
      <div className="panel-heading">
        <div>
          <h2>编辑 Custom Proxy Group</h2>
          <span>{group.name}</span>
        </div>
      </div>
      <div className="form-grid">
        <label>
          <span>名称</span>
          <input
            value={nameDraft}
            onBlur={commitNameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
        </label>
        <label>
          <span>类型</span>
          <select
            value={group.type}
            onChange={(event) => onUpdateGroup(group.name, { type: event.target.value as CustomProxyGroup["type"] })}
          >
            {groupTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <label>
          <span>测速 URL</span>
          <input
            value={group.url ?? ""}
            onChange={(event) => onUpdateGroup(group.name, { url: event.target.value || undefined })}
          />
        </label>
        <label>
          <span>间隔</span>
          <input
            inputMode="numeric"
            value={group.interval ?? ""}
            onChange={(event) =>
              onUpdateGroup(group.name, { interval: event.target.value ? Number(event.target.value) : undefined })
            }
          />
        </label>
        <label>
          <span>容差</span>
          <input
            inputMode="numeric"
            value={group.tolerance ?? ""}
            onChange={(event) =>
              onUpdateGroup(group.name, { tolerance: event.target.value ? Number(event.target.value) : undefined })
            }
          />
        </label>
        <label className="wide-field">
          <span>Options</span>
          <textarea
            value={listText(group.options)}
            onChange={(event) => onSetGroupListField(group.name, "options", parseListText(event.target.value))}
          />
        </label>
        <label className="wide-field">
          <span>Node Filters</span>
          <textarea
            value={listText(group.nodeFilters)}
            onChange={(event) => onSetGroupListField(group.name, "nodeFilters", parseListText(event.target.value))}
          />
        </label>
        <label className="wide-field">
          <span>custom_proxy_group= 预览</span>
          <code className="output-line">{previewCustomProxyGroup(group)}</code>
        </label>
      </div>
      <button
        className="danger-button"
        type="button"
        onClick={() => {
          if (window.confirm(`删除 custom_proxy_group ${group.name}？`)) onDeleteGroup(group.name);
        }}
      >
        删除 custom_proxy_group
      </button>
    </section>
  );
}
