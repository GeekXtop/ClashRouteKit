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
  const [selected, setSelected] = useState<string>("");
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
    if (!origin || !selected) return;
    let alive = true;
    void fetchCatalogDomains(origin, selected, fetcher)
      .then((result) => alive && setDomains(result))
      .catch(() => alive && setDomains([]));
    return () => {
      alive = false;
    };
  }, [origin, selected, fetcher]);

  const originKind = sources.find((s) => s.id === origin)?.originKind;
  const filtered = useMemo(
    () => (search.trim() ? entries.filter((e) => e.name.toLowerCase().includes(search.trim().toLowerCase())) : entries),
    [entries, search],
  );

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
            setSelected("");
          }}
        />
      </Space>
      <div style={{ display: "flex", gap: 8, minHeight: 240 }}>
        <div style={{ flex: "0 0 46%", overflow: "auto", borderRight: "1px solid #2a2f3a", paddingRight: 8 }}>
          {showTree ? (
            <Tree
              treeData={treeData}
              loadData={loadChildren}
              selectedKeys={selected ? [selected] : []}
              onSelect={(keys) => keys[0] && setSelected(String(keys[0]))}
            />
          ) : (
            <List
              size="small"
              dataSource={filtered}
              renderItem={(entry) => (
                <List.Item
                  className={selected === entry.name ? "rk-lib-row on" : "rk-lib-row"}
                  onClick={() => setSelected(entry.name)}
                >
                  {entry.name}
                </List.Item>
              )}
            />
          )}
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          <div className="rk-field-label">预览 · {selected || "（未选择）"}</div>
          <pre className="rk-ini">{domains.map(formatDomainRule).join("\n")}</pre>
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
            props.onAdd(buildSource(originKind, selected), policy, section);
            props.onClose();
          }}
        >
          添加
        </Button>
      </Space>
    </Modal>
  );
}
