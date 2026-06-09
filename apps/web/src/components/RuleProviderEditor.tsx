import { useState } from "react";
import type { RuleProviderConfig, RuleProviderSource } from "@clash-route-kit/core";
import { SourcePicker } from "./SourcePicker.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ProviderReference {
  ruleSetId: string;
  policy: string;
}

function listText(values: string[] | undefined): string {
  return (values ?? []).join("\n");
}

function parseListText(value: string): string[] {
  return value.split("\n");
}

function sourceBadge(type: RuleProviderSource["type"]): { label: string; cls: string } {
  if (type === "domain-list-community") return { label: "GEO", cls: "b-geo" };
  if (type === "clash-provider") return { label: "PROV", cls: "b-dler" };
  return { label: "LST", cls: "b-list" };
}

function sourceLabel(source: RuleProviderSource): string {
  if (source.type === "domain-list-community") return `${source.name}：${source.entry || "(空)"}`;
  return `${source.name}：${source.path || "(空)"}`;
}

export function RuleProviderEditor({
  provider,
  references,
  fetcher = globalThis.fetch,
  onDeleteProvider,
  onSetProviderListField,
  onSetProviderSources,
  onUpdateProvider,
}: {
  provider: RuleProviderConfig | undefined;
  references: ProviderReference[];
  fetcher?: Fetcher;
  onDeleteProvider: (providerName: string) => void;
  onSetProviderListField: (providerName: string, field: "exclude" | "remove", values: string[]) => void;
  onSetProviderSources: (providerName: string, sources: RuleProviderSource[]) => void;
  onUpdateProvider: (providerName: string, patch: Partial<RuleProviderConfig>) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!provider) {
    return (
      <section className="panel editor-panel">
        <div className="empty-state">暂无 rule provider</div>
      </section>
    );
  }

  return (
    <section className="panel editor-panel">
      <div className="panel-heading">
        <div>
          <h2>编辑 Rule Provider</h2>
          <span>{provider.output}</span>
        </div>
        <button
          className="del-x"
          type="button"
          aria-label={`删除 ${provider.name}`}
          onClick={() => {
            if (window.confirm(`删除 rule provider ${provider.name}？`)) onDeleteProvider(provider.name);
          }}
        >
          ✕
        </button>
      </div>
      <div className="form-grid">
        <label>
          <span>名称</span>
          <input value={provider.name} onChange={(event) => onUpdateProvider(provider.name, { name: event.target.value })} />
        </label>
        <label>
          <span>输出文件</span>
          <input
            value={provider.output}
            onChange={(event) => onUpdateProvider(provider.name, { output: event.target.value })}
          />
        </label>
      </div>

      <div className="provider-references">
        <div className="entity-list-header">
          <h3>被引用</h3>
          <span>{references.length} 处</span>
        </div>
        {references.length === 0 ? (
          <div className="empty-state">未被任何 RuleSet 引用（孤儿）</div>
        ) : (
          <div className="policy-list">
            {references.map((reference) => (
              <div className="policy-row" key={reference.ruleSetId}>
                <strong>{reference.ruleSetId}</strong>
                <small>→ {reference.policy}</small>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="source-list">
        <div className="entity-list-header">
          <h3>来源（按序合并 → 去重）</h3>
          <button className="command-button" type="button" onClick={() => setPickerOpen(true)}>
            ＋ 从目录挑
          </button>
        </div>
        {provider.sources.map((source, index) => (
          <div className="source-row" key={`${source.name}-${index}`}>
            <span className="grip" aria-hidden="true">⠿</span>
            <span className={`bdg ${sourceBadge(source.type).cls}`}>{sourceBadge(source.type).label}</span>
            <span className="src-label">{sourceLabel(source)}</span>
            <button
              className="del-x"
              type="button"
              aria-label="remove source"
              onClick={() =>
                onSetProviderSources(provider.name, provider.sources.filter((_, itemIndex) => itemIndex !== index))
              }
            >
              ✕
            </button>
          </div>
        ))}
        {provider.sources.length === 0 ? (
          <div className="empty-state">还没有来源 · 点「从目录挑」添加</div>
        ) : null}
      </div>

      <details className="advanced-block">
        <summary>高级：exclude / remove</summary>
        <div className="form-grid">
          <label className="wide-field">
            <span>Exclude</span>
            <textarea
              value={listText(provider.exclude)}
              onChange={(event) => onSetProviderListField(provider.name, "exclude", parseListText(event.target.value))}
            />
          </label>
          <label className="wide-field">
            <span>Remove</span>
            <textarea
              value={listText(provider.remove)}
              onChange={(event) => onSetProviderListField(provider.name, "remove", parseListText(event.target.value))}
            />
          </label>
        </div>
      </details>

      {pickerOpen ? (
        <SourcePicker
          fetcher={fetcher}
          onAdd={(newSource) => {
            onSetProviderSources(provider.name, [...provider.sources, newSource]);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </section>
  );
}
