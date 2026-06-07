import type { RuleProviderConfig, RuleProviderSource } from "@clash-route-kit/core";

const sourceTypes: RuleProviderSource["type"][] = ["clash-list", "clash-provider", "domain-list-community"];

function listText(values: string[] | undefined): string {
  return (values ?? []).join("\n");
}

function parseListText(value: string): string[] {
  return value.split("\n");
}

function createSource(type: RuleProviderSource["type"]): RuleProviderSource {
  if (type === "domain-list-community") return { name: "Source", type, entry: "" };
  return { name: "Source", type, path: type === "clash-list" ? "config/rules/Source.list" : "" };
}

function updateSource(source: RuleProviderSource, patch: Partial<RuleProviderSource>): RuleProviderSource {
  return { ...source, ...patch } as RuleProviderSource;
}

export function RuleProviderEditor({
  provider,
  onDeleteProvider,
  onSetProviderListField,
  onSetProviderSources,
  onUpdateProvider,
}: {
  provider: RuleProviderConfig | undefined;
  onDeleteProvider: (providerName: string) => void;
  onSetProviderListField: (providerName: string, field: "exclude" | "remove", values: string[]) => void;
  onSetProviderSources: (providerName: string, sources: RuleProviderSource[]) => void;
  onUpdateProvider: (providerName: string, patch: Partial<RuleProviderConfig>) => void;
}) {
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
      <div className="source-list">
        <div className="entity-list-header">
          <h3>Sources</h3>
          <button
            className="command-button"
            type="button"
            onClick={() => onSetProviderSources(provider.name, [...provider.sources, createSource("clash-list")])}
          >
            添加 source
          </button>
        </div>
        {provider.sources.map((source, index) => (
          <div className="source-row" key={`${source.name}-${index}`}>
            <select
              value={source.type}
              onChange={(event) =>
                onSetProviderSources(
                  provider.name,
                  provider.sources.map((item, itemIndex) =>
                    itemIndex === index ? createSource(event.target.value as RuleProviderSource["type"]) : item,
                  ),
                )
              }
            >
              {sourceTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <input
              value={source.name}
              onChange={(event) =>
                onSetProviderSources(
                  provider.name,
                  provider.sources.map((item, itemIndex) =>
                    itemIndex === index ? updateSource(item, { name: event.target.value }) : item,
                  ),
                )
              }
            />
            {"path" in source ? (
              <input
                value={source.path}
                onChange={(event) =>
                  onSetProviderSources(
                    provider.name,
                    provider.sources.map((item, itemIndex) =>
                      itemIndex === index ? updateSource(item, { path: event.target.value }) : item,
                    ),
                  )
                }
              />
            ) : (
              <input
                value={source.entry}
                onChange={(event) =>
                  onSetProviderSources(
                    provider.name,
                    provider.sources.map((item, itemIndex) =>
                      itemIndex === index ? updateSource(item, { entry: event.target.value }) : item,
                    ),
                  )
                }
              />
            )}
            <button
              className="icon-button"
              type="button"
              aria-label="remove source"
              onClick={() =>
                onSetProviderSources(provider.name, provider.sources.filter((_, itemIndex) => itemIndex !== index))
              }
            >
              x
            </button>
          </div>
        ))}
      </div>
      <button
        className="danger-button"
        type="button"
        onClick={() => {
          if (window.confirm(`删除 rule provider ${provider.name}？`)) onDeleteProvider(provider.name);
        }}
      >
        删除 Rule Provider
      </button>
    </section>
  );
}
