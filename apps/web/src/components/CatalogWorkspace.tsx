import { useEffect, useState } from "react";
import { FileText, FolderGit2 } from "lucide-react";
import {
  fetchCatalogDomains,
  fetchCatalogEntries,
  fetchCatalogEntry,
  fetchCatalogSources,
  formatDomainRule,
  formatSyncedAt,
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
        : detail
          ? "GEOSITE · 只读"
          : "";

  return (
    <div className="catalog-detail-body">
      <div className="panel-heading">
        <div>
          <h2>{name}</h2>
          <span>{summary}</span>
        </div>
      </div>
      {detail ? (
        <div className="catalog-kv">
          <div className="kv-cell">
            <strong>{domains.length || detail.ruleCount}</strong>
            <span>域名</span>
          </div>
          <div className="kv-cell">
            <strong>{detail.includes.length}</strong>
            <span>include</span>
          </div>
          <div className="kv-cell">
            <strong>{detail.ruleCount}</strong>
            <span>直接</span>
          </div>
        </div>
      ) : null}
      {detail && detail.includes.length > 0 ? (
        <div className="catalog-includes">
          {detail.includes.map((include) => (
            <span key={include} className="catalog-include-chip">
              {include}
            </span>
          ))}
        </div>
      ) : null}
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
  }, [fetcher]);

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
  }, [source.id, isLocal, fetcher]);

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

  return (
    <div className="catalog-workspace">
      <div className="catalog-search">
        <input
          type="search"
          placeholder="搜索条目 / 文件…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
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
              <div className="catalog-entries">
                {filteredEntries.map((entry) => {
                  const isCategory = entry.startsWith("category");
                  return (
                    <button
                      key={entry}
                      type="button"
                      className={`catalog-entry ${entry === selectedEntry ? "active" : ""}`}
                      onClick={() => setSelectedEntry(entry)}
                    >
                      <span className={`bdg ${isCategory ? "b-cat" : "b-geo"}`}>{isCategory ? "CAT" : "GEO"}</span>
                      <span className="en-nm">{entry}</span>
                    </button>
                  );
                })}
                {filteredEntries.length === 0 && entriesStatus !== "loading" ? (
                  <div className="empty-state">无匹配条目</div>
                ) : null}
              </div>
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
