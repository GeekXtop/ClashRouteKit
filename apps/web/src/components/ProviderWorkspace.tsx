import { Layers3 } from "lucide-react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";

export function ProviderWorkspace({ config }: { config: RouteKitProjectConfig }) {
  const providers = config.ruleProviders ?? [];

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Provider 输出</h2>
          <span>{providers.length} files</span>
        </div>
        <Layers3 size={18} />
      </div>
      <div className="provider-list wide-list">
        {providers.map((provider) => (
          <div className="provider-row" key={provider.output}>
            <strong>{provider.name}</strong>
            <span>{provider.output}</span>
          </div>
        ))}
        {providers.length === 0 ? <div className="empty-state">暂无 rule provider</div> : null}
      </div>
    </section>
  );
}
