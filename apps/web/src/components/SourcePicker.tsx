import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { RuleProviderSource } from "@clash-route-kit/core";
import { fetchCatalogEntries, fetchCatalogSources, type CatalogSourceInfo } from "../catalog.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type LoadStatus = "idle" | "loading" | "error";

function badgeFor(source: CatalogSourceInfo): { label: string; cls: string } {
  if (source.originKind === "list-dir") return { label: "LST", cls: "b-list" };
  if (source.originKind === "provider-yaml") return { label: "DLR", cls: "b-dler" };
  return { label: "GEO", cls: "b-geo" };
}

function toProviderSource(source: CatalogSourceInfo, entry: string): RuleProviderSource {
  if (source.originKind === "provider-yaml") {
    return { name: entry, type: "clash-provider", path: `${source.id}/${entry}` };
  }
  if (source.originKind === "list-dir") {
    return { name: entry, type: "clash-list", path: `${source.id}/${entry}.list` };
  }
  return { name: entry, type: "domain-list-community", entry };
}

export function SourcePicker({
  fetcher = globalThis.fetch,
  onAdd,
  onClose,
}: {
  fetcher?: Fetcher;
  onAdd: (source: RuleProviderSource) => void;
  onClose: () => void;
}) {
  const [sources, setSources] = useState<CatalogSourceInfo[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("domain-list-community");
  const [entries, setEntries] = useState<string[]>([]);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [search, setSearch] = useState("");
  const [selectedEntry, setSelectedEntry] = useState("");

  useEffect(() => {
    let alive = true;
    void fetchCatalogSources(fetcher)
      .then((result) => {
        if (alive) setSources(result.filter((source) => source.kind === "upstream"));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [fetcher]);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setSelectedEntry("");
    void fetchCatalogEntries(selectedSourceId, fetcher)
      .then((result) => {
        if (!alive) return;
        setEntries(result);
        setStatus("idle");
      })
      .catch(() => {
        if (!alive) return;
        setEntries([]);
        setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [selectedSourceId, fetcher]);

  const source = sources.find((item) => item.id === selectedSourceId);
  const query = search.trim().toLowerCase();
  const filtered = query ? entries.filter((entry) => entry.toLowerCase().includes(query)) : entries;

  return (
    <div className="picker-overlay" role="dialog" aria-label="添加来源">
      <div className="picker-panel panel">
        <div className="panel-heading">
          <div>
            <h2>从目录挑来源</h2>
            <span>{status === "loading" ? "正在读取…" : `${entries.length} 条`}</span>
          </div>
          <button className="del-x" type="button" aria-label="关闭" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="picker-body">
          <div className="picker-searchbar">
            <select
              aria-label="来源"
              className="sort-btn"
              value={selectedSourceId}
              onChange={(event) => setSelectedSourceId(event.target.value)}
            >
              {sources.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
            <input
              className="picker-search"
              type="search"
              placeholder="搜索条目…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="picker-entries">
            {filtered.map((entry) => (
              <button
                key={entry}
                type="button"
                className={`catalog-entry ${entry === selectedEntry ? "active" : ""}`}
                onClick={() => setSelectedEntry(entry)}
              >
                {source ? <span className={`bdg ${badgeFor(source).cls}`}>{badgeFor(source).label}</span> : null}
                <span className="en-nm">{entry}</span>
              </button>
            ))}
            {filtered.length === 0 && status !== "loading" ? <div className="empty-state">无匹配条目</div> : null}
          </div>
        </div>
        <div className="picker-actions">
          <button type="button" className="command-button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="command-button primary"
            disabled={!selectedEntry || !source}
            onClick={() => {
              if (source && selectedEntry) onAdd(toProviderSource(source, selectedEntry));
            }}
          >
            添加来源
          </button>
        </div>
      </div>
    </div>
  );
}
