import { useEffect, useState } from "react";
import { Button, Empty, Input, Modal, Space } from "antd";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import type { useProjectDraftActions } from "../useProjectDraftActions.js";
import {
  addVendorRepoRequest,
  createRuleFileRequest,
  fetchCatalogSources,
  formatSyncedAt,
  removeVendorRepoRequest,
  syncCatalogVendor,
  updateVendorRepoRequest,
  type CatalogSourceInfo,
  type VendorRepoInput,
} from "../catalog.js";
import { listRuleFiles } from "../ruleFiles.js";
import { notifyError, notifySuccess } from "../notify.js";
import { LibrarySidebar, type LibrarySelection } from "./LibrarySidebar.js";
import { ListFileEditor } from "./ListFileEditor.js";
import { ProviderRecipeEditor } from "./ProviderRecipeEditor.js";
import { RepoModal } from "./RepoModal.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface RepoModalState {
  open: boolean;
  mode: "add" | "edit";
  initial?: { name: string; url: string; branch?: string; reldir?: string; kind?: NonNullable<VendorRepoInput["catalog"]>["kind"] };
}

export function LibraryPage({
  config,
  draftActions,
  onRefreshConfig,
  fetcher,
}: {
  config: RouteKitProjectConfig;
  draftActions: ReturnType<typeof useProjectDraftActions>;
  onRefreshConfig: () => void;
  fetcher?: Fetcher;
}) {
  const fetch = fetcher ?? globalThis.fetch;
  const [sources, setSources] = useState<CatalogSourceInfo[]>([]);
  const [listFiles, setListFiles] = useState<string[]>([]);
  const [selection, setSelection] = useState<LibrarySelection | null>(null);
  const [syncingRepo, setSyncingRepo] = useState<string | null>(null);
  const [repoModal, setRepoModal] = useState<RepoModalState>({ open: false, mode: "add" });
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    void fetchCatalogSources(fetch)
      .then((result) => alive && setSources(result.filter((s) => s.kind === "upstream")))
      .catch((error: unknown) => notifyError(error instanceof Error ? error.message : String(error)));
    void listRuleFiles(fetch)
      .then((files) => alive && setListFiles(files))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [fetch, refreshKey]);

  const providers = config.ruleProviders ?? [];

  async function syncRepo(name: string) {
    setSyncingRepo(name);
    try {
      await syncCatalogVendor(fetch, name);
      notifySuccess(`已同步 ${name}`);
      setRefreshKey((k) => k + 1);
    } catch (error: unknown) {
      notifyError(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncingRepo(null);
    }
  }

  function openEditRepo(name: string) {
    const repo = config.vendorRepos.find((r) => r.name === name);
    const reldir = repo?.catalog ? repo.catalog.dir.replace(`vendor/${name}/`, "") : "";
    setRepoModal({
      open: true,
      mode: "edit",
      initial: { name, url: repo?.url ?? "", branch: repo?.branch, reldir, kind: repo?.catalog?.kind },
    });
  }

  async function submitRepo(input: VendorRepoInput) {
    if (repoModal.mode === "edit" && repoModal.initial) {
      await updateVendorRepoRequest(repoModal.initial.name, input, fetch);
    } else {
      await addVendorRepoRequest(input, fetch);
    }
    notifySuccess("已保存上游仓库");
    setRefreshKey((k) => k + 1);
    onRefreshConfig();
  }

  async function removeRepo(name: string) {
    try {
      await removeVendorRepoRequest(name, fetch);
      notifySuccess(`已移除 ${name}`);
      setSelection(null);
      setRefreshKey((k) => k + 1);
      onRefreshConfig();
    } catch (error: unknown) {
      notifyError(error instanceof Error ? error.message : String(error));
    }
  }

  async function createList() {
    const name = newListName.trim().endsWith(".list") ? newListName.trim() : `${newListName.trim()}.list`;
    if (!newListName.trim()) return;
    try {
      await createRuleFileRequest(name, fetch);
      notifySuccess(`已新建 ${name}`);
      setNewListOpen(false);
      setNewListName("");
      setRefreshKey((k) => k + 1);
    } catch (error: unknown) {
      notifyError(error instanceof Error ? error.message : String(error));
    }
  }

  function renderDetail() {
    if (selection?.kind === "list") return <ListFileEditor file={selection.file} fetcher={fetch} />;
    if (selection?.kind === "provider") {
      const provider = providers.find((p) => p.name === selection.name);
      if (!provider) return <Empty description="规则源不存在" style={{ paddingTop: 60 }} />;
      return (
        <ProviderRecipeEditor
          provider={provider}
          onUpdate={(patch) => draftActions.updateProvider(provider.name, patch)}
          onSetSources={(s) => draftActions.setProviderSources(provider.name, s)}
          onSetListField={(field, values) => draftActions.setProviderListField(provider.name, field, values)}
          onDelete={() => {
            draftActions.deleteProvider(provider.name);
            setSelection(null);
          }}
        />
      );
    }
    if (selection?.kind === "repo") {
      const repo = config.vendorRepos.find((r) => r.name === selection.name);
      const source = sources.find((s) => s.id === selection.name);
      return (
        <div style={{ padding: 16 }}>
          <h3>{selection.name}</h3>
          <p className="rk-lib-meta">{repo?.url}</p>
          <p className="rk-lib-meta">
            {source?.count ?? 0} 条 · {formatSyncedAt(source?.syncedAt ?? null, Date.now()) || "未同步"}
            {repo?.branch ? ` · 钉 ${repo.branch}` : ""}
          </p>
          <Space>
            <Button onClick={() => void syncRepo(selection.name)} loading={syncingRepo === selection.name}>
              同步
            </Button>
            <Button onClick={() => openEditRepo(selection.name)}>编辑</Button>
            <Button danger onClick={() => void removeRepo(selection.name)}>
              移除
            </Button>
          </Space>
        </div>
      );
    }
    return <Empty description="选择左侧的仓库 / 本地 .list / 规则源" style={{ paddingTop: 80 }} />;
  }

  return (
    <div className="rk-library">
      <div className="rk-pane">
        <LibrarySidebar
          repos={sources}
          listFiles={listFiles}
          providers={providers}
          selection={selection}
          syncingRepo={syncingRepo}
          onSelect={setSelection}
          onSyncRepo={(name) => void syncRepo(name)}
          onSyncAll={() => void syncCatalogVendor(fetch).then(() => setRefreshKey((k) => k + 1)).catch(() => {})}
          onAddRepo={() => setRepoModal({ open: true, mode: "add" })}
          onEditRepo={openEditRepo}
          onNewList={() => setNewListOpen(true)}
          onNewProvider={() => draftActions.createProvider()}
        />
      </div>
      <div className="rk-pane">{renderDetail()}</div>

      <RepoModal
        open={repoModal.open}
        mode={repoModal.mode}
        initial={repoModal.initial}
        onSubmit={submitRepo}
        onClose={() => setRepoModal((s) => ({ ...s, open: false }))}
      />
      <Modal open={newListOpen} title="新建 .list" onCancel={() => setNewListOpen(false)} onOk={() => void createList()} okText="新建" cancelText="取消">
        <Input
          aria-label="文件名"
          placeholder="如 Custom_Direct.list"
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
        />
      </Modal>
    </div>
  );
}
