import type {
  RouteKitProjectConfig,
  RuleProviderConfig,
  RuleProviderSource,
} from "@clash-route-kit/core";
import { RuleProviderEditor } from "./RuleProviderEditor.js";
import { RuleProviderList } from "./RuleProviderList.js";

export function ProviderWorkspace({
  config,
  onCreateProvider,
  onDeleteProvider,
  onSelectProvider,
  onSetProviderListField,
  onSetProviderSources,
  onUpdateProvider,
  selectedProvider,
}: {
  config: RouteKitProjectConfig;
  onCreateProvider: () => void;
  onDeleteProvider: (providerName: string) => void;
  onSelectProvider: (providerName: string) => void;
  onSetProviderListField: (providerName: string, field: "exclude" | "remove", values: string[]) => void;
  onSetProviderSources: (providerName: string, sources: RuleProviderSource[]) => void;
  onUpdateProvider: (providerName: string, patch: Partial<RuleProviderConfig>) => void;
  selectedProvider: RuleProviderConfig | undefined;
}) {
  const providers = config.ruleProviders ?? [];

  return (
    <div className="entity-workspace">
      <RuleProviderList
        providers={providers}
        selectedProviderName={selectedProvider?.name ?? ""}
        onCreateProvider={onCreateProvider}
        onSelectProvider={onSelectProvider}
      />
      <RuleProviderEditor
        provider={selectedProvider}
        onDeleteProvider={onDeleteProvider}
        onSetProviderListField={onSetProviderListField}
        onSetProviderSources={onSetProviderSources}
        onUpdateProvider={onUpdateProvider}
      />
    </div>
  );
}
