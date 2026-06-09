import { useEffect, useState } from "react";
import { FileText, FolderGit2 } from "lucide-react";
import {
  fetchCatalogDomains,
  fetchCatalogEntries,
  fetchCatalogEntry,
  fetchCatalogSources,
  formatDomainRule,
  formatSyncedAt,
  syncCatalogVendor,
  type CatalogEntryDetail,
  type CatalogSourceInfo,
} from "../catalog.js";
import { RuleFileWorkspace, type RuleFileState } from "./RuleFileWorkspace.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type LoadStatus = "idle" | "loading" | "error";

const FALLBACK_SOURCES: CatalogSourceInfo[] = [
  { id: "domain-list-community", label: "domain-list-community", kind: "upstream", count: 0, syncedAt: null, browsable: true },
  { id: "local", label: "本地 .list", kind: "local", count: 0, syncedAt: null, browsable: true },
];

function entryBadge(originKind: string | undefined, entry: string): { label: string; cls: string } {
  if (originKind === "list-dir") return { label: "LST", cls: "b-list" };
  if (originKind === "provider-yaml") return { label: "DLR", cls: "b-dler" };
  return entry.startsWith("category") ? { label: "CAT", cls: "b-cat" } : { label: "GEO", cls: "b-geo" };
}

function CatalogDetail({
  name,
  detail,
  domains,
  status,
}: {
  name: string;
  detail: CatalogEntryDetail | null;
  domains: string[];
  status: LoadStatus;
}) {
  if (!name) {
    return (
      <div className="panel-heading">
        <div>
          <h2>条目详情</h2>
          <span>选择左侧条目查看只读详情</span>
        </div>
      </div>
    );
  }

  const summary =
    status === "loading"
      ? "正在读取…"
      : status === "error"
        ? "读取失败"
        : domains.length > 0
          ? `${domains.length} 域名 · 只读`
          : detail
            ? "只读"
            : "";

  return (
    <div className="catalog-detail-body">
      <div className="panel-heading">
        <div>
          <h2>{name}</h2>
          <span>{summary}</span>
        </div>
      </div>
      {domains.length > 0 ? (
        <>
          <div className="catalog-doms-head">
            <span>全部域名</span>
            <button
              type="button"
              className="copy-link"
              onClick={() => void navigator.clipboard.writeText(domains.map(formatDomainRule).join("\n"))}
            >
              复制
            </button>
          </div>
          <div className="doms">
            {domains.slice(0, 200).map((domain, index) => (
              <div key={`${domain}-${index}`}>{formatDomainRule(domain)}</div>
            ))}
            {domains.length > 200 ? <div className="dom-more">… 共 {domains.length} 条</div> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function CatalogWorkspace({
  ruleFileState,
  onLoadRuleFile,
  onSaveRuleFile,
  onRefreshRuleFiles,
  onRuleFileTextChange,
  fetcher = globalThis.fetch,
}: {
  ruleFileState: RuleFileState;
  onLoadRuleFile: (file: string) => void;
  onSaveRuleFile: () => void;
  onRefreshRuleFiles: () => void;
  onRuleFileTextChange: (text: string) => void;
  fetcher?: Fetcher;
}) {
  const [sources, setSources] = useState<CatalogSourceInfo[]>(FALLBACK_SOURCES);
  const [selectedSourceId, setSelectedSourceId] = useState<string>("domain-list-community");
  const [entries, setEntries] = useState<string[]>([]);
  const [entriesStatus, setEntriesStatus] = useState<LoadStatus>("idle");
  const [entriesMessage, setEntriesMessage] = useState<string>("");
  const [selectedEntry, setSelectedEntry] = useState<string>("");
  const [entryDetail, setEntryDetail] = useState<CatalogEntryDetail | null>(null);
  const [entryDomains, setEntryDomains] = useState<string[]>([]);
  const [detailStatus, setDetailStatus] = useState<LoadStatus>("idle");
  const [search, setSearch] = useState<string>("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [syncing, setSyncing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [categoryIncludes, setCategoryIncludes] = useState<Record<string, string[]>>({});

  const source = sources.find((item) => item.id === selectedSourceId) ?? sources[0]!;
  const isLocal = source.kind === "local";

  useEffect(() => {
    let alive = true;
    void fetchCatalogSources(fetcher)
      .then((result) => {
        if (alive && result.length > 0) setSources(result);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [fetcher, refreshKey]);

  useEffect(() => {
    if (isLocal) return;
    let alive = true;
    setEntriesStatus("loading");
    setEntriesMessage("正在读取条目…");
    setSelectedEntry("");
    setEntryDetail(null);
    void fetchCatalogEntries(source.id, fetcher)
      .then((result) => {
        if (!alive) return;
        setEntries(result);
        setEntriesStatus("idle");
        setEntriesMessage(`${result.length} 个条目`);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setEntries([]);
        setEntriesStatus("error");
        setEntriesMessage(error instanceof Error ? error.message : String(error));
      });
    return () => {
      alive = false;
    };
  }, [source.id, isLocal, fetcher, refreshKey]);

  useEffect(() => {
    if (isLocal || !selectedEntry) return;
    let alive = true;
    setDetailStatus("loading");
    setEntryDetail(null);
    setEntryDomains([]);
    void Promise.all([
      fetchCatalogEntry(source.id, selectedEntry, fetcher),
      fetchCatalogDomains(source.id, selectedEntry, fetcher).catch(() => [] as string[]),
    ])
      .then(([detail, domains]) => {
        if (!alive) return;
        setEntryDetail(detail);
        setEntryDomains(domains);
        setDetailStatus("idle");
      })
      .catch(() => {
        if (!alive) return;
        setEntryDetail(null);
        setEntryDomains([]);
        setDetailStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [source.id, selectedEntry, isLocal, fetcher]);

  const query = search.trim().toLowerCase();
  const filteredEntries = query
    ? entries.filter((entry) => entry.toLowerCase().includes(query))
    : entries;
  const sortedEntries = sortDir === "asc" ? filteredEntries : [...filteredEntries].reverse();
  const isDomainListSource =
    source.originKind === "domain-list" || (!source.originKind && source.id === "domain-list-community");
  const categoryEntries = sortedEntries.filter((entry) => entry.startsWith("category"));
  const geositeEntries = sortedEntries.filter((entry) => !entry.startsWith("category"));

  const renderEntry = (entry: string) => {
    const badge = entryBadge(source.originKind, entry);
    return (
      <button
        key={entry}
        type="button"
        className={`catalog-entry ${entry === selectedEntry ? "active" : ""}`}
        onClick={() => setSelectedEntry(entry)}
      >
        <span className={`bdg ${badge.cls}`}>{badge.label}</span>
        <span className="en-nm">{entry}</span>
      </button>
    );
  };

  async function handleSync() {
    setSyncing(true);
    try {
      await syncCatalogVendor(fetcher);
      setRefreshKey((key) => key + 1);
    } catch {
      // 同步失败时保留旧数据
    } finally {
      setSyncing(false);
    }
  }

  function toggleExpand(category: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
    if (!categoryIncludes[category]) {
      void fetchCatalogEntry(source.id, category, fetcher)
        .then((detail) => setCategoryIncludes((prev) => ({ ...prev, [category]: detail.includes })))
        .catch(() => {});
    }
  }

  return (
    <div className="catalog-workspace">
      <div className="catalog-search">
        <input
          type="search"
          placeholder="搜索条目 / 文件…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {!isLocal ? (
          <>
            <span className="sbar-meta">
              {entries.length} 条 · {sources.length} 源
            </span>
            <button
              type="button"
              className="sort-btn"
              onClick={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))}
            >
              排序：名称 {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </>
        ) : null}
      </div>
      <div className="catalog-body">
        <aside className="catalog-sources">
          <div className="entity-list-header">
            <div>
              <h2>数据源</h2>
              <span>{sources.length} 个来源</span>
            </div>
          </div>
          <div className="src-sec">
            上游 <span className="src-ro">只读</span>
            <button type="button" className="sync-all" disabled={syncing} onClick={handleSync}>
              {syncing ? "同步中…" : "⟳ 同步"}
            </button>
          </div>
          {sources
            .filter((item) => item.kind === "upstream")
            .map((item) => (
              <button
                key={item.id}
                type="button"
                className={`repo ${item.id === selectedSourceId ? "on" : ""}`}
                onClick={() => {
                  setSelectedSourceId(item.id);
                  setSearch("");
                }}
              >
                <div className="repo-r1">
                  <FolderGit2 size={13} />
                  <span className="repo-nm">{item.label}</span>
                  <span className="repo-c">{item.count || ""}</span>
                </div>
                <div className="repo-r2">
                  <span className="repo-sync">● {formatSyncedAt(item.syncedAt, Date.now()) || "未同步"}</span>
                </div>
              </button>
            ))}
          <div className="addrepo">＋ 添加上游仓库</div>
          <div className="src-sec">
            本地 <span className="src-ed">可编辑 ✦</span>
          </div>
          {sources
            .filter((item) => item.kind === "local")
            .map((item) => (
              <button
                key={item.id}
                type="button"
                className={`repo ${item.id === selectedSourceId ? "on" : ""}`}
                onClick={() => {
                  setSelectedSourceId(item.id);
                  setSearch("");
                }}
              >
                <div className="repo-r1">
                  <FileText size={13} />
                  <span className="repo-nm">{item.label}</span>
                  <span className="repo-c">{item.count || ""}</span>
                </div>
                <div className="repo-r2">
                  <span className="repo-mut">config/rules 可编辑</span>
                </div>
              </button>
            ))}
          <div className="addrepo">＋ 新建本地 .list</div>
        </aside>

        {isLocal ? (
          <RuleFileWorkspace
            ruleFileState={ruleFileState}
            onLoadFile={onLoadRuleFile}
            onRefreshFiles={onRefreshRuleFiles}
            onSaveFile={onSaveRuleFile}
            onTextChange={onRuleFileTextChange}
          />
        ) : (
          <div className="catalog-main">
            <section className="catalog-grid">
              <p className={`project-message ${entriesStatus}`}>{entriesMessage}</p>
              {isDomainListSource ? (
                <>
                  <details className="cat-group" open>
                    <summary>分类 categories · {categoryEntries.length}</summary>
                    <div className="cat-list">
                      {categoryEntries.map((cat) => (
                        <div key={cat} className="cat-item">
                          <div className="cat-head">
                            <button
                              type="button"
                              className="cat-toggle"
                              aria-label={`展开 ${cat}`}
                              onClick={() => toggleExpand(cat)}
                            >
                              {expanded.has(cat) ? "▾" : "▸"}
                            </button>
                            <button
                              type="button"
                              className={`catalog-entry ${cat === selectedEntry ? "active" : ""}`}
                              onClick={() => setSelectedEntry(cat)}
                            >
                              <span className="bdg b-cat">CAT</span>
                              <span className="en-nm">{cat}</span>
                            </button>
                          </div>
                          {expanded.has(cat) ? (
                            <div className="cat-members">
                              {(categoryIncludes[cat] ?? []).map((member) => (
                                <button
                                  key={member}
                                  type="button"
                                  className={`catalog-entry ${member === selectedEntry ? "active" : ""}`}
                                  onClick={() => setSelectedEntry(member)}
                                >
                                  <span className="bdg b-geo">GEO</span>
                                  <span className="en-nm">{member}</span>
                                </button>
                              ))}
                              {(categoryIncludes[cat]?.length ?? 0) === 0 ? (
                                <span className="empty-line">无 include 或读取中…</span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ))}
                      {categoryEntries.length === 0 ? <span className="empty-line">无分类</span> : null}
                    </div>
                  </details>
                  <details className="cat-group" open>
                    <summary>GEOSITE · {geositeEntries.length}</summary>
                    <div className="catalog-entries">{geositeEntries.map(renderEntry)}</div>
                  </details>
                </>
              ) : (
                <div className="catalog-entries">{sortedEntries.map(renderEntry)}</div>
              )}
              {sortedEntries.length === 0 && entriesStatus !== "loading" ? (
                <div className="empty-state">无匹配条目</div>
              ) : null}
            </section>
            <aside className="catalog-detail">
              <CatalogDetail name={selectedEntry} detail={entryDetail} domains={entryDomains} status={detailStatus} />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
