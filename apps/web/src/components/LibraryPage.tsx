import { useEffect, useMemo, useRef, useState } from "react";
import { Empty, Input, Modal } from "antd";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { validateLegacyProjectConfig } from "@clash-route-kit/core";
import type { useProjectDraftActions } from "../useProjectDraftActions.js";
import type { useV2DraftActions } from "../v2/useV2DraftActions.js";
import type { V2ProjectState } from "../v2/v2Project.js";
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
import { findStaleProviderSources, providerHasUsableSource } from "../libraryHealth.js";
import { notifyError, notifySuccess } from "../notify.js";
import { CatalogBrowser } from "./CatalogBrowser.js";
import { LibraryHealthBar, type LibraryHealthItem } from "./LibraryHealthBar.js";
import { LibrarySidebar, type LibrarySelection } from "./LibrarySidebar.js";
import { ListFileEditor } from "./ListFileEditor.js";
import { ProviderRecipeEditor } from "./ProviderRecipeEditor.js";
import {
  ProjectDefaultsDrawer,
  type ProjectDefaultsSection,
} from "./ProjectDefaultsDrawer.js";
import { RepoModal } from "./RepoModal.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Schema v2 编辑会话：v2 状态 + 稳定 ID 动作。存在时页面走 v2 通路。 */
export interface LibraryV2Session {
  state: V2ProjectState;
  actions: ReturnType<typeof useV2DraftActions>;
}

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

const PROVIDER_PATH = /^ruleProviders\[(\d+)\]/;

