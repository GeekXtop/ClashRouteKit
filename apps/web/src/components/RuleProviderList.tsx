import { Plus, Trash2 } from "lucide-react";
import type { RuleProviderConfig } from "@clash-route-kit/core";

export function RuleProviderList({
  providers,
  selectedProviderName,
  globalRemoveCount,
  globalRemoveActive,
  onCreateProvider,
  onSelectProvider,
  onSelectGlobalRemove,
}: {
  providers: RuleProviderConfig[];
  selectedProviderName: string;
  globalRemoveCount: number;
  globalRemoveActive: boolean;
  onCreateProvider: () => void;
  onSelectProvider: (providerName: string) => void;
  onSelectGlobalRemove: () => void;
}) {
  return (
    <aside className="entity-list">
      <div className="entity-list-header">
        <div>
          <h2>规则源</h2>
          <span>{providers.length} providers</span>
        </div>
        <button className="icon-button" type="button" aria-label="create provider" onClick={onCreateProvider}>
          <Plus size={16} />
        </button>
      </div>
      <div className="entity-items">
        <button
          className={`entity-row ${globalRemoveActive ? "active" : ""}`}
          type="button"
          onClick={onSelectGlobalRemove}
        >
          <strong>
            <Trash2 size={14} /> 全局移除清单
          </strong>
          <span>{globalRemoveCount} 条规则对所有 provider 生效</span>
        </button>
        {providers.map((provider) => (
          <button
            className={`entity-row ${!globalRemoveActive && provider.name === selectedProviderName ? "active" : ""}`}
            key={provider.name}
            type="button"
            onClick={() => onSelectProvider(provider.name)}
          >
            <strong>{provider.name}</strong>
            <span>
              {provider.output} / {provider.sources.length} sources
            </span>
          </button>
        ))}
        {providers.length === 0 ? <div className="empty-state">暂无 rule provider</div> : null}
      </div>
    </aside>
  );
}
