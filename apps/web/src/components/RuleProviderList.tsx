import { Plus } from "lucide-react";
import type { RuleProviderConfig } from "@clash-route-kit/core";

export function RuleProviderList({
  providers,
  selectedProviderName,
  onCreateProvider,
  onSelectProvider,
}: {
  providers: RuleProviderConfig[];
  selectedProviderName: string;
  onCreateProvider: () => void;
  onSelectProvider: (providerName: string) => void;
}) {
  return (
    <aside className="entity-list">
      <div className="entity-list-header">
        <div>
          <h2>Rule Providers</h2>
          <span>{providers.length} files</span>
        </div>
        <button className="icon-button" type="button" aria-label="create provider" onClick={onCreateProvider}>
          <Plus size={16} />
        </button>
      </div>
      <div className="entity-items">
        {providers.map((provider) => (
          <button
            className={`entity-row ${provider.name === selectedProviderName ? "active" : ""}`}
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
