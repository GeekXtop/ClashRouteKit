import type { ProviderBehavior, RuleSet, RuleSetSource } from "@clash-route-kit/core";

const sourceTypes: RuleSetSource["type"][] = ["rule-provider", "geosite", "geoip", "final"];
const providerBehaviors: ProviderBehavior[] = ["domain", "classical", "ipcidr"];

function createSource(sourceType: RuleSetSource["type"]): RuleSetSource {
  if (sourceType === "rule-provider") return { type: "rule-provider", behavior: "domain", file: "" };
  if (sourceType === "geosite") return { type: "geosite", value: "" };
  if (sourceType === "geoip") return { type: "geoip", value: "", noResolve: true };
  return { type: "final" };
}

function providerKind(behavior: ProviderBehavior): string {
  if (behavior === "domain") return "clash-domain";
  if (behavior === "classical") return "clash-classic";
  return "clash-ipcidr";
}

function previewRuleSetLine(ruleSet: RuleSet, publishBaseUrl: string): string {
  const source = ruleSet.source;
  if (source.type === "rule-provider") {
    return `ruleset=${ruleSet.policy},${providerKind(source.behavior)}:${publishBaseUrl.replace(/\/+$/, "")}/rules/${source.file},${source.interval ?? 28800}`;
  }
  if (source.type === "geosite") return `ruleset=${ruleSet.policy},[]GEOSITE,${source.value}`;
  if (source.type === "geoip") {
    return `ruleset=${ruleSet.policy},[]GEOIP,${source.value}${source.noResolve !== false ? ",no-resolve" : ""}`;
  }
  return `ruleset=${ruleSet.policy},[]FINAL`;
}

export function RuleSetEditor({
  customProxyGroups,
  onDeleteRuleSet,
  onToggleRuleSet,
  onUpdateRuleSet,
  publishBaseUrl,
  ruleSet,
}: {
  customProxyGroups: string[];
  onDeleteRuleSet: (ruleSetId: string) => void;
  onToggleRuleSet: (ruleSetId: string) => void;
  onUpdateRuleSet: (ruleSetId: string, patch: Partial<RuleSet>) => void;
  publishBaseUrl: string;
  ruleSet: RuleSet | undefined;
}) {
  if (!ruleSet) {
    return (
      <section className="panel editor-panel">
        <div className="empty-state">暂无 ruleset</div>
      </section>
    );
  }

  const enabled = ruleSet.enabled !== false;
  const source = ruleSet.source;
  const policyOptions = ruleSet.policy && !customProxyGroups.includes(ruleSet.policy)
    ? [ruleSet.policy, ...customProxyGroups]
    : customProxyGroups;

  return (
    <section className="panel editor-panel">
      <div className="panel-heading">
        <div>
          <h2>编辑 RuleSet</h2>
          <span>{ruleSet.id}</span>
        </div>
      </div>
      <div className="form-grid">
        <label>
          <span>ID</span>
          <input value={ruleSet.id} onChange={(event) => onUpdateRuleSet(ruleSet.id, { id: event.target.value })} />
        </label>
        <label>
          <span>目标 custom_proxy_group</span>
          <select value={ruleSet.policy} onChange={(event) => onUpdateRuleSet(ruleSet.id, { policy: event.target.value })}>
            {policyOptions.map((policy) => (
              <option key={policy} value={policy}>{policy}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Source</span>
          <select
            value={source.type}
            onChange={(event) =>
              onUpdateRuleSet(ruleSet.id, { source: createSource(event.target.value as RuleSetSource["type"]) })
            }
          >
            {sourceTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="check-row">
          <input checked={enabled} type="checkbox" onChange={() => onToggleRuleSet(ruleSet.id)} />
          <span>输出这一条 ruleset</span>
        </label>

        {source.type === "rule-provider" ? (
          <>
            <label>
              <span>Provider 类型</span>
              <select
                value={source.behavior}
                onChange={(event) =>
                  onUpdateRuleSet(ruleSet.id, {
                    source: { ...source, behavior: event.target.value as ProviderBehavior },
                  })
                }
              >
                {providerBehaviors.map((behavior) => (
                  <option key={behavior} value={behavior}>{behavior}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Provider 文件</span>
              <input
                value={source.file}
                onChange={(event) =>
                  onUpdateRuleSet(ruleSet.id, { source: { ...source, file: event.target.value } })
                }
              />
            </label>
            <label>
              <span>Interval</span>
              <input
                inputMode="numeric"
                value={source.interval ?? ""}
                onChange={(event) =>
                  onUpdateRuleSet(ruleSet.id, {
                    source: {
                      ...source,
                      interval: event.target.value ? Number(event.target.value) : undefined,
                    },
                  })
                }
              />
            </label>
          </>
        ) : null}

        {source.type === "geosite" ? (
          <label>
            <span>GEOSITE</span>
            <input
              value={source.value}
              onChange={(event) =>
                onUpdateRuleSet(ruleSet.id, { source: { ...source, value: event.target.value } })
              }
            />
          </label>
        ) : null}

        {source.type === "geoip" ? (
          <>
            <label>
              <span>GEOIP</span>
              <input
                value={source.value}
                onChange={(event) =>
                  onUpdateRuleSet(ruleSet.id, { source: { ...source, value: event.target.value } })
                }
              />
            </label>
            <label className="check-row">
              <input
                checked={source.noResolve !== false}
                type="checkbox"
                onChange={(event) =>
                  onUpdateRuleSet(ruleSet.id, {
                    source: { ...source, noResolve: event.target.checked },
                  })
                }
              />
              <span>no-resolve</span>
            </label>
          </>
        ) : null}

        <label className="wide-field">
          <span>ruleset= 预览</span>
          <code className="output-line">{previewRuleSetLine(ruleSet, publishBaseUrl)}</code>
        </label>
      </div>
      <button
        className="danger-button"
        type="button"
        onClick={() => {
          if (window.confirm(`删除 ruleset ${ruleSet.id}？`)) onDeleteRuleSet(ruleSet.id);
        }}
      >
        删除 ruleset
      </button>
    </section>
  );
}
