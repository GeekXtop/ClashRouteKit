import { Button } from "antd";
import { Pencil, Plus, RefreshCw } from "lucide-react";
import type { RuleProviderConfig } from "@clash-route-kit/core";
import { formatSyncedAt, type CatalogSourceInfo } from "../catalog.js";

export type LibrarySelection =
  | { kind: "repo"; name: string }
  | { kind: "list"; file: string }
  | { kind: "provider"; name: string };

function sameSelection(a: LibrarySelection | null, b: LibrarySelection): boolean {
  if (!a || a.kind !== b.kind) return false;
  if (a.kind === "list" && b.kind === "list") return a.file === b.file;
  if (a.kind === "repo" && b.kind === "repo") return a.name === b.name;
  if (a.kind === "provider" && b.kind === "provider") return a.name === b.name;
  return false;
}

export function LibrarySidebar(props: {
  repos: CatalogSourceInfo[];
  listFiles: string[];
  providers: RuleProviderConfig[];
  selection: LibrarySelection | null;
  syncingRepo: string | null;
  onSelect: (sel: LibrarySelection) => void;
  onSyncRepo: (name: string) => void;
  onSyncAll: () => void;
  onAddRepo: () => void;
  onEditRepo: (name: string) => void;
  onNewList: () => void;
  onNewProvider: () => void;
}) {
  const now = Date.now();
  return (
    <div>
      <div className="rk-lib-sec" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>上游仓库</span>
        <Button size="small" type="text" onClick={props.onSyncAll}>
          全部同步
        </Button>
      </div>
      {props.repos.map((repo) => (
        <div
          key={repo.id}
          className={`rk-lib-row ${sameSelection(props.selection, { kind: "repo", name: repo.id }) ? "on" : ""}`}
          onClick={() => props.onSelect({ kind: "repo", name: repo.id })}
        >
          <span className="rk-lib-name">{repo.label}</span>
          <span className="rk-lib-meta">{formatSyncedAt(repo.syncedAt, now) || "未同步"}</span>
          <button
            type="button"
            aria-label={`同步 ${repo.id}`}
            className="rk-iconbtn"
            onClick={(e) => {
              e.stopPropagation();
              props.onSyncRepo(repo.id);
            }}
          >
            <RefreshCw size={13} className={props.syncingRepo === repo.id ? "spin" : ""} />
          </button>
          <button
            type="button"
            aria-label={`编辑 ${repo.id}`}
            className="rk-iconbtn"
            onClick={(e) => {
              e.stopPropagation();
              props.onEditRepo(repo.id);
            }}
          >
            <Pencil size={12} />
          </button>
        </div>
      ))}
      <div className="rk-lib-row" onClick={props.onAddRepo}>
        <Plus size={13} /> <span className="rk-lib-name">添加上游仓库</span>
      </div>

      <div className="rk-lib-sec">本地 .list</div>
      {props.listFiles.map((file) => (
        <div
          key={file}
          className={`rk-lib-row ${sameSelection(props.selection, { kind: "list", file }) ? "on" : ""}`}
          onClick={() => props.onSelect({ kind: "list", file })}
        >
          <span className="rk-lib-name">{file}</span>
        </div>
      ))}
      <div className="rk-lib-row" onClick={props.onNewList}>
        <Plus size={13} /> <span className="rk-lib-name">新建 .list</span>
      </div>

      <div className="rk-lib-sec">规则源（自定义合并）</div>
      {props.providers.map((provider) => (
        <div
          key={provider.name}
          className={`rk-lib-row ${sameSelection(props.selection, { kind: "provider", name: provider.name }) ? "on" : ""}`}
          onClick={() => props.onSelect({ kind: "provider", name: provider.name })}
        >
          <span className="rk-lib-name">{provider.name}</span>
        </div>
      ))}
      <div className="rk-lib-row" onClick={props.onNewProvider}>
        <Plus size={13} /> <span className="rk-lib-name">新建规则源</span>
      </div>
    </div>
  );
}
