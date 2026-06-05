import { CircleDot, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProviderReference, RouteModule } from "@clash-route-kit/core";

function parseTagText(value: string): string[] {
  return value.replace(/\r\n?/g, "\n").split("\n");
}

function tagText(tags: string[] | undefined): string {
  return (tags ?? []).join("\n");
}

function updateProvider(
  providers: ProviderReference[],
  index: number,
  patch: Partial<ProviderReference>,
): ProviderReference[] {
  return providers.map((provider, providerIndex) =>
    providerIndex === index ? { ...provider, ...patch } : provider,
  );
}

export function ModuleEditor({
  module,
  onDeleteModule,
  onSetModuleProviderRefs,
  onSetModuleTags,
  onToggleModule,
  onUpdateModule,
  policies,
}: {
  module: RouteModule | undefined;
  onDeleteModule: (moduleId: string) => void;
  onSetModuleProviderRefs: (moduleId: string, providers: ProviderReference[]) => void;
  onSetModuleTags: (moduleId: string, field: "geosite" | "geoip", tags: string[]) => void;
  onToggleModule: (moduleId: string) => void;
  onUpdateModule: (moduleId: string, patch: Partial<RouteModule>) => void;
  policies: string[];
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setConfirmDelete(false);
  }, [module?.id]);

  if (!module) {
    return (
      <section className="panel detail-panel module-editor">
        <div className="empty-state">选择一个模块开始编辑</div>
      </section>
    );
  }

  const enabled = module.enabled !== false;
  const providers = module.providers ?? [];
  const policyOptions = module.policy && !policies.includes(module.policy) ? [module.policy, ...policies] : policies;

  return (
    <section className="panel detail-panel module-editor">
      <div className="panel-heading">
        <div>
          <h2>模块编辑</h2>
          <span>{module.policy || "未设置策略"}</span>
        </div>
        <CircleDot size={18} />
      </div>
      <div className="detail-body editor-form">
        <div className="read-only-grid">
          <label>
            <span>Module ID</span>
            <input value={module.id} onChange={(event) => onUpdateModule(module.id, { id: event.target.value })} />
          </label>
          <label>
            <span>Policy</span>
            <select value={module.policy} onChange={(event) => onUpdateModule(module.id, { policy: event.target.value })}>
              {policyOptions.map((policy) => (
                <option key={policy}>{policy}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="check-line">
          <input checked={enabled} type="checkbox" onChange={() => onToggleModule(module.id)} />
          <span>启用模块</span>
        </label>

        <div className="textarea-grid">
          <label>
            <span>GEOSITE</span>
            <textarea
              rows={8}
              value={tagText(module.geosite)}
              onChange={(event) => onSetModuleTags(module.id, "geosite", parseTagText(event.target.value))}
            />
          </label>
          <label>
            <span>GEOIP</span>
            <textarea
              rows={8}
              value={tagText(module.geoip)}
              onChange={(event) => onSetModuleTags(module.id, "geoip", parseTagText(event.target.value))}
            />
          </label>
        </div>

        <div className="provider-editor">
          <div className="detail-title">
            <strong>Provider References</strong>
            <button
              className="command-button"
              type="button"
              onClick={() => onSetModuleProviderRefs(module.id, [...providers, { behavior: "domain", file: "" }])}
            >
              <Plus size={16} />
              添加
            </button>
          </div>
          {providers.map((provider, index) => (
            <div className="provider-edit-row" key={`${provider.file}-${index}`}>
              <select
                value={provider.behavior}
                onChange={(event) =>
                  onSetModuleProviderRefs(module.id, updateProvider(providers, index, {
                    behavior: event.target.value as ProviderReference["behavior"],
                  }))
                }
              >
                <option value="domain">domain</option>
                <option value="classical">classical</option>
                <option value="ipcidr">ipcidr</option>
              </select>
              <input
                aria-label="provider file"
                placeholder="rules/example.yaml"
                value={provider.file}
                onChange={(event) =>
                  onSetModuleProviderRefs(module.id, updateProvider(providers, index, { file: event.target.value }))
                }
              />
              <input
                aria-label="provider interval"
                inputMode="numeric"
                placeholder="interval"
                value={provider.interval ?? ""}
                onChange={(event) => {
                  const value = event.target.value.trim();
                  onSetModuleProviderRefs(module.id, updateProvider(providers, index, {
                    interval: value ? Number(value) : undefined,
                  }));
                }}
              />
              <button
                aria-label="remove provider reference"
                className="icon-button"
                type="button"
                onClick={() => onSetModuleProviderRefs(module.id, providers.filter((_, providerIndex) => providerIndex !== index))}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {providers.length === 0 ? <div className="empty-state">暂无 provider 引用</div> : null}
        </div>

        <div className="danger-zone">
          <button className="command-button danger" type="button" onClick={() => (confirmDelete ? onDeleteModule(module.id) : setConfirmDelete(true))}>
            <Trash2 size={16} />
            {confirmDelete ? "确认删除模块" : "删除模块"}
          </button>
          {confirmDelete ? <span>再次点击会从草稿中删除该模块，保存前不会写入文件。</span> : null}
        </div>
      </div>
    </section>
  );
}
