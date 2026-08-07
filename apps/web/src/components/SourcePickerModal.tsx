import { useEffect, useMemo, useState } from "react";
import { Button, Input, List, Modal, Select, Space, Tree } from "antd";
import type { DataNode } from "antd/es/tree";
import type { RuleSetSource } from "@clash-route-kit/core";
import {
  fetchCatalogDomains,
  fetchCatalogEntries,
  fetchCatalogEntry,
  fetchCatalogSources,
  formatDomainRule,
  type CatalogEntry,
  type CatalogSourceInfo,
} from "../catalog.js";
import { notifyError } from "../notify.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface PickerCandidate {
  key: string;
  origin?: string;
  originKind?: string;
  name: string;
  label: string;
  source: RuleSetSource;
}

function buildSource(originKind: string | undefined, name: string): RuleSetSource {
  if (originKind === "provider-yaml" || originKind === "list-dir") {
    return { type: "rule-provider", behavior: "domain", file: name };
  }
  return { type: "geosite", value: name };
}

export function SourcePickerModal(props: {
  open: boolean;
  policies: string[];
  defaultPolicy: string;
  sections: string[];
  onAdd: (source: RuleSetSource, policy: string, section?: string) => void;
  onClose: () => void;
  fetcher?: Fetcher;
}) {
  const fetcher = props.fetcher ?? globalThis.fetch;
  const [sources, setSources] = useState<CatalogSourceInfo[]>([]);
  const [origin, setOrigin] = useState<string>("");
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PickerCandidate | null>(null);
  const [crossRepoCandidates, setCrossRepoCandidates] = useState<PickerCandidate[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [policy, setPolicy] = useState(props.defaultPolicy);
  const [section, setSection] = useState<string | undefined>(props.sections[0]);

  useEffect(() => setPolicy(props.defaultPolicy), [props.defaultPolicy]);

  useEffect(() => {
    if (!props.open) return;
    let alive = true;
    void fetchCatalogSources(fetcher)
      .then((result) => {
        if (!alive) return;
        const upstream = result.filter((s) => s.kind === "upstream");
        setSources(upstream);
        setOrigin((current) => current || upstream[0]?.id || "");
      })
      .catch((error: unknown) => notifyError(error instanceof Error ? error.message : String(error)));
    return () => {
      alive = false;
    };
  }, [props.open, fetcher]);

  useEffect(() => {
    if (!origin) return;
    let alive = true;
    void fetchCatalogEntries(origin, fetcher)
      .then((result) => {
        if (!alive) return;
        setEntries(result);
        setTreeData(result.map((e) => ({ key: e.name, title: e.name, isLeaf: !e.hasChildren })));
      })
      .catch((error: unknown) => notifyError(error instanceof Error ? error.message : String(error)));
    return () => {
      alive = false;
    };
  }, [origin, fetcher]);

  useEffect(() => {
    if (!selected?.origin) {
      setDomains([]);
      return;
    }
    let alive = true;
    void fetchCatalogDomains(selected.origin, selected.name, fetcher)
      .then((result) => alive && setDomains(result))
      .catch(() => alive && setDomains([]));
    return () => {
      alive = false;
    };
  }, [selected, fetcher]);

  const originKind = sources.find((s) => s.id === origin)?.originKind;
  const currentCandidates = useMemo(
    () =>
      entries.map((entry) => ({
        key: `${origin}:${entry.name}`,
        origin,
        originKind,
        name: entry.name,
        label: entry.name,
        source: buildSource(originKind, entry.name),
      })),
    [entries, origin, originKind],
  );

  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      setCrossRepoCandidates([]);
      return;
    }
    let alive = true;
    void Promise.all(
      sources
        .filter((source) => source.kind === "upstream" && source.browsable)
        .map(async (source) => ({
          source,
          entries: await fetchCatalogEntries(source.id, fetcher).catch(() => []),
        })),
    ).then((rows) => {
      if (!alive) return;
      setCrossRepoCandidates(
        rows.flatMap(({ source, entries }) =>
          entries
            .filter((entry) => entry.name.toLowerCase().includes(q))
            .map((entry) => ({
              key: `${source.id}:${entry.name}`,
              origin: source.id,
              originKind: source.originKind,
              name: entry.name,
              label: entry.name,
              source: buildSource(source.originKind, entry.name),
            })),
        ),
      );
    });
    return () => {
      alive = false;
    };
  }, [search, sources, fetcher]);

  const visibleCandidates = useMemo(() => {
    const base = search.trim() ? crossRepoCandidates : currentCandidates;
    return base;
  }, [crossRepoCandidates, currentCandidates, search]);

  async function loadChildren(node: DataNode): Promise<void> {
    const detail = await fetchCatalogEntry(origin, String(node.key), fetcher).catch(() => null);
    if (!detail) return;
    const children: DataNode[] = detail.includes.map((name) => ({ key: name, title: name, isLeaf: true }));
    setTreeData((prev) =>
      prev.map((item) => (item.key === node.key ? { ...item, children } : item)),
    );
  }

  const showTree = !search.trim() && originKind === "domain-list";

  return (
    <Modal open={props.open} onCancel={props.onClose} title="添加规则" width={860} footer={null}>
      <Space style={{ width: "100%", marginBottom: 8 }}>
        <Input.Search placeholder="搜索来源…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 320 }} />
        <Select
          value={origin}
          style={{ width: 220 }}
          options={sources.map((s) => ({ value: s.id, label: s.label }))}
          onChange={(value) => {
            setOrigin(value);
            setSelected(null);
          }}
        />
      </Space>
      <div className="rk-picker-body">
        <div style={{ flex: "0 0 46%", overflow: "auto", borderRight: "1px solid #2a2f3a", paddingRight: 8 }}>
          {showTree ? (
            <Tree
              treeData={treeData}
              height={300}
              virtual
              loadData={loadChildren}
              selectedKeys={selected?.origin === origin ? [selected.name] : []}
              onSelect={(keys) => {
                const name = keys[0] ? String(keys[0]) : "";
                const candidate = currentCandidates.find((item) => item.name === name);
                setSelected(candidate ?? null);
              }}
            />
          ) : (
            <List
              size="small"
              dataSource={visibleCandidates.slice(0, 300)}
              renderItem={(candidate) => (
                <List.Item
                  className={selected?.key === candidate.key ? "rk-lib-row on" : "rk-lib-row"}
                  onClick={() => setSelected(candidate)}
                >
                  <span>{candidate.name}</span>
                  {candidate.origin && candidate.origin !== origin ? <span className="rk-lib-meta">{candidate.origin}</span> : null}
                </List.Item>
              )}
            />
          )}
        </div>
        <div data-testid="source-preview" className="rk-source-preview rk-fill-preview">
          <div className="rk-field-label">预览 · {selected?.name || "（未选择）"}</div>
          <pre className="rk-ini rk-ini-fill">{domains.map(formatDomainRule).join("\n")}</pre>
        </div>
      </div>
      <Space style={{ width: "100%", marginTop: 8, justifyContent: "flex-end" }}>
        <span className="rk-field-label">归属</span>
        <Select value={policy} style={{ width: 160 }} options={props.policies.map((p) => ({ value: p, label: p }))} onChange={setPolicy} />
        <span className="rk-field-label">分节</span>
        <Input
          value={section ?? ""}
          placeholder="分节（可空）"
          style={{ width: 140 }}
          onChange={(e) => setSection(e.target.value || undefined)}
        />
        <Button
          type="primary"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            props.onAdd(selected.source, policy, section);
            props.onClose();
          }}
        >
          添加
        </Button>
      </Space>
    </Modal>
  );
}
