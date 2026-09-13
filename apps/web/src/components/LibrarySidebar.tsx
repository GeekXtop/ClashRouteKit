import { useEffect, useState, type ReactNode } from "react";
import { Collapse } from "antd";
import { Pencil, Plus, RefreshCw, Settings } from "lucide-react";
import type { RuleProviderConfig } from "@clash-route-kit/core";
import { attrSelector, locateElement } from "../domLocate.js";
import { formatSyncedAt, type CatalogSourceInfo } from "../catalog.js";
import { providerHasUsableSource, providerOutputIsMrs } from "../libraryHealth.js";

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

function IconAction({ label, title, onClick, children }: { label: string; title?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      className="rk-iconbtn"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

export function LibrarySidebar(props: {
  repos: CatalogSourceInfo[];
  listFiles: string[];
  providers: RuleProviderConfig[];
  selection: LibrarySelection | null;
  syncingRepo: string | null;
  /** 汇总条定位目标：展开“规则源”分组并聚焦对应行。 */
  locateProvider?: { name: string; nonce: number } | null;
  onSelect: (sel: LibrarySelection) => void;
  onSyncRepo: (name: string) => void;
  onSyncAll: () => void;
  onEditRepo: (name: string) => void;
  onNewList: () => void;
  onNewProvider: () => void;
  onOpenRuleDefaults: () => void;
}) {
  const now = Date.now();
  const [activeKeys, setActiveKeys] = useState<string[]>(["repos", "local", "providers"]);

  useEffect(() => {
    const target = props.locateProvider;
    if (!target) return;
    setActiveKeys((keys) => (keys.includes("providers") ? keys : [...keys, "providers"]));
    const timer = setTimeout(() => {
      locateElement(attrSelector("data-testid", `provider-row-${target.name}`));
    }, 80);
    return () => clearTimeout(timer);
  }, [props.locateProvider]);

  const repoRows = props.repos.map((repo) => (
    <div
      key={repo.id}
      className={`rk-lib-row ${sameSelection(props.selection, { kind: "repo", name: repo.id }) ? "on" : ""}`}
      onClick={() => props.onSelect({ kind: "repo", name: repo.id })}
    >
      <span className="rk-lib-name">{repo.label}</span>
      <IconAction
        label={`同步 ${repo.id}`}
        title={formatSyncedAt(repo.syncedAt, now) || "未同步"}
        onClick={() => props.onSyncRepo(repo.id)}
      >
        <RefreshCw size={13} className={props.syncingRepo === repo.id ? "spin" : ""} />
      </IconAction>
      <IconAction label={`编辑 ${repo.id}`} onClick={() => props.onEditRepo(repo.id)}>
        <Pencil size={12} />
      </IconAction>
    </div>
  ));

  const listRows = props.listFiles.map((file) => (
    <div
      key={file}
      className={`rk-lib-row ${sameSelection(props.selection, { kind: "list", file }) ? "on" : ""}`}
      onClick={() => props.onSelect({ kind: "list", file })}
    >
      <span className="rk-lib-name">{file}</span>
    </div>
  ));

  const providerRows = props.providers.map((provider) => (
    <div
      key={provider.name}
      data-testid={`provider-row-${provider.name}`}
      tabIndex={-1}
      className={`rk-lib-row ${sameSelection(props.selection, { kind: "provider", name: provider.name }) ? "on" : ""} ${props.locateProvider?.name === provider.name ? "hit" : ""}`}
      onClick={() => props.onSelect({ kind: "provider", name: provider.name })}
    >
      <span className="rk-lib-name">{provider.name}</span>
      {providerOutputIsMrs(provider) ? (
        <span className="rk-tag error">导入问题</span>
      ) : !providerHasUsableSource(provider) ? (
        <span className="rk-tag warn">待补全</span>
      ) : null}
    </div>
  ));

  return (
    <Collapse
      activeKey={activeKeys}
      onChange={(keys) => setActiveKeys(Array.isArray(keys) ? keys : [keys])}
      ghost
      items={[
        {
          key: "repos",
          label: "上游仓库",
          extra: (
            <IconAction label="全部同步" onClick={props.onSyncAll}>
              <RefreshCw size={13} />
            </IconAction>
          ),
          children: repoRows,
        },
        {
          key: "local",
          label: "本地 .list",
          extra: (
            <IconAction label="新建 .list" onClick={props.onNewList}>
              <Plus size={14} />
            </IconAction>
          ),
          children: listRows,
        },
        {
          key: "providers",
          label: "规则源",
          extra: (
            <>
              <IconAction label="规则默认值" onClick={props.onOpenRuleDefaults}>
                <Settings size={14} />
              </IconAction>
              <IconAction label="新建规则源" onClick={props.onNewProvider}>
                <Plus size={14} />
              </IconAction>
            </>
          ),
          children: providerRows,
        },
      ]}
    />
  );
}
