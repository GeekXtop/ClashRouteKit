import { useState } from "react";
import type {
  RouteKitProjectConfig,
  RuleProviderConfig,
  RuleProviderSource,
} from "@clash-route-kit/core";
import { RuleProviderEditor } from "./RuleProviderEditor.js";
import { RuleProviderList } from "./RuleProviderList.js";

export interface ProviderReference {
  ruleSetId: string;
  policy: string;
}

export function collectProviderReferences(
  config: RouteKitProjectConfig,
  output: string,
): ProviderReference[] {
  if (!output) return [];
  return config.ruleSets
    .filter((ruleSet) => ruleSet.source.type === "rule-provider" && ruleSet.source.file === output)
    .map((ruleSet) => ({ ruleSetId: ruleSet.id, policy: ruleSet.policy }));
}

function listText(values: string[] | undefined): string {
  return (values ?? []).join("\n");
}

function parseListText(value: string): string[] {
  return value.split("\n");
}

function GlobalRemoveEditor({
  values,
  onChange,
}: {
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <section className="panel editor-panel">
      <div className="panel-heading">
        <div>
          <h2>全局移除清单</h2>
          <span>对所有 provider 合并产物生效的 remove 规则</span>
        </div>
      </div>
      <div className="form-grid">
        <label className="wide-field">
          <span>每行一条（DOMAIN-SUFFIX / DOMAIN / keyword…）</span>
          <textarea
            value={listText(values)}
            onChange={(event) => onChange(parseListText(event.target.value))}
          />
        </label>
      </div>
    </section>
  );
}

export function ProviderWorkspace({
  config,
  onCreateProvider,
  onDeleteProvider,
  onSelectProvider,
  onSetGlobalRemove,
  onSetProviderListField,
  onSetProviderSources,
  onUpdateProvider,
  selectedProvider,
}: {
  config: RouteKitProjectConfig;
  onCreateProvider: () => void;
  onDeleteProvider: (providerName: string) => void;
  onSelectProvider: (providerName: string) => void;
  onSetGlobalRemove: (values: string[]) => void;
  onSetProviderListField: (providerName: string, field: "exclude" | "remove", values: string[]) => void;
  onSetProviderSources: (providerName: string, sources: RuleProviderSource[]) => void;
  onUpdateProvider: (providerName: string, patch: Partial<RuleProviderConfig>) => void;
  selectedProvider: RuleProviderConfig | undefined;
}) {
  const providers = config.ruleProviders ?? [];
  const [globalRemoveActive, setGlobalRemoveActive] = useState(false);

  return (
    <div className="entity-workspace">
      <RuleProviderList
        providers={providers}
        selectedProviderName={selectedProvider?.name ?? ""}
        globalRemoveCount={config.globalRemove?.length ?? 0}
        globalRemoveActive={globalRemoveActive}
        onCreateProvider={() => {
          setGlobalRemoveActive(false);
          onCreateProvider();
        }}
        onSelectProvider={(providerName) => {
          setGlobalRemoveActive(false);
          onSelectProvider(providerName);
        }}
        onSelectGlobalRemove={() => setGlobalRemoveActive(true)}
      />
      {globalRemoveActive ? (
        <GlobalRemoveEditor values={config.globalRemove ?? []} onChange={onSetGlobalRemove} />
      ) : (
        <RuleProviderEditor
          provider={selectedProvider}
          references={collectProviderReferences(config, selectedProvider?.output ?? "")}
          onDeleteProvider={onDeleteProvider}
          onSetProviderListField={onSetProviderListField}
          onSetProviderSources={onSetProviderSources}
          onUpdateProvider={onUpdateProvider}
        />
      )}
    </div>
  );
}
