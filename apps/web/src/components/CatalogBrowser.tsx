import { useEffect, useMemo, useRef, useState } from "react";
import { Input, List, Tree } from "antd";
import type { DataNode } from "antd/es/tree";
import {
  fetchCatalogDomains,
  fetchCatalogEntries,
  fetchCatalogEntry,
  fetchCatalogPath,
  formatDomainRule,
  searchCatalogEntries,
  type CatalogEntry,
  type CatalogSearchHit,
} from "../catalog.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

// Tree keys are path-scoped (`parent::child`) so the same entry can appear under
// multiple parents without colliding; the real entry name is the last segment.
function entryNameOf(key: string): string {
  const index = key.lastIndexOf("::");
  return index === -1 ? key : key.slice(index + 2);
}

function attachChildren(nodes: DataNode[], key: string, children: DataNode[]): DataNode[] {
  return nodes.map((node) => {
    if (node.key === key) return { ...node, children };
    if (node.children) return { ...node, children: attachChildren(node.children, key, children) };
    return node;
  });
}

// Order within a level: expandable entries (have children) first, then leaves; alphabetical within each.
export function sortCatalogNodes(nodes: DataNode[]): DataNode[] {
  return [...nodes].sort((a, b) => {
    const aBranch = a.isLeaf === false ? 0 : 1;
    const bBranch = b.isLeaf === false ? 0 : 1;
    if (aBranch !== bBranch) return aBranch - bBranch;
    return String(a.title).localeCompare(String(b.title));
  });
}

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
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<CatalogSearchHit[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [domains, setDomains] = useState<string[]>([]);
  const [highlight, setHighlight] = useState("");
  // name → expanded+deduped domain count (same source as the right pane's "· N 条"),
  // filled lazily only for nodes that actually appear in the tree.
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const treeScrollRef = useRef<HTMLDivElement>(null);
  const treeDataRef = useRef<DataNode[]>([]);
  treeDataRef.current = treeData;

  const hasChildrenByName = useMemo(
    () => new Map(entries.map((entry) => [entry.name, entry.hasChildren])),
    [entries],
  );

  useEffect(() => {
    let alive = true;
    setSelectedKey("");
    setSelectedName("");
    setDomains([]);
    setExpandedKeys([]);
    setHighlight("");
    setCounts(new Map());
    void fetchCatalogEntries(origin, fetch)
      .then((result) => {
        if (!alive) return;
        setEntries(result);
        // domain-list-community is ~1500 flat files; surface only the ROOT `category-*`
        // (not pulled in by another entry) as the collapsible top level, so sub-categories
        // like category-ads appear only nested under category-ads-all, never duplicated at top.
        const roots = result.filter((e) => e.name.startsWith("category-") && e.root);
        const top = roots.length > 0 ? roots : result;
        setTreeData(sortCatalogNodes(top.map((e) => ({ key: e.name, title: e.name, isLeaf: !e.hasChildren }))));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [origin, fetch]);

  // Backend reverse lookup: matches entry name AND the entry's own domains.
  useEffect(() => {
    const query = search.trim();
    if (!query) {
      setHits([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      void searchCatalogEntries(origin, query, fetch)
        .then((result) => alive && setHits(result))
        .catch(() => alive && setHits([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [origin, search, fetch]);

  useEffect(() => {
    if (!selectedName) return;
    let alive = true;
    void fetchCatalogDomains(origin, selectedName, fetch)
      .then((result) => {
        if (!alive) return;
        setDomains(result);
        // Cache the count for the tree (point-and-count): only the node you actually open is computed.
        setCounts((prev) => new Map(prev).set(selectedName, result.length));
      })
      .catch(() => alive && setDomains([]));
    return () => {
      alive = false;
    };
  }, [origin, selectedName, fetch]);

  function childNodesOf(parentKey: string, includes: string[]): DataNode[] {
    const ancestry = parentKey.split("::");
    return sortCatalogNodes(
      includes.map((name) => ({
        key: `${parentKey}::${name}`,
        title: name,
        // expandable when the included entry itself has includes; stop on cycles
        isLeaf: !(hasChildrenByName.get(name) ?? false) || ancestry.includes(name),
      })),
    );
  }

  async function loadChildren(node: DataNode): Promise<void> {
    const parentKey = String(node.key);
    const detail = await fetchCatalogEntry(origin, entryNameOf(parentKey), fetch).catch(() => null);
    if (!detail) return;
    setTreeData((prev) => attachChildren(prev, parentKey, childNodesOf(parentKey, detail.includes)));
  }

  function select(name: string, key: string): void {
    setSelectedName(name);
    setSelectedKey(key);
  }

  // From a search hit: jump into the tree at that entry (expand its ancestry, select it) and
  // highlight the matched domain on the right. Falls back to plain select if it has no tree path.
  async function locateFromHit(name: string): Promise<void> {
    setHighlight(search.trim());
    const trail = await fetchCatalogPath(origin, name, fetch).catch(() => [] as string[]);
    if (trail.length === 0) {
      select(name, name);
      return;
    }
    let tree = treeDataRef.current;
    let parentKey = trail[0]!;
    const expand: React.Key[] = [parentKey];
    for (let i = 1; i < trail.length; i += 1) {
      const detail = await fetchCatalogEntry(origin, entryNameOf(parentKey), fetch).catch(() => null);
      if (!detail) break;
      tree = attachChildren(tree, parentKey, childNodesOf(parentKey, detail.includes));
      parentKey = `${parentKey}::${trail[i]}`;
      if (i < trail.length - 1) expand.push(parentKey);
    }
    setTreeData(tree);
    setExpandedKeys((prev) => Array.from(new Set([...prev, ...expand])));
    setSelectedKey(parentKey);
    setSelectedName(name);
    setSearch("");
    // Native (non-virtual) tree: scroll the freshly-selected node into view via the DOM.
    setTimeout(() => {
      treeScrollRef.current?.querySelector(".ant-tree-treenode-selected")?.scrollIntoView({ block: "nearest" });
    }, 0);
  }

  const searching = search.trim().length > 0;
  const showTree = !searching && originKind === "domain-list";

  return (
    <div className="rk-page-col" style={{ height: "100%" }}>
      {/* 搜索框横跨顶部 */}
      <div style={{ padding: "12px 12px 8px" }}>
        <Input
          allowClear
          placeholder={`在 ${origin} 内搜索条目名或域名…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* 左栏：树/列表作为二级侧栏；右栏规则铺满到边、滚动条贴边（同路由页 RuleStream） */}
        <div
          style={{
            flex: "0 0 46%",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "hidden",
            borderRight: "1px solid var(--rk-border)",
          }}
        >
          {showTree ? (
            <div ref={treeScrollRef} style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "0 8px 8px" }}>
              <Tree
                className="rk-cat-tree"
                treeData={treeData}
                loadData={loadChildren}
                expandedKeys={expandedKeys}
                onExpand={(keys) => setExpandedKeys(keys)}
                selectedKeys={selectedKey ? [selectedKey] : []}
                titleRender={(node) => {
                  const name = entryNameOf(String(node.key));
                  const count = name === selectedName ? counts.get(name) : undefined;
                  return (
                    <span>
                      {node.title as React.ReactNode}
                      {typeof count === "number" ? <span className="rk-cat-count">{count}</span> : null}
                    </span>
                  );
                }}
                onSelect={(keys) => {
                  if (keys[0] === undefined) return;
                  setHighlight("");
                  select(entryNameOf(String(keys[0])), String(keys[0]));
                }}
              />
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 4px 8px" }}>
              <List
                size="small"
                dataSource={searching ? hits : entries}
                locale={{ emptyText: searching ? "无匹配条目" : "（空）" }}
                renderItem={(item: CatalogSearchHit | CatalogEntry) => {
                  const matched = "matchedDomains" in item ? item.matchedDomains : [];
                  const count = item.name === selectedName ? counts.get(item.name) : undefined;
                  return (
                    <List.Item
                      className={selectedName === item.name ? "rk-lib-row on" : "rk-lib-row"}
                      onClick={() => {
                        if (searching) {
                          void locateFromHit(item.name);
                        } else {
                          setHighlight("");
                          select(item.name, item.name);
                        }
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <span style={{ display: "flex", alignItems: "baseline", minWidth: 0 }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                          {typeof count === "number" ? <span className="rk-cat-count">{count}</span> : null}
                        </span>
                        {matched.length ? (
                          <span className="rk-lib-meta" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {matched.join("、")}
                          </span>
                        ) : null}
                      </div>
                    </List.Item>
                  );
                }}
              />
            </div>
          )}
        </div>
        {/* 右栏：规则铺满到右边缘，滚动条贴窗口边（同 rk-stream-body：内容留白、滚动条贴边） */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          {selectedName ? (
            <pre key={selectedName} className="rk-catalog-rules" style={{ padding: "0 14px 14px" }}>
              {highlight
                ? domains.map((domain, index) => {
                    const line = formatDomainRule(domain);
                    const isHit = line.toLowerCase().includes(highlight.toLowerCase());
                    return (
                      <div key={index} className={isHit ? "rk-ini-hit" : undefined}>
                        {line}
                      </div>
                    );
                  })
                : domains.map(formatDomainRule).join("\n")}
            </pre>
          ) : (
            <div className="rk-empty" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              选择左侧条目查看规则
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
