import { useEffect, useState } from "react";
import { FileText, FolderGit2 } from "lucide-react";
import { fetchCatalogEntries, fetchCatalogEntry, type CatalogEntryDetail } from "../catalog.js";
import { RuleFileWorkspace, type RuleFileState } from "./RuleFileWorkspace.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type LoadStatus = "idle" | "loading" | "error";

interface CatalogSource {
  id: string;
  label: string;
  description: string;
  kind: "upstream" | "local";
}

const CATALOG_SOURCES: CatalogSource[] = [
  {
    id: "domain-list-community",
    label: "domain-list-community",
    description: "上游 GEOSITE 数据（只读）",
    kind: "upstream",
  },
  {
    id: "local",
    label: "本地 .list",
    description: "config/rules 可编辑",
    kind: "local",
  },
];

function CatalogDetail({
  name,
  detail,
  status,
}: {
  name: string;
  detail: CatalogEntryDetail | null;
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
          ? `${detail.ruleCount} 条直接规则 · ${detail.includes.length} 个 include`
          : "";

  return (
    <div className="catalog-detail-body">
      <div className="panel-heading">
        <div>
          <h2>{name}</h2>
          <span>{summary}</span>
        </div>
      </div>
      {detail && detail.includes.length > 0 ? (
        <div className="catalog-includes">
          {detail.includes.map((include) => (
            <span key={include} className="catalog-include-chip">
              {include}
            </span>
          ))}
        </div>
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
  const [selectedSourceId, setSelectedSourceId] = useState<string>(CATALOG_SOURCES[0]!.id);
  const [entries, setEntries] = useState<string[]>([]);
  const [entriesStatus, setEntriesStatus] = useState<LoadStatus>("idle");
  const [entriesMessage, setEntriesMessage] = useState<string>("");
  const [selectedEntry, setSelectedEntry] = useState<string>("");
  const [entryDetail, setEntryDetail] = useState<CatalogEntryDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<LoadStatus>("idle");
  const [search, setSearch] = useState<string>("");

  const source = CATALOG_SOURCES.find((item) => item.id === selectedSourceId) ?? CATALOG_SOURCES[0]!;
  const isLocal = source.kind === "local";

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
    void fetchCatalogEntry(source.id, selectedEntry, fetcher)
      .then((detail) => {
        if (!alive) return;
        setEntryDetail(detail);
        setDetailStatus("idle");
      })
      .catch(() => {
        if (!alive) return;
        setEntryDetail(null);
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
              <span>{CATALOG_SOURCES.length} 个来源</span>
            </div>
          </div>
          {CATALOG_SOURCES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`entity-row ${item.id === selectedSourceId ? "active" : ""}`}
              onClick={() => {
                setSelectedSourceId(item.id);
                setSearch("");
              }}
            >
              <strong>
                {item.kind === "local" ? <FileText size={14} /> : <FolderGit2 size={14} />} {item.label}
              </strong>
              <span>{item.description}</span>
            </button>
          ))}
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
              <CatalogDetail name={selectedEntry} detail={entryDetail} status={detailStatus} />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
