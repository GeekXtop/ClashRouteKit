import { useEffect, useState } from "react";
import { Empty, Input, Modal } from "antd";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import type { useProjectDraftActions } from "../useProjectDraftActions.js";
import {
  addVendorRepoRequest,
  createRuleFileRequest,
  fetchCatalogSources,
  removeVendorRepoRequest,
  syncCatalogVendor,
  updateVendorRepoRequest,
  type CatalogSourceInfo,
  type VendorRepoInput,
} from "../catalog.js";
import { listRuleFiles } from "../ruleFiles.js";
import { notifyError, notifySuccess } from "../notify.js";
import { CatalogBrowser } from "./CatalogBrowser.js";
import { LibrarySidebar, type LibrarySelection } from "./LibrarySidebar.js";
import { ListFileEditor } from "./ListFileEditor.js";
import { ProviderRecipeEditor } from "./ProviderRecipeEditor.js";
import {
  ProjectDefaultsDrawer,
  type ProjectDefaultsSection,
} from "./ProjectDefaultsDrawer.js";
import { RepoModal } from "./RepoModal.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface RepoModalState {
  open: boolean;
  mode: "add" | "edit";
  initial?: {
    name: string;
    url: string;
    branch?: string;
    folder?: string;
    reldir?: string;
    kind?: NonNullable<VendorRepoInput["catalog"]>["kind"];
    templateReldir?: string;
  };
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
  const [defaultsSection, setDefaultsSection] = useState<ProjectDefaultsSection | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchCatalogSources(fetch)
      .then((result) => alive && setSources(result.filter((s) => s.kind === "upstream" && s.originKind !== "ini-template")))
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
    // Strip the actual clone path (vendor/<folder>/) — folder can differ from name.
    const folder = repo ? repo.path.replace(/^vendor\//, "") : "";
    const base = repo ? `${repo.path}/` : "";
    const reldir = repo?.catalog ? repo.catalog.dir.replace(base, "") : "";
    const templateReldir = repo?.templateDir ? repo.templateDir.replace(base, "") : "";
    setRepoModal({
      open: true,
      mode: "edit",
      initial: { name, url: repo?.url ?? "", branch: repo?.branch, folder, reldir, kind: repo?.catalog?.kind, templateReldir },
    });
  }

  async function submitRepo(input: VendorRepoInput) {
    if (repoModal.mode === "edit" && repoModal.initial) {
      const { resync } = await updateVendorRepoRequest(repoModal.initial.name, input, fetch);
      notifySuccess("已保存上游仓库");
      setRefreshKey((k) => k + 1);
      onRefreshConfig();
      // Source/folder changed → old dir was cleared server-side; re-clone into the new folder.
      if (resync) void syncRepo(input.name);
    } else {
      await addVendorRepoRequest(input, fetch);
      notifySuccess("已保存上游仓库");
      setRefreshKey((k) => k + 1);
      onRefreshConfig();
    }
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
    if (selection?.kind === "list")
      return (
        <ListFileEditor
          file={selection.file}
          fetcher={fetch}
          onDeleted={(file) => {
            setListFiles((files) => files.filter((item) => item !== file));
            setSelection(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      );
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
          fetcher={fetch}
        />
      );
    }
    if (selection?.kind === "repo") {
      const source = sources.find((s) => s.id === selection.name);
      return <CatalogBrowser origin={selection.name} originKind={source?.originKind} fetcher={fetch} />;
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
          onOpenRuleDefaults={() => setDefaultsSection("rule-sets")}
        />
      </div>
      <div className="rk-pane">{renderDetail()}</div>

      <RepoModal
        open={repoModal.open}
        mode={repoModal.mode}
        initial={repoModal.initial}
        onSubmit={submitRepo}
        onClose={() => setRepoModal((s) => ({ ...s, open: false }))}
        onRemove={repoModal.initial ? () => void removeRepo(repoModal.initial!.name) : undefined}
      />
      <Modal open={newListOpen} title="新建 .list" onCancel={() => setNewListOpen(false)} onOk={() => void createList()} okText="新建" cancelText="取消">
        <Input
          aria-label="文件名"
          placeholder="如 Custom_Direct.list"
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
        />
      </Modal>
      {defaultsSection ? (
        <ProjectDefaultsDrawer
          open
          initialSection={defaultsSection}
          defaults={config.defaults}
          onSave={(defaults) => {
            draftActions.setProjectDefaults(defaults);
            setDefaultsSection(null);
          }}
          onCancel={() => setDefaultsSection(null)}
        />
      ) : null}
    </div>
  );
}