export function LibraryPage({
  config,
  draftActions,
  v2,
  onRefreshConfig,
  fetcher,
}: {
  config: RouteKitProjectConfig;
  draftActions: ReturnType<typeof useProjectDraftActions>;
  /** Schema v2 编辑会话：存在时 provider mutation 走稳定 ID 通路。 */
  v2?: LibraryV2Session;
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
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [defaultsSection, setDefaultsSection] = useState<ProjectDefaultsSection | null>(null);
  const [sidebarLocate, setSidebarLocate] = useState<{ name: string; nonce: number } | null>(null);
  const locateNonce = useRef(0);

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

  const v2State = v2?.state;
  const providers = v2State ? v2State.config.ruleProviders : (config.ruleProviders ?? []);

  // 页顶汇总卡三类数据源：
  // - 待补全来源：sources 为空或缺路径的 provider（纯配置可算）；
  // - 失效来源：Web 拿不到文件系统，用可计算的最接近语义（本地 .list 缺失 / vendor 仓库未声明）；
  // - 阻断生成：校验诊断中 ruleProviders[]/defaults 桶的 error 诊断
  //   （v1 为 validateLegacyProjectConfig，v2 为 analyzeV2Config 的结构化诊断）。
  const diagnostics = useMemo(
    () => (v2State ? v2State.diagnostics : validateLegacyProjectConfig(config)),
    [v2State, config],
  );
  const pendingItems = useMemo<LibraryHealthItem[]>(
    () =>
      providers
        .filter((provider) => !providerHasUsableSource(provider))
        .map((provider) => ({
          id: `pending:${provider.name}`,
          title: provider.name,
          detail: "尚无可用数据来源",
          providerName: provider.name,
        })),
    [config],
  );
  const staleItems = useMemo<LibraryHealthItem[]>(() => {
    const byProvider = new Map<string, string[]>();
    for (const stale of findStaleProviderSources(config, listFiles)) {
      const paths = byProvider.get(stale.providerName) ?? [];
      paths.push(
        stale.reason === "local-file-missing"
          ? `${stale.path}（本地文件缺失）`
          : `${stale.path}（所属仓库未声明）`,
      );
      byProvider.set(stale.providerName, paths);
    }
    return [...byProvider.entries()].map(([name, paths]) => ({
      id: `stale:${name}`,
      title: name,
      detail: paths.join("；"),
      providerName: name,
    }));
  }, [config, listFiles]);
  const blockingItems = useMemo<LibraryHealthItem[]>(() => {
    const items: LibraryHealthItem[] = [];
    for (const diagnostic of diagnostics) {
      if (diagnostic.severity !== "error") continue;
      const path = diagnostic.path ?? "";
      const providerMatch = PROVIDER_PATH.exec(path);
      if (providerMatch) {
        const provider = providers[Number(providerMatch[1])];
        items.push({
          id: `blocking:${items.length}:${diagnostic.code}:${path}`,
          title: provider?.name ?? path,
          detail: `[${diagnostic.code}] ${diagnostic.message}`,
          providerName: provider?.name,
        });
        continue;
      }
      if (path.startsWith("defaults.")) {
        items.push({
          id: `blocking:${items.length}:${diagnostic.code}:${path}`,
          title: "规则默认值",
          detail: `[${diagnostic.code}] ${diagnostic.message}`,
          defaultsSection: path.includes("ruleSets") ? "rule-sets" : "proxy-groups",
        });
      }
    }
    return items;
  }, [diagnostics, providers]);

  function handleHealthLocate(item: LibraryHealthItem) {
    if (item.providerName) {
      locateNonce.current += 1;
      setSidebarLocate({ name: item.providerName, nonce: locateNonce.current });
      return;
    }
    if (item.defaultsSection) setDefaultsSection(item.defaultsSection);
  }

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
      if (v2State && v2) {
        const v2Provider = v2State.config.ruleProviders.find((p) => p.name === selection.name);
        if (!v2Provider) return <Empty description="规则源不存在" style={{ paddingTop: 60 }} />;
        return (
          <ProviderRecipeEditor
            provider={v2Provider}
            onUpdate={(patch) => v2.actions.updateProvider(v2Provider.id, patch)}
            onDelete={() => {
              v2.actions.deleteProvider(v2Provider.id);
              setSelection(null);
            }}
            fetcher={fetch}
          />
        );
      }
      const provider = providers.find((p) => p.name === selection.name);
      if (!provider) return <Empty description="规则源不存在" style={{ paddingTop: 60 }} />;
      return (
        <ProviderRecipeEditor
          provider={provider}
          onUpdate={(patch) => draftActions.updateProvider(provider.name, patch)}
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
    <div className="rk-page-col" style={{ height: "100%" }}>
      <div className="rk-library-top">
        <LibraryHealthBar
          pending={pendingItems}
          stale={staleItems}
          blocking={blockingItems}
          onLocate={handleHealthLocate}
        />
      </div>
      <div className="rk-library" style={{ flex: 1, minHeight: 0 }}>
        <div className="rk-pane">
          <LibrarySidebar
            repos={sources}
            listFiles={listFiles}
            providers={providers}
            selection={selection}
            syncingRepo={syncingRepo}
            locateProvider={sidebarLocate}
            onSelect={setSelection}
            onSyncRepo={(name) => void syncRepo(name)}
            onSyncAll={() => void syncCatalogVendor(fetch).then(() => setRefreshKey((k) => k + 1)).catch(() => {})}
            onEditRepo={openEditRepo}
            onAddRepo={() => setRepoModal({ open: true, mode: "add" })}
            onRemoveRepo={(name) => setRemoveTarget(name)}
            onNewList={() => setNewListOpen(true)}
            onNewProvider={() => (v2?.actions ?? draftActions).createProvider()}
            onOpenRuleDefaults={() => setDefaultsSection("rule-sets")}
          />
        </div>
        <div className="rk-pane">{renderDetail()}</div>
      </div>

      <RepoModal
        open={repoModal.open}
        mode={repoModal.mode}
        initial={repoModal.initial}
        onSubmit={submitRepo}
        onClose={() => setRepoModal((s) => ({ ...s, open: false }))}
        onRemove={repoModal.initial ? () => void removeRepo(repoModal.initial!.name) : undefined}
      />
      <Modal
        open={removeTarget !== null}
        title={`移除上游仓库 ${removeTarget ?? ""}？`}
        onCancel={() => setRemoveTarget(null)}
        onOk={() => {
          const name = removeTarget;
          setRemoveTarget(null);
          if (name) void removeRepo(name);
        }}
        okText="移除"
        okButtonProps={{ danger: true }}
        cancelText="取消"
      >
        <p>移除后该仓库的目录浏览与规则源将不再可用（vendor/ 内已同步的文件保留在本地）。</p>
        <p>仓库列表清空后，目录浏览会回退到内置默认源；可随时重新添加。</p>
      </Modal>
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
          defaults={v2State ? v2State.config.project?.defaults : config.defaults}
          onSave={(defaults) => {
            (v2?.actions ?? draftActions).setProjectDefaults(defaults);
            setDefaultsSection(null);
          }}
          onCancel={() => setDefaultsSection(null)}
        />
      ) : null}
    </div>
  );
}
