import { useEffect, useState } from "react";
import { Input, List, Tree } from "antd";
import type { DataNode } from "antd/es/tree";
import {
  fetchCatalogDomains,
  fetchCatalogEntries,
  fetchCatalogEntry,
  formatDomainRule,
  type CatalogEntry,
} from "../catalog.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function CatalogBrowser({
  origin,
  originKind,
  fetcher,
}: {
  origin: string;
  originKind?: string;
  fetcher?: Fetcher;
}) {
  const fetch = fetcher ?? globalThis.fetch;
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [domains, setDomains] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    setSelected("");
    setDomains([]);
    void fetchCatalogEntries(origin, fetch)
      .then((result) => {
        if (!alive) return;
        setEntries(result);
        setTreeData(result.map((e) => ({ key: e.name, title: e.name, isLeaf: !e.hasChildren })));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [origin, fetch]);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    void fetchCatalogDomains(origin, selected, fetch)
      .then((result) => alive && setDomains(result))
      .catch(() => alive && setDomains([]));
    return () => {
      alive = false;
    };
  }, [origin, selected, fetch]);

  async function loadChildren(node: DataNode): Promise<void> {
    const detail = await fetchCatalogEntry(origin, String(node.key), fetch).catch(() => null);
    if (!detail) return;
    const children: DataNode[] = detail.includes.map((name) => ({ key: name, title: name, isLeaf: true }));
    setTreeData((prev) => prev.map((item) => (item.key === node.key ? { ...item, children } : item)));
  }

  const showTree = !search.trim() && originKind === "domain-list";
  const filtered = search.trim()
    ? entries.filter((e) => e.name.toLowerCase().includes(search.trim().toLowerCase()))
    : entries;

  return (
    <div className="rk-page-col" style={{ height: "100%", padding: 12 }}>
      <Input.Search
        placeholder={`在 ${origin} 内搜索条目…`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <div style={{ display: "flex", gap: 8, flex: 1, minHeight: 0 }}>
        <div style={{ flex: "0 0 46%", overflow: "auto", borderRight: "1px solid var(--rk-border)", paddingRight: 8 }}>
          {showTree ? (
            <Tree
              treeData={treeData}
              height={520}
              virtual
              loadData={loadChildren}
              selectedKeys={selected ? [selected] : []}
              onSelect={(keys) => keys[0] && setSelected(String(keys[0]))}
            />
          ) : (
            <List
              size="small"
              dataSource={filtered.slice(0, 300)}
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
          <div className="rk-field-label">{selected ? `${selected} · ${domains.length} 条` : "选择左侧条目查看规则"}</div>
          <pre className="rk-ini">{domains.map(formatDomainRule).join("\n")}</pre>
        </div>
      </div>
    </div>
  );
}
