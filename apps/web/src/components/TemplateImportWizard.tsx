import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { parseIniToConfig, type ImportedConfig } from "@clash-route-kit/core";
import { fetchCatalogEntries, fetchCatalogSources } from "../catalog.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type SourceTab = "source" | "paste";

export function TemplateImportWizard({
  fetcher = globalThis.fetch,
  onApply,
  onClose,
}: {
  fetcher?: Fetcher;
  onApply: (imported: ImportedConfig) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SourceTab>("paste");
  const [templateSources, setTemplateSources] = useState<{ id: string; label: string }[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [entries, setEntries] = useState<string[]>([]);
  const [entryName, setEntryName] = useState("");
  const [text, setText] = useState("");
  const [imported, setImported] = useState<ImportedConfig | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void fetchCatalogSources(fetcher)
      .then((sources) => {
        if (!alive) return;
        const templates = sources
          .filter((source) => source.originKind === "ini-template")
          .map((source) => ({ id: source.id, label: source.label }));
        setTemplateSources(templates);
        if (templates.length > 0) {
          setSourceId(templates[0]!.id);
          setTab("source");
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [fetcher]);

  useEffect(() => {
    if (!sourceId) return;
    let alive = true;
    void fetchCatalogEntries(sourceId, fetcher)
      .then((result) => {
        if (alive) setEntries(result);
      })
      .catch(() => {
        if (alive) setEntries([]);
      });
    return () => {
      alive = false;
    };
  }, [sourceId, fetcher]);

  async function loadTemplateEntry(name: string) {
    setEntryName(name);
    setImported(null);
    setError("");
    try {
      const response = await fetcher(
        `/api/catalog/template?origin=${encodeURIComponent(sourceId)}&name=${encodeURIComponent(name)}`,
      );
      const payload = (await response.json()) as { ini?: string; output?: string };
      if (!response.ok || typeof payload.ini !== "string") {
        throw new Error(payload.output ?? "读取模板失败");
      }
      setText(payload.ini);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function parsePreview() {
    setError("");
    try {
      setImported(parseIniToConfig(text));
    } catch (caught: unknown) {
      setImported(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <div className="picker-overlay" role="dialog" aria-label="导入模板">
      <div className="picker-panel panel">
        <div className="panel-heading">
          <div>
            <h2>导入模板（覆盖整份配置）</h2>
            <span>解析 INI → 预览 → 覆盖现有策略组与路由</span>
          </div>
          <button className="icon-button" type="button" aria-label="关闭" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="seg" style={{ margin: "12px 0" }}>
          <button type="button" className={`seg-item ${tab === "source" ? "seg-on" : ""}`} onClick={() => setTab("source")}>
            数据源模板
          </button>
          <button type="button" className={`seg-item ${tab === "paste" ? "seg-on" : ""}`} onClick={() => setTab("paste")}>
            粘贴 / 上传
          </button>
        </div>

        {tab === "source" ? (
          <div className="wizard-source">
            {templateSources.length === 0 ? (
              <p className="section-hint">
                暂无模板源。可在「规则目录 → 上游 → ＋ 添加上游仓库」用 <code>ini-template</code> 类型添加，或切到「粘贴 / 上传」。
              </p>
            ) : (
              <>
                <label>
                  <span>模板源</span>
                  <select aria-label="模板源" value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
                    {templateSources.map((source) => (
                      <option key={source.id} value={source.id}>{source.label}</option>
                    ))}
                  </select>
                </label>
                <div className="picker-entries">
                  {entries.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className={`catalog-entry ${name === entryName ? "active" : ""}`}
                      onClick={() => void loadTemplateEntry(name)}
                    >
                      <span className="bdg b-dler">INI</span>
                      <span className="en-nm">{name}</span>
                    </button>
                  ))}
                  {entries.length === 0 ? <div className="empty-state">该源无 .ini 模板</div> : null}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="wizard-source">
            <input
              type="file"
              aria-label="上传 INI 文件"
              accept=".ini,.txt,.conf"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void file.text().then(setText);
              }}
            />
            <textarea
              aria-label="INI 文本"
              className="rule-file-editor"
              placeholder="粘贴 SubConverter [custom] INI 文本…"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
        )}

        <div className="wizard-preview">
          <button type="button" className="command-button" disabled={!text.trim()} onClick={parsePreview}>
            解析预览
          </button>
          {imported ? (
            <p className="section-hint">
              将创建 <b>{imported.customProxyGroups.length}</b> 个策略组 · <b>{imported.ruleSets.length}</b> 条规则
              {imported.warnings.length ? ` · ${imported.warnings.length} 条警告` : ""}
            </p>
          ) : null}
          {error ? <p className="project-message error">{error}</p> : null}
        </div>

        <div className="picker-actions">
          <button type="button" className="command-button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="command-button danger"
            disabled={!imported}
            onClick={() => imported && onApply(imported)}
          >
            覆盖整份配置
          </button>
        </div>
      </div>
    </div>
  );
}
