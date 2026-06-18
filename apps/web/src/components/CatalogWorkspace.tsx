import { useEffect, useState } from "react";
import { FileText, FolderGit2, RefreshCw } from "lucide-react";
import {
  addVendorRepoRequest,
  createRuleFileRequest,
  fetchCatalogDomains,
  fetchCatalogEntries,
  fetchCatalogEntry,
  fetchCatalogSources,
  formatDomainRule,
  formatSyncedAt,
  syncCatalogVendor,
  type CatalogEntryDetail,
  type CatalogSourceInfo,
  type NewVendorRepoInput,
} from "../catalog.js";
import { type RuleFileState } from "./RuleFileWorkspace.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type LoadStatus = "idle" | "loading" | "error";
type Segment = "upstream" | "local";

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
  const [segment, setSegment] = useState<Segment>("upstream");
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
  const [syncingSource, setSyncingSource] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [categoryIncludes, setCategoryIncludes] = useState<Record<string, string[]>>({});
  const [leafCategories, setLeafCategories] = useState<Set<string>>(new Set());
  const [addRepoOpen, setAddRepoOpen] = useState(false);
  const [newRepo, setNewRepo] = useState<NewVendorRepoInput>({
    name: "",
    url: "",
    path: "",
    branch: "",
    catalog: { dir: "", kind: "list-dir" },
  });
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const upstreamSources = sources.filter((item) => item.kind === "upstream");
  const source = upstreamSources.find((item) => item.id === selectedSourceId) ?? upstreamSources[0];

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
    if (segment !== "upstream" || !source) return;
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
  }, [source?.id, segment, fetcher, refreshKey]);

  useEffect(() => {
    if (segment !== "upstream" || !source || !selectedEntry) return;
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
  }, [source?.id, selectedEntry, segment, fetcher]);

  const query = search.trim().toLowerCase();
  const filteredEntries = query ? entries.filter((entry) => entry.toLowerCase().includes(query)) : entries;
  const sortedEntries = sortDir === "asc" ? filteredEntries : [...filteredEntries].reverse();
  const isDomainListSource =
    source?.originKind === "domain-list" || (!source?.originKind && source?.id === "domain-list-community");
  const topCategories = sortedEntries.filter((entry) => entry.startsWith("category"));
  const localFiles = query ? ruleFileState.files.filter((file) => file.toLowerCase().includes(query)) : ruleFileState.files;

  async function syncOne(id: string) {
    setSyncingSource(id);
    setActionMessage(`正在同步 ${id}…`);
    try {
      await syncCatalogVendor(fetcher, id);
      setActionMessage(`已同步 ${id}`);
      setRefreshKey((key) => key + 1);
    } catch (error: unknown) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncingSource(null);
    }
  }

  function toggleExpand(category: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
    if (!categoryIncludes[category] && source) {
      void fetchCatalogEntry(source.id, category, fetcher)
        .then((detail) => {
          setCategoryIncludes((prev) => ({ ...prev, [category]: detail.includes }));
          if (detail.includes.length === 0) {
            // 已是域名列表、无子列表 —— 标记为叶子，不再当作可展开分类（#4）
            setLeafCategories((prev) => new Set(prev).add(category));
          }
        })
        .catch(() => {});
    }
  }

  const renderEntry = (entry: string) => {
    const badge = entryBadge(source?.originKind, entry);
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

  const renderNode = (name: string, keyPrefix: string) => {
    const isCat = name.startsWith("category") && !leafCategories.has(name);
    const isExpanded = expanded.has(name);
    const members = categoryIncludes[name];
    const loadingMembers = isExpanded && members === undefined;
    return (
      <div className="cat-item" key={`${keyPrefix}/${name}`}>
        <div className="cat-head">
          {isCat ? (
            <button type="button" className="cat-toggle" aria-label={`展开 ${name}`} onClick={() => toggleExpand(name)}>
              {isExpanded ? "▾" : "▸"}
            </button>
          ) : (
            <span className="cat-toggle-spacer" />
          )}
          <button
            type="button"
            className={`catalog-entry ${name === selectedEntry ? "active" : ""}`}
            onClick={() => setSelectedEntry(name)}
          >
            <span className={`bdg ${isCat ? "b-cat" : "b-geo"}`}>{isCat ? "CAT" : "GEO"}</span>
            <span className="en-nm">{name}</span>
          </button>
        </div>
        {isCat && isExpanded ? (
          <div className="cat-children">
            {members && members.length > 0
              ? members.map((member) => renderNode(member, `${keyPrefix}/${name}`))
              : loadingMembers
                ? <span className="empty-line">读取中…</span>
                : null}
          </div>
        ) : null}
      </div>
    );
  };

  async function submitAddRepo() {
    setActionMessage("正在添加上游仓库…");
    try {
      const catalog = newRepo.catalog && newRepo.catalog.dir.trim() ? newRepo.catalog : undefined;
      await addVendorRepoRequest({ ...newRepo, branch: newRepo.branch?.trim() || undefined, catalog }, fetcher);
      setActionMessage(`已添加 ${newRepo.name}，点 ⟳ 同步后即可浏览`);
      setAddRepoOpen(false);
      setNewRepo({ name: "", url: "", path: "", branch: "", catalog: { dir: "", kind: "list-dir" } });
      setRefreshKey((key) => key + 1);
    } catch (error: unknown) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function submitNewList() {
    const name = newListName.trim().endsWith(".list") ? newListName.trim() : `${newListName.trim()}.list`;
    if (!newListName.trim()) return;
    setActionMessage(`正在新建 ${name}…`);
    try {
      await createRuleFileRequest(name, fetcher);
      setActionMessage(`已新建 ${name}`);
      setNewListOpen(false);
      setNewListName("");
      onRefreshRuleFiles();
    } catch (error: unknown) {
      setActionMessage(error instanceof Error ? error.message : String(error));
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
        {segment === "upstream" ? (
          <>
            <span className="sbar-meta">
              {entries.length} 条 · {upstreamSources.length} 源
            </span>
            <button type="button" className="sort-btn" onClick={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))}>
              排序：名称 {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </>
        ) : null}
      </div>

      <div className="catalog-body">
        <aside className="catalog-sources">
          <div className="seg">
            <button
              type="button"
              className={`seg-item ${segment === "upstream" ? "seg-on" : ""}`}
              onClick={() => setSegment("upstream")}
            >
              上游
            </button>
            <button
              type="button"
              className={`seg-item ${segment === "local" ? "seg-on" : ""}`}
              onClick={() => setSegment("local")}
            >
              本地
            </button>
          </div>

          {segment === "upstream" ? (
            <>
              {upstreamSources.map((item) => (
                <div key={item.id} className={`src-row ${item.id === selectedSourceId ? "on" : ""}`}>
                  <button
                    type="button"
                    className="src-pick"
                    onClick={() => {
                      setSelectedSourceId(item.id);
                      setSearch("");
                    }}
                  >
                    <FolderGit2 size={13} />
                    <span className="src-nm">{item.label}</span>
                    <span className="src-c">{item.count || ""}</span>
                    <span className="src-sync-at">{formatSyncedAt(item.syncedAt, Date.now()) || "未同步"}</span>
                  </button>
                  <button
                    type="button"
                    className="src-sync"
                    aria-label={`同步 ${item.label}`}
                    disabled={syncingSource === item.id}
                    onClick={() => void syncOne(item.id)}
                  >
                    <RefreshCw size={13} className={syncingSource === item.id ? "spin" : ""} />
                  </button>
                </div>
              ))}
              <button type="button" className="src-add-row" onClick={() => setAddRepoOpen((value) => !value)}>
                ＋ 添加上游仓库
              </button>
            </>
          ) : (
            <>
              {localFiles.map((file) => (
                <button
                  key={file}
                  type="button"
                  className={`src-row src-pick ${file === ruleFileState.selectedFile ? "on" : ""}`}
                  onClick={() => onLoadRuleFile(file)}
                >
                  <FileText size={13} />
                  <span className="src-nm">{file}</span>
                </button>
              ))}
              {localFiles.length === 0 ? <span className="empty-line">暂无 .list 文件</span> : null}
              <button type="button" className="src-add-row" onClick={() => setNewListOpen((value) => !value)}>
                ＋ 新建本地 .list
              </button>
            </>
          )}

          {actionMessage ? <p className="src-action-msg">{actionMessage}</p> : null}

          {addRepoOpen && segment === "upstream" ? (
            <div className="add-repo-form">
              <input placeholder="名称" value={newRepo.name} onChange={(e) => setNewRepo((r) => ({ ...r, name: e.target.value }))} />
              <input placeholder="git URL" value={newRepo.url} onChange={(e) => setNewRepo((r) => ({ ...r, url: e.target.value }))} />
              <input placeholder="本地路径，如 vendor/xxx" value={newRepo.path} onChange={(e) => setNewRepo((r) => ({ ...r, path: e.target.value }))} />
              <input placeholder="分支（可空）" value={newRepo.branch ?? ""} onChange={(e) => setNewRepo((r) => ({ ...r, branch: e.target.value }))} />
              <input
                placeholder="数据目录，如 vendor/xxx/rules"
                value={newRepo.catalog?.dir ?? ""}
                onChange={(e) => setNewRepo((r) => ({ ...r, catalog: { dir: e.target.value, kind: r.catalog?.kind ?? "list-dir" } }))}
              />
              <select
                aria-label="解析类型"
                value={newRepo.catalog?.kind ?? "list-dir"}
                onChange={(e) =>
                  setNewRepo((r) => ({
                    ...r,
                    catalog: {
                      dir: r.catalog?.dir ?? "",
                      kind: e.target.value as "domain-list" | "list-dir" | "provider-yaml",
                    },
                  }))
                }
              >
                <option value="domain-list">domain-list（含 include）</option>
                <option value="list-dir">list-dir（一堆 .list）</option>
                <option value="provider-yaml">provider-yaml（payload）</option>
                <option value="ini-template">ini-template（模板 .ini）</option>
              </select>
              <button type="button" className="command-button primary" onClick={() => void submitAddRepo()}>
                添加
              </button>
            </div>
          ) : null}

          {newListOpen && segment === "local" ? (
            <div className="add-repo-form">
              <input
                placeholder="文件名，如 Custom_Direct_Domain.list"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
              />
              <button type="button" className="command-button primary" onClick={() => void submitNewList()}>
                新建
              </button>
            </div>
          ) : null}
        </aside>

        {segment === "local" ? (
          <section className="panel editor-panel">
            <div className="panel-heading">
              <div>
                <h2>{ruleFileState.selectedFile || "本地 .list"}</h2>
                <span>{ruleFileState.selectedFile ? "config/rules · 可编辑" : "选择左侧 .list 直接编辑"}</span>
              </div>
              <button
                className="command-button primary"
                disabled={!ruleFileState.selectedFile || ruleFileState.status === "saving"}
                type="button"
                onClick={onSaveRuleFile}
              >
                保存规则文件
              </button>
            </div>
            <p className={`project-message ${ruleFileState.status}`}>{ruleFileState.message}</p>
            <textarea
              className="rule-file-editor"
              disabled={!ruleFileState.selectedFile}
              spellCheck={false}
              value={ruleFileState.text}
              onChange={(event) => onRuleFileTextChange(event.target.value)}
            />
          </section>
        ) : (
          <div className="catalog-main">
            <section className="catalog-grid">
              <p className={`project-message ${entriesStatus}`}>{entriesMessage}</p>
              {query || !isDomainListSource ? (
                <div className="catalog-entries">{sortedEntries.map(renderEntry)}</div>
              ) : (
                <div className="cat-list">
                  {topCategories.map((cat) => renderNode(cat, "root"))}
                  {topCategories.length === 0 ? <span className="empty-line">无分类</span> : null}
                </div>
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
