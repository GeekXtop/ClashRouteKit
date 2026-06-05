import { Clipboard, Link2, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { ProviderSubscription } from "../subscriptions.js";

function IconButton({
  children,
  label,
  onClick,
  title,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button aria-label={label} className="icon-button" title={title} type="button" onClick={onClick}>
      {children}
    </button>
  );
}

export function SubscriptionPanel({
  copied,
  endpoint,
  onAdd,
  onCopy,
  onEndpointChange,
  onImport,
  onRemove,
  onUpdate,
  outputUrl,
  providers,
}: {
  copied: boolean;
  endpoint: string;
  onAdd: () => void;
  onCopy: () => void;
  onEndpointChange: (value: string) => void;
  onImport: (value: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<ProviderSubscription>) => void;
  outputUrl: string;
  providers: ProviderSubscription[];
}) {
  const [importText, setImportText] = useState("");
  const activeProviders = providers.filter((provider) => provider.enabled && provider.url.trim()).length;

  return (
    <section className="panel subscription-editor-panel">
      <div className="panel-heading">
        <div>
          <h2>订阅辅助</h2>
          <span>secondary workflow</span>
        </div>
        <Link2 size={18} />
      </div>
      <div className="subscription-editor">
        <div className="subscription-toolbar">
          <label>
            <span>Endpoint</span>
            <input value={endpoint} onChange={(event) => onEndpointChange(event.target.value)} />
          </label>
          <button className="command-button" type="button" onClick={onAdd}>
            <Plus size={16} />
            添加
          </button>
        </div>

        <div className="subscription-import">
          <textarea
            rows={4}
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder="provider:name,https://example.com/subscribe"
          />
          <button
            className="command-button"
            type="button"
            onClick={() => {
              onImport(importText);
              setImportText("");
            }}
          >
            <Link2 size={16} />
            导入
          </button>
        </div>

        <div className="subscription-list">
          {providers.map((provider) => (
            <div className="subscription-row" key={provider.id}>
              <label className="check-cell">
                <input
                  checked={provider.enabled}
                  type="checkbox"
                  onChange={(event) => onUpdate(provider.id, { enabled: event.target.checked })}
                />
              </label>
              <input
                aria-label="provider name"
                className="name-input"
                value={provider.name}
                onChange={(event) => onUpdate(provider.id, { name: event.target.value })}
              />
              <input
                aria-label="subscription url"
                className="url-input"
                value={provider.url}
                onChange={(event) => onUpdate(provider.id, { url: event.target.value })}
              />
              <IconButton label="remove provider" title="删除" onClick={() => onRemove(provider.id)}>
                <Trash2 size={16} />
              </IconButton>
            </div>
          ))}
          {providers.length === 0 ? <div className="empty-state">暂无订阅</div> : null}
        </div>

        <div className="generated-url">
          <div>
            <strong>SubConverter URL</strong>
            <span>{activeProviders} active</span>
          </div>
          <button className="command-button" disabled={!outputUrl} type="button" onClick={onCopy}>
            <Clipboard size={16} />
            {copied ? "已复制" : "复制"}
          </button>
        </div>
        <textarea className="url-output" readOnly rows={5} value={outputUrl} />
      </div>
    </section>
  );
}
