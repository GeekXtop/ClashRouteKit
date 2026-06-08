import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { fetchCatalogEntries } from "../catalog.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type LoadStatus = "idle" | "loading" | "error";

export function RoutePicker({
  policies,
  sections,
  fetcher = globalThis.fetch,
  onAdd,
  onClose,
}: {
  policies: string[];
  sections: string[];
  fetcher?: Fetcher;
  onAdd: (value: string, policy: string, section: string) => void;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<string[]>([]);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selectedEntry, setSelectedEntry] = useState("");
  const [policy, setPolicy] = useState(policies[0] ?? "");
  const [section, setSection] = useState("");

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setMessage("正在读取条目…");
    void fetchCatalogEntries("domain-list-community", fetcher)
      .then((result) => {
        if (!alive) return;
        setEntries(result);
        setStatus("idle");
        setMessage(`${result.length} 个条目`);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : String(error));
      });
    return () => {
      alive = false;
    };
  }, [fetcher]);

  const query = search.trim().toLowerCase();
  const filtered = query ? entries.filter((entry) => entry.toLowerCase().includes(query)) : entries;

  return (
    <div className="picker-overlay" role="dialog" aria-label="添加规则">
      <div className="picker-panel panel">
        <div className="panel-heading">
          <div>
            <h2>添加规则（GEOSITE）</h2>
            <span>{message}</span>
          </div>
          <button className="icon-button" type="button" aria-label="关闭" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="picker-body">
          <input
            className="picker-search"
            type="search"
            placeholder="搜索 GEOSITE 条目…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="picker-entries">
            {filtered.map((entry) => (
              <button
                key={entry}
                type="button"
                className={`catalog-entry ${entry === selectedEntry ? "active" : ""}`}
                onClick={() => setSelectedEntry(entry)}
              >
                {entry}
              </button>
            ))}
            {filtered.length === 0 && status !== "loading" ? (
              <div className="empty-state">无匹配条目</div>
            ) : null}
          </div>
          <div className="picker-form">
            <label>
              <span>目标策略</span>
              <select aria-label="目标策略" value={policy} onChange={(event) => setPolicy(event.target.value)}>
                {policies.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>段（可选）</span>
              <input
                aria-label="段"
                list="route-picker-sections"
                value={section}
                onChange={(event) => setSection(event.target.value)}
              />
              <datalist id="route-picker-sections">
                {sections.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
          </div>
        </div>
        <div className="picker-actions">
          <button type="button" className="command-button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="command-button primary"
            disabled={!selectedEntry || !policy}
            onClick={() => onAdd(selectedEntry, policy, section)}
          >
            添加到路由
          </button>
        </div>
      </div>
    </div>
  );
}
