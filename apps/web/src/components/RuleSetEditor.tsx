import { useEffect, useState } from "react";
import type { ProviderBehavior, RuleSet, RuleSetSource } from "@clash-route-kit/core";
import { fetchCatalogDomains, formatDomainRule } from "../catalog.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

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
  fetcher = globalThis.fetch,
  onDeleteRuleSet,
  onToggleRuleSet,
  onUpdateRuleSet,
  publishBaseUrl,
  ruleSet,
}: {
  customProxyGroups: string[];
  fetcher?: Fetcher;
  onDeleteRuleSet: (ruleSetId: string) => void;
  onToggleRuleSet: (ruleSetId: string) => void;
  onUpdateRuleSet: (ruleSetId: string, patch: Partial<RuleSet>) => void;
  publishBaseUrl: string;
  ruleSet: RuleSet | undefined;
}) {
  const [domains, setDomains] = useState<string[]>([]);
  const geositeValue = ruleSet && ruleSet.source.type === "geosite" ? ruleSet.source.value : "";

  useEffect(() => {
    if (!geositeValue) {
      setDomains([]);
      return;
    }
    let alive = true;
    void fetchCatalogDomains("domain-list-community", geositeValue, fetcher)
      .then((result) => {
        if (alive) setDomains(result);
      })
      .catch(() => {
        if (alive) setDomains([]);
      });
    return () => {
      alive = false;
    };
  }, [geositeValue, fetcher]);

  if (!ruleSet) {
    return (
      <section className="panel editor-panel">
        <div className="empty-state">暂无 ruleset</div>
      </section>
    );
  }

  const enabled = ruleSet.enabled !== false;
  const source = ruleSet.source;
  const policyOptions =
    ruleSet.policy && !customProxyGroups.includes(ruleSet.policy)
      ? [ruleSet.policy, ...customProxyGroups]
      : customProxyGroups;

  return (
    <section className="panel editor-panel">
      <div className="panel-heading">
        <div>
          <h2>编辑选中规则</h2>
          <span>{ruleSet.id}</span>
        </div>
        <button
          className="del-x"
          type="button"
          aria-label={`删除 ${ruleSet.id}`}
          onClick={() => {
            if (window.confirm(`删除 ruleset ${ruleSet.id}？`)) onDeleteRuleSet(ruleSet.id);
          }}
        >
          ✕
        </button>
      </div>
      <div className="form-grid">
        <label>
          <span>目标策略（移动到）</span>
          <select value={ruleSet.policy} onChange={(event) => onUpdateRuleSet(ruleSet.id, { policy: event.target.value })}>
            {policyOptions.map((policy) => (
              <option key={policy} value={policy}>{policy}</option>
            ))}
          </select>
        </label>
        <label>
          <span>段（section）</span>
          <input
            value={ruleSet.section ?? ""}
            placeholder="默认"
            onChange={(event) => onUpdateRuleSet(ruleSet.id, { section: event.target.value || undefined })}
          />
        </label>
        <label>
          <span>匹配类型</span>
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
              <span>Interval</span>
              <input
                inputMode="numeric"
                value={source.interval ?? ""}
                onChange={(event) =>
                  onUpdateRuleSet(ruleSet.id, {
                    source: { ...source, interval: event.target.value ? Number(event.target.value) : undefined },
                  })
                }
              />
            </label>
            <label className="wide-field">
              <span>匹配（Provider 文件，点改）</span>
              <input
                value={source.file}
                onChange={(event) => onUpdateRuleSet(ruleSet.id, { source: { ...source, file: event.target.value } })}
              />
            </label>
          </>
        ) : null}

        {source.type === "geosite" ? (
          <label className="wide-field">
            <span>匹配（GEOSITE，点改）</span>
            <input
              value={source.value}
              onChange={(event) => onUpdateRuleSet(ruleSet.id, { source: { ...source, value: event.target.value } })}
            />
          </label>
        ) : null}

        {source.type === "geoip" ? (
          <>
            <label className="wide-field">
              <span>匹配（GEOIP，点改）</span>
              <input
                value={source.value}
                onChange={(event) => onUpdateRuleSet(ruleSet.id, { source: { ...source, value: event.target.value } })}
              />
            </label>
            <label className="check-row">
              <input
                checked={source.noResolve !== false}
                type="checkbox"
                onChange={(event) => onUpdateRuleSet(ruleSet.id, { source: { ...source, noResolve: event.target.checked } })}
              />
              <span>no-resolve</span>
            </label>
          </>
        ) : null}

        <label className="wide-field">
          <span>ID</span>
          <input value={ruleSet.id} onChange={(event) => onUpdateRuleSet(ruleSet.id, { id: event.target.value })} />
        </label>
        <label className="wide-field">
          <span>ruleset= 预览</span>
          <code className="output-line">{previewRuleSetLine(ruleSet, publishBaseUrl)}</code>
        </label>
      </div>

      {source.type === "geosite" && domains.length > 0 ? (
        <div className="ruleset-doms">
          <div className="catalog-doms-head">
            <span>域名预览 · {domains.length}</span>
          </div>
          <div className="doms">
            {domains.slice(0, 150).map((domain, index) => (
              <div key={`${domain}-${index}`}>{formatDomainRule(domain)}</div>
            ))}
            {domains.length > 150 ? <div className="dom-more">… 共 {domains.length} 条</div> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
