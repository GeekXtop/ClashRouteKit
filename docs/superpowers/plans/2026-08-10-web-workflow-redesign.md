# Web Console Workflow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Web 控制台重构为 `项目 / 规则库 / 路由 / 输出` 四个工作域，让导入与迁移回到项目入口，规则库优先解决可执行性，路由只编排规则且策略组抽屉成为唯一详情入口。

**Architecture:** `App` 只负责启动、一级导航和项目控制器；项目快照从 Local Server API 读取，missing/invalid/v1/v2 使用判别状态，业务编辑全部基于 Schema v2 与 Core stable-ID mutation。每个 feature 自带页面、局部状态、API 适配和测试；现有输出能力在本阶段通过 `OutputPage` 保持可用，完整双标签闭环由下一份计划完成。

**Tech Stack:** React 19、TypeScript 5.8、Vite 7、Ant Design 5、Lucide、Testing Library、Vitest 3.2、pnpm 9.1.4；遵循 React 派生状态、函数式 setState、独立请求并行、长列表延迟渲染和 `Map`/`Set` 查找实践。

## Global Constraints

- 一级导航文案和顺序固定为 `项目 / 规则库 / 路由 / 输出`。
- 导入不得继续出现在全局右上角；项目空状态的首要动作是“导入现有模板”，次动作是“创建空白项目”。
- 项目启动只依赖 `/api/project/snapshot`；不得使用构建期内联 YAML 或过期打包快照兜底。
- v1 项目只显示迁移复核入口，不在 `useEffect` 或加载回调中自动写成 v2。
- 导入与迁移必须先显示新增、覆盖、冲突、不支持项、本地设置候选和语义摘要，再显式应用。
- 替换/合并失败时保留当前项目、原始输入、选择模式和复核结果，不产生部分写入。
- Web 所有实体 mutation 使用 Core stable ID 接口；组件不得直接拼装跨实体引用更新。
- 策略组显示名称可以修改，但路由、成员和引用仍保存 group ID。
- 规则库顶部先显示“待补全来源 / 失效来源 / 阻断生成”，上游仓库设置放在次级抽屉。
- 空 provider 必须是禁用草稿；完成来源并显式启用后才进入规范化模型。
- 路由页不渲染常驻完整 INI；仅保留“查看生成结果”次级入口，其内容按需加载。
- 点击策略组直接打开编辑抽屉；删除只读策略组详情面板。
- 策略组抽屉维护基本信息、memberSet、成员、节点筛选、健康检查和引用摘要；不得另列一份“下游策略组 / 内置策略”。
- “被 N 条路由使用”只显示计数与“筛选路由”动作，不复制命中规则列表。
- 路由主列表是命中规则的唯一完整列表，支持顺序、分段、启停、编辑和目标筛选。
- 抽屉继续显式保存；关闭/取消不修改项目草稿。
- 项目草稿只有 Core error 为 0 时可写盘；warning 保留并就近展示。
- 不把订阅 URL/Token 或其它输出页会话数据放入项目控制器。
- 独立 API 请求应并行或按需触发，不制造加载瀑布；不在 effect 中保存可从当前 state/props 推导的状态。
- 基于旧 state 更新时使用函数式 setState；大列表搜索使用 `useDeferredValue`；重复查找先构建 `Map`/`Set`。
- 长路由/provider 列表行使用 `content-visibility: auto` 与合理 `contain-intrinsic-size`。
- 桌面 1200px 只有一个主任务滚动区；移动 360px 抽屉接近全屏，路由行垂直布局且主操作无需横向滚动。
- 状态必须同时有文本或图标，不只依赖颜色；打开抽屉、切换标签和定位错误后移动键盘焦点。
- 不迁移组件库或视觉主题；继续使用现有 Ant Design 5 和样式体系。
- 文件移动/删除只发生在对应新 feature 测试通过后；不得在同一提交里夹带输出/GitHub 完整重做。
- 修改使用 `apply_patch`，保留用户现有未提交配置与 `.agents` 文件。

---

## File Structure

### Shared app/controller/API

- Create: `apps/web/src/shared/api/projectApi.ts` — snapshot/save/migrate client and response guards。
- Create: `apps/web/src/shared/model/projectController.ts` — four-view selection, snapshot/draft/revision/diagnostics state。
- Create: `apps/web/src/shared/components/AppShell.tsx` — four-item navigation and save/status chrome only。
- Create: `apps/web/src/shared/components/DiagnosticSummary.tsx` — reusable global/inline diagnostic rendering。
- Create: `apps/web/src/shared/hooks/useFocusOnOpen.ts` — accessible focus transfer。
- Modify: `apps/web/src/App.tsx` — boot and page routing only。
- Delete: `apps/web/src/config.ts` — remove bundled repository YAML。
- Delete: old `apps/web/src/projectController.ts` after consumers migrate。
- Move/update tests: `apps/web/tests/projectApi.test.ts`, `projectController.test.ts`, `appShell.test.tsx`。

### Project feature

- Create: `apps/web/src/features/project/ProjectPage.tsx`。
- Create: `apps/web/src/features/project/ProjectEmptyState.tsx`。
- Create: `apps/web/src/features/project/ProjectOverview.tsx`。
- Create: `apps/web/src/features/project/MigrationReviewDrawer.tsx`。
- Create: `apps/web/src/features/project/ImportFlowDialog.tsx`。
- Create: `apps/web/src/features/project/projectStatus.ts` — four-domain status derivation only。
- Create: `apps/web/tests/projectPage.test.tsx`。
- Create: `apps/web/tests/migrationReviewDrawer.test.tsx`。
- Create: `apps/web/tests/importFlow.test.tsx`。
- Delete: old `apps/web/src/components/ImportModal.tsx` and test after replacement passes。

### Library feature

- Create/move: `apps/web/src/features/library/LibraryPage.tsx`。
- Create: `apps/web/src/features/library/LibraryIssuesPanel.tsx`。
- Create: `apps/web/src/features/library/ProviderList.tsx`。
- Create: `apps/web/src/features/library/ProviderDrawer.tsx`。
- Create: `apps/web/src/features/library/RepositorySettingsDrawer.tsx`。
- Create: `apps/web/src/features/library/libraryModel.ts`。
- Move/adapt reusable catalog/rule file components under the feature。
- Update: `apps/web/tests/libraryPage.test.tsx`, `providerRecipeEditor.test.tsx`, catalog/rule-file tests。

### Routing feature

- Create/move: `apps/web/src/features/routing/RoutingPage.tsx`。
- Create: `apps/web/src/features/routing/ProxyGroupList.tsx`。
- Create: `apps/web/src/features/routing/RouteToolbar.tsx`。
- Create: `apps/web/src/features/routing/RouteList.tsx`。
- Create: `apps/web/src/features/routing/ProxyGroupDrawer.tsx`。
- Create: `apps/web/src/features/routing/RouteDrawer.tsx`。
- Create: `apps/web/src/features/routing/routingModel.ts`。
- Delete: `apps/web/src/components/GroupContextPanel.tsx`。
- Delete: `apps/web/src/components/PreviewDock.tsx`。
- Delete/move superseded `GroupNav`, `GroupDrawer`, `RuleStream`, `RuleRow`, `RoutingPage` files after new tests pass。
- Update/create: `apps/web/tests/routingPage.test.tsx`, `proxyGroupDrawer.test.tsx`, `routeList.test.tsx`。

### Output compatibility and styles

- Create: `apps/web/src/features/output/OutputPage.tsx` — correct route/title wrapping current output functionality。
- Move current publish components only when required for imports; their internal redesign belongs to the output plan。
- Modify: `apps/web/src/styles.css` — single-scroll layouts, responsive drawers/rows, content visibility and focus states。
- Create: `apps/web/tests/outputNavigation.test.tsx`。

---

### Task 1: Replace bundled config boot with a discriminated project snapshot controller

**Files:**

- Create: `apps/web/src/shared/api/projectApi.ts`
- Create: `apps/web/src/shared/model/projectController.ts`
- Create: `apps/web/tests/projectFixtures.ts`
- Create: `apps/web/tests/projectApi.test.ts`
- Rewrite: `apps/web/tests/projectController.test.ts`
- Modify: `apps/web/src/App.tsx`
- Delete after GREEN: `apps/web/src/config.ts`

**Interfaces:**

- Consumes: Local Server `ProjectSnapshot`, `SaveProjectInput`, `ApplyMigrationInput`; Core `AuthorProjectConfig`, `Diagnostic`.
- Produces: `loadProjectSnapshot`, `saveProjectConfig`, `applyProjectMigration`.
- Produces: `ProjectView = "project" | "library" | "routing" | "output"`.
- Produces: `ProjectControllerState` with snapshot, optional v2 draft, revision, dirty, selected view, last task view and save state.
- Produces: `createProjectController`, `replaceSnapshot`, `applyAuthorMutation`, `selectProjectView`, `canPersistDraft`.

- [ ] **Step 0: Create shared project fixtures used by Tasks 1–6**

Create `apps/web/tests/projectFixtures.ts`:

```ts
import type {
  AuthorProjectConfig,
  RouteKitProjectConfig,
} from "@clash-route-kit/core";
import type { ProjectSnapshot } from "@clash-route-kit/local-server";

export const testAuthorConfig: AuthorProjectConfig = {
  schemaVersion: 2,
  project: { template: { output: "Custom_Clash.ini" } },
  memberSets: {
    "standard-proxy": { members: [{ group: "auto" }, { builtin: "DIRECT" }] },
  },
  proxyGroups: [
    { id: "auto", name: "♻️ 自动选择", type: "url-test", members: [], nodeFilters: [{ match: ".*" }] },
    { id: "chat", name: "💬 即时通讯", type: "select", members: [{ preset: "standard-proxy" }] },
    { id: "direct", name: "🎯 全球直连", type: "select", members: [{ builtin: "DIRECT" }] },
  ],
  routes: [
    { id: "telegram", policy: { group: "chat" }, source: { type: "geosite", value: "telegram" } },
    { id: "github", policy: { group: "chat" }, source: { type: "geosite", value: "github" } },
    { id: "direct", policy: { group: "direct" }, source: { type: "geosite", value: "cn" } },
    { id: "final", policy: { group: "chat" }, source: { type: "final" } },
  ],
  ruleProviders: [
    {
      id: "draft",
      name: "Draft",
      output: "Draft.yaml",
      behavior: "domain",
      enabled: false,
      sources: [],
    },
  ],
  vendorRepos: [],
};

const validLegacyConfig: RouteKitProjectConfig = {
  publishBaseUrl: "http://127.0.0.1:8787",
  subconverterUrl: "http://127.0.0.1:25500/sub",
  template: { output: "Custom_Clash.ini" },
  vendorRepos: [],
  customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
  ruleSets: [{ id: "final", policy: "Proxy", source: { type: "final" } }],
  ruleProviders: [],
};

const invalidLegacyConfig: RouteKitProjectConfig = {
  ...structuredClone(validLegacyConfig),
  customProxyGroups: [{
    name: "Proxy",
    type: "select",
    options: ["DIRECT"],
    nodeFilters: ["https://probe.example/204"],
  }],
  ruleSets: [
    { id: "legacy", policy: "Proxy", source: { type: "rule-provider", behavior: "domain", file: "Legacy.mrs" } },
    { id: "final", policy: "Proxy", source: { type: "final" } },
  ],
  ruleProviders: [{ name: "Legacy", output: "Legacy.mrs", behavior: "domain", sources: [] }],
};

export const readySnapshot: ProjectSnapshot = {
  state: "ready",
  revision: "revision-v2",
  yaml: "schemaVersion: 2\n",
  config: testAuthorConfig,
  diagnostics: [],
};

export const readySnapshotWithWarnings: ProjectSnapshot = {
  ...readySnapshot,
  diagnostics: [{
    code: "provider.sources.disabled-empty",
    severity: "warning",
    path: "ruleProviders[0].sources",
    message: "禁用草稿待补全",
  }],
};

export const validLegacySnapshot: ProjectSnapshot = {
  state: "legacy",
  revision: "revision-v1-valid",
  yaml: "publishBaseUrl: http://127.0.0.1:8787\n",
  config: validLegacyConfig,
  diagnostics: [],
};

export const invalidLegacySnapshot: ProjectSnapshot = {
  state: "legacy",
  revision: "revision-v1-invalid",
  yaml: "publishBaseUrl: http://127.0.0.1:8787\n",
  config: invalidLegacyConfig,
  diagnostics: [],
};

export const validIni = `[custom]
custom_proxy_group=AI\`select\`[]DIRECT\`.*
ruleset=AI,[]GEOSITE,openai
ruleset=Proxy,[]FINAL
`;
```

- [ ] **Step 1: Write strict project API response tests**

Create `apps/web/tests/projectApi.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  applyProjectMigration,
  loadProjectSnapshot,
  saveProjectConfig,
} from "../src/shared/api/projectApi.js";
import { testAuthorConfig } from "./projectFixtures.js";

it("loads a missing snapshot without inventing bundled config", async () => {
  const fetcher = vi.fn(async () => ({
    ok: true,
    json: async () => ({ state: "missing", diagnostics: [] }),
  }) as unknown as Response);
  await expect(loadProjectSnapshot(fetcher)).resolves.toEqual({
    state: "missing",
    diagnostics: [],
  });
  expect(fetcher).toHaveBeenCalledWith("/api/project/snapshot");
});

it("rejects a malformed ready snapshot", async () => {
  const fetcher = vi.fn(async () => ({
    ok: true,
    json: async () => ({ state: "ready", revision: 42, config: {} }),
  }) as unknown as Response);
  await expect(loadProjectSnapshot(fetcher)).rejects.toThrow("Invalid project snapshot response");
});

it("sends expected revision on save and migration", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? "{}")) });
    return {
      ok: true,
      json: async () => ({ state: "missing", diagnostics: [] }),
    } as unknown as Response;
  });
  await saveProjectConfig({ expectedRevision: "abc", config: testAuthorConfig }, fetcher);
  await applyProjectMigration({
    expectedRevision: "abc",
    resolutions: [],
    localSettingsPolicy: "preserve-existing",
  }, fetcher);
  expect(calls).toEqual([
    { url: "/api/project/config", body: expect.objectContaining({ expectedRevision: "abc" }) },
    { url: "/api/project/migrate", body: expect.objectContaining({ expectedRevision: "abc" }) },
  ]);
});
```

- [ ] **Step 2: Write project controller state tests**

Rewrite `apps/web/tests/projectController.test.ts` around the new state:

```ts
import {
  applyAuthorMutation,
  canPersistDraft,
  createProjectController,
  selectProjectView,
} from "../src/shared/model/projectController.js";
import {
  readySnapshot,
  validLegacySnapshot as legacySnapshot,
} from "./projectFixtures.js";

it("starts missing and legacy projects on Project without a writable draft", () => {
  expect(createProjectController({ state: "missing", diagnostics: [] })).toMatchObject({
    selectedView: "project",
    draftConfig: undefined,
    dirty: false,
  });
  expect(createProjectController(legacySnapshot)).toMatchObject({
    selectedView: "project",
    draftConfig: undefined,
  });
});

it("creates a v2 draft and tracks the last task view", () => {
  const start = createProjectController(readySnapshot);
  const routed = selectProjectView(start, "routing");
  const updated = applyAuthorMutation(routed, (config) => ({
    ...config,
    project: {
      ...config.project,
      template: { ...config.project.template, output: "Changed.ini" },
    },
  }));
  expect(updated.lastTaskView).toBe("routing");
  expect(updated.dirty).toBe(true);
  expect(canPersistDraft(updated).ok).toBe(true);
});

it("blocks persistence on Core errors but keeps warnings", () => {
  const start = createProjectController(readySnapshot);
  const invalid = applyAuthorMutation(start, (config) => ({ ...config, routes: [] }));
  const readiness = canPersistDraft(invalid);
  expect(readiness.ok).toBe(false);
  if (readiness.ok) throw new Error("expected blocked draft");
  expect(readiness.diagnostics).toContainEqual(expect.objectContaining({
    code: "route.final.missing",
    severity: "error",
  }));
});
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
pnpm exec vitest run apps/web/tests/projectApi.test.ts apps/web/tests/projectController.test.ts
```

Expected: FAIL because the shared API/controller files do not exist.

- [ ] **Step 4: Implement API guards and calls**

Create `apps/web/src/shared/api/projectApi.ts`. The snapshot guard must discriminate all four states and validate required primitives/objects without asserting unknown data:

```ts
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function readSnapshot(response: Response): Promise<ProjectSnapshot> {
  const payload = await response.json() as unknown;
  if (!response.ok) {
    if (isProjectApiErrorPayload(payload)) {
      throw new ProjectApiError(payload.code, payload.message, payload.diagnostics ?? []);
    }
    throw new ProjectApiError("project.request-failed", `Project request failed (${response.status})`, []);
  }
  if (!isProjectSnapshot(payload)) {
    throw new Error("Invalid project snapshot response");
  }
  return payload;
}

export class ProjectApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly diagnostics: Diagnostic[],
  ) {
    super(message);
    this.name = "ProjectApiError";
  }
}

export async function loadProjectSnapshot(
  fetcher: Fetcher = globalThis.fetch,
): Promise<ProjectSnapshot> {
  return readSnapshot(await fetcher("/api/project/snapshot"));
}

export async function saveProjectConfig(
  input: SaveProjectInput,
  fetcher: Fetcher = globalThis.fetch,
): Promise<ProjectSnapshot> {
  return readSnapshot(await fetcher("/api/project/config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }));
}

export async function applyProjectMigration(
  input: ApplyMigrationInput,
  fetcher: Fetcher = globalThis.fetch,
): Promise<ProjectSnapshot> {
  return readSnapshot(await fetcher("/api/project/migrate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }));
}
```

Implement `isProjectApiErrorPayload` as a strict unknown guard for string `code`/`message` and an optional array of exact `Diagnostic` objects. The same 409/422 path therefore preserves server diagnostics without unsafe assertions.

- [ ] **Step 5: Implement derived controller state**

Create `apps/web/src/shared/model/projectController.ts`:

```ts
export type ProjectView = "project" | "library" | "routing" | "output";
export type TaskView = Exclude<ProjectView, "project">;

export interface ProjectControllerState {
  snapshot: ProjectSnapshot;
  draftConfig?: AuthorProjectConfig;
  dirty: boolean;
  selectedView: ProjectView;
  lastTaskView: TaskView;
  saveStatus: "idle" | "saving" | "error";
  saveMessage: string;
}

export function createProjectController(
  snapshot: ProjectSnapshot,
): ProjectControllerState {
  return {
    snapshot,
    draftConfig: snapshot.state === "ready" ? structuredClone(snapshot.config) : undefined,
    dirty: false,
    selectedView: "project",
    lastTaskView: "library",
    saveStatus: "idle",
    saveMessage: "",
  };
}

export function selectProjectView(
  state: ProjectControllerState,
  selectedView: ProjectView,
): ProjectControllerState {
  return {
    ...state,
    selectedView,
    ...(selectedView === "project" ? {} : { lastTaskView: selectedView }),
  };
}
```

`applyAuthorMutation` receives a pure updater and validates the returned config; derive dirty by comparing `serializeAuthorProjectConfig(snapshot.config)` with the next config only when snapshot is ready. Do not store a second diagnostics state; `canPersistDraft` derives it during render/callback from the current draft.

- [ ] **Step 6: Rewire App boot and remove bundled config**

Change `App.tsx` initial state to `createProjectController({ state: "missing", diagnostics: [] })` plus an explicit boot status. On mount, call only `loadProjectSnapshot`; do not import `config.ts` or Catalog. Use functional updates:

```ts
useEffect(() => {
  let active = true;
  void loadProjectSnapshot()
    .then((snapshot) => {
      if (active) setProject(createProjectController(snapshot));
    })
    .catch((error: unknown) => {
      if (active) setBootError(error instanceof Error ? error.message : String(error));
    });
  return () => { active = false; };
}, []);
```

Delete `apps/web/src/config.ts` only after `rg -n "bundledProjectConfig|routes.yaml\?raw" apps/web/src` shows no consumers.

- [ ] **Step 7: Run GREEN and commit**

Run:

```powershell
pnpm exec vitest run apps/web/tests/projectApi.test.ts apps/web/tests/projectController.test.ts
pnpm --filter @clash-route-kit/web typecheck
```

Expected: PASS.

```powershell
git add apps/web/src/shared apps/web/src/App.tsx apps/web/tests/projectFixtures.ts apps/web/tests/projectApi.test.ts apps/web/tests/projectController.test.ts apps/web/src/config.ts
git commit -m "refactor: load project snapshots at runtime"
```

### Task 2: Add the four-domain shell and Project page states

**Files:**

- Create: `apps/web/src/shared/components/AppShell.tsx`
- Create: `apps/web/src/shared/components/DiagnosticSummary.tsx`
- Create: `apps/web/src/features/project/ProjectPage.tsx`
- Create: `apps/web/src/features/project/ProjectEmptyState.tsx`
- Create: `apps/web/src/features/project/ProjectOverview.tsx`
- Create: `apps/web/src/features/project/projectStatus.ts`
- Create: `apps/web/src/features/output/OutputPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Rewrite: `apps/web/tests/appShell.test.tsx`
- Create: `apps/web/tests/projectPage.test.tsx`
- Create: `apps/web/tests/outputNavigation.test.tsx`
- Delete after GREEN: `apps/web/src/components/AppShell.tsx`

**Interfaces:**

- Consumes: `ProjectControllerState`, snapshot diagnostics, existing Library/Routing/Publish components during transition.
- Produces: `ProjectDomainStatus` and `deriveProjectDomainStatuses(config, diagnostics)`.
- Produces: `ProjectPage` actions `onImport`, `onCreateBlank`, `onReviewMigration`, `onContinue`.
- Produces: `OutputPage` route with the final “输出” name while preserving current output behavior.

- [ ] **Step 1: Write exact navigation and empty-state tests**

Rewrite `apps/web/tests/appShell.test.tsx`:

```tsx
it("renders exactly Project, Library, Routing and Output without a global import action", () => {
  render(
    <AppProviders>
      <AppShell
        selectedView="project"
        saveLabel="已保存"
        onSelectView={() => {}}
      >
        <div>content</div>
      </AppShell>
    </AppProviders>,
  );
  expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
    "项目",
    "规则库",
    "路由",
    "输出",
  ]);
  expect(screen.queryByRole("button", { name: /导入/ })).toBeNull();
});
```

Create `apps/web/tests/projectPage.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ProjectSnapshot } from "@clash-route-kit/local-server";
import { AppProviders } from "../src/components/AppProviders.js";
import { ProjectPage } from "../src/features/project/ProjectPage.js";
import { readySnapshot } from "./projectFixtures.js";

export function renderProjectPage(snapshot: ProjectSnapshot) {
  return render(
    <AppProviders>
      <ProjectPage
        snapshot={snapshot}
        draftConfig={snapshot.state === "ready" ? snapshot.config : undefined}
        lastTaskView="library"
        onImport={vi.fn()}
        onCreateBlank={vi.fn()}
        onReviewMigration={vi.fn()}
        onContinue={vi.fn()}
      />
    </AppProviders>,
  );
}

it("makes import the primary action for a missing project", () => {
  renderProjectPage({ state: "missing", diagnostics: [] });
  expect(screen.getByRole("button", { name: "导入现有模板" }).className).toContain("ant-btn-primary");
  expect(screen.getByRole("button", { name: "创建空白项目" })).toBeTruthy();
  expect(screen.queryByText("规则库")).toBeNull();
});

it("shows invalid project diagnostics without fabricating a draft", () => {
  renderProjectPage({
    state: "invalid",
    revision: "bad",
    yaml: "schemaVersion: 2",
    diagnostics: [{ code: "schema.invalid", severity: "error", path: "routes", message: "expected array" }],
  });
  expect(screen.getByText("项目配置无法读取")).toBeTruthy();
  expect(screen.getByText(/routes/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "继续编辑" })).toBeNull();
});

it("shows overview and Continue for a ready project", () => {
  renderProjectPage(readySnapshot);
  expect(screen.getByText("Schema v2")).toBeTruthy();
  expect(screen.getByRole("button", { name: "继续编辑" })).toBeTruthy();
  expect(screen.getByText("规则库")).toBeTruthy();
  expect(screen.getByText("路由")).toBeTruthy();
  expect(screen.getByText("输出")).toBeTruthy();
});
```

- [ ] **Step 2: Run page tests and verify RED**

Run:

```powershell
pnpm exec vitest run apps/web/tests/appShell.test.tsx apps/web/tests/projectPage.test.tsx apps/web/tests/outputNavigation.test.tsx
```

Expected: FAIL because the new shell/pages do not exist.

- [ ] **Step 3: Implement the minimal shell chrome**

Create `apps/web/src/shared/components/AppShell.tsx` with a module-level static nav array:

```tsx
const NAV_ITEMS: ReadonlyArray<{ key: ProjectView; label: string }> = [
  { key: "project", label: "项目" },
  { key: "library", label: "规则库" },
  { key: "routing", label: "路由" },
  { key: "output", label: "输出" },
];
```

The header contains product name, menu and save/status tag only. Remove `onImport` from props. Keep `Layout.Content` as the single page host.

`DiagnosticSummary` accepts `diagnostics`, optional `title`, and `onSelect(path)`; render separate error/warning counts plus an accessible list. Use a button for paths so keyboard users can locate an entity.

- [ ] **Step 4: Derive domain statuses without effect state**

Create `apps/web/src/features/project/projectStatus.ts`:

```ts
export interface ProjectDomainStatus {
  key: "library" | "routing" | "output";
  label: string;
  state: "ready" | "warning" | "blocked";
  message: string;
}

export function deriveProjectDomainStatuses(
  config: AuthorProjectConfig,
  diagnostics: readonly Diagnostic[],
): ProjectDomainStatus[] {
  const providerErrors = diagnostics.filter((item) => item.path?.startsWith("ruleProviders") && item.severity === "error");
  const routeErrors = diagnostics.filter((item) => (item.path?.startsWith("routes") || item.path?.startsWith("proxyGroups")) && item.severity === "error");
  return [
    {
      key: "library",
      label: "规则库",
      state: providerErrors.length > 0 ? "blocked" : config.ruleProviders.some((provider) => provider.enabled === false) ? "warning" : "ready",
      message: providerErrors.length > 0 ? `${providerErrors.length} 个阻断问题` : `${config.ruleProviders.length} 个规则源`,
    },
    {
      key: "routing",
      label: "路由",
      state: routeErrors.length > 0 ? "blocked" : "ready",
      message: routeErrors.length > 0 ? `${routeErrors.length} 个阻断问题` : `${config.routes.length} 条规则`,
    },
    {
      key: "output",
      label: "输出",
      state: diagnostics.some((item) => item.severity === "error") ? "blocked" : "ready",
      message: diagnostics.some((item) => item.severity === "error") ? "修复错误后可生成" : "可生成设备配置",
    },
  ];
}
```

- [ ] **Step 5: Implement Project states and Output route wrapper**

`ProjectPage` switches on `snapshot.state` with exhaustive `never` checking. `ProjectEmptyState` owns the import/blank buttons. `ProjectOverview` derives domain cards during render and sends `onContinue(lastTaskView)`.

For legacy state render:

```tsx
<Alert
  type="warning"
  showIcon
  message="发现 Schema v1 项目"
  description="项目不会被自动改写。请先复核稳定 ID、memberSets、本地设置和不支持项。"
  action={<Button type="primary" onClick={props.onReviewMigration}>复核并迁移</Button>}
/>
```

Create `features/output/OutputPage.tsx` as a real route wrapper around the current `PublishPage` props; title/copy says“输出”，但不改当前设备/GitHub 内部流程。下一阶段在同一文件路径替换内部实现，因此导航和路由接口不会再次变化。

- [ ] **Step 6: Rewire App page routing and run GREEN**

Use an exhaustive page map rather than nested ternaries:

```tsx
const page = project.selectedView === "project"
  ? <ProjectPage ... />
  : project.selectedView === "library"
    ? <LibraryPage ... />
    : project.selectedView === "routing"
      ? <RoutingPage ... />
      : <OutputPage ... />;
```

Run:

```powershell
pnpm exec vitest run apps/web/tests/appShell.test.tsx apps/web/tests/projectPage.test.tsx apps/web/tests/outputNavigation.test.tsx
pnpm --filter @clash-route-kit/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Delete old shell and commit**

```powershell
git add apps/web/src/shared/components apps/web/src/features/project apps/web/src/features/output/OutputPage.tsx apps/web/src/App.tsx apps/web/tests/appShell.test.tsx apps/web/tests/projectPage.test.tsx apps/web/tests/outputNavigation.test.tsx apps/web/src/components/AppShell.tsx
git commit -m "feat: add project first navigation"
```

### Task 3: Implement reviewed v1 migration and INI import flows

**Files:**

- Create: `apps/web/src/features/project/MigrationReviewDrawer.tsx`
- Create: `apps/web/src/features/project/ImportFlowDialog.tsx`
- Create: `apps/web/tests/migrationReviewDrawer.test.tsx`
- Create: `apps/web/tests/importFlow.test.tsx`
- Modify: `apps/web/src/features/project/ProjectPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Delete after GREEN: `apps/web/src/components/ImportModal.tsx`
- Delete after GREEN: `apps/web/tests/importModal.test.tsx`

**Interfaces:**

- Consumes: Core `migrateAuthorProjectConfig`, `applyMigrationResolutions`, `analyzeIniImport`, `applyIniImportReview`.
- Consumes: Project API `applyProjectMigration`, `saveProjectConfig`.
- Produces: `MigrationReviewDrawer` with explicit resolutions and local-settings policy.
- Produces: `ImportFlowDialog` state `source → review → applying`, modes `replace | merge`.

- [ ] **Step 1: Write migration review behavior tests**

Create `apps/web/tests/migrationReviewDrawer.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ApplyMigrationInput, ProjectSnapshot } from "@clash-route-kit/local-server";
import { AppProviders } from "../src/components/AppProviders.js";
import { MigrationReviewDrawer } from "../src/features/project/MigrationReviewDrawer.js";
import { invalidLegacySnapshot, validLegacySnapshot } from "./projectFixtures.js";

function renderMigrationReview(
  snapshot: Extract<ProjectSnapshot, { state: "legacy" }>,
  overrides: { onApply?: (input: ApplyMigrationInput) => void | Promise<void> } = {},
) {
  return render(
    <AppProviders>
      <MigrationReviewDrawer
        open
        snapshot={snapshot}
        onClose={vi.fn()}
        onApply={overrides.onApply ?? vi.fn()}
      />
    </AppProviders>,
  );
}

it("shows IDs, memberSets, local settings and blocking issue counts before apply", () => {
  renderMigrationReview(invalidLegacySnapshot);
  expect(screen.getByText("稳定 ID")).toBeTruthy();
  expect(screen.getByText("memberSets")).toBeTruthy();
  expect(screen.getByText("本地设置候选")).toBeTruthy();
  expect(screen.getByText(/3 个阻断问题/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "应用迁移" })).toBeDisabled();
});

it("requires an explicit local settings policy", () => {
  renderMigrationReview(validLegacySnapshot);
  expect(screen.getByRole("button", { name: "应用迁移" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("保留现有本地设置"));
  expect(screen.getByRole("button", { name: "应用迁移" })).not.toBeDisabled();
});

it("submits only after all blocking issues have explicit resolutions", () => {
  const onApply = vi.fn();
  renderMigrationReview(invalidLegacySnapshot, { onApply });
  fireEvent.click(screen.getByRole("button", { name: "移除错误节点过滤器" }));
  fireEvent.click(screen.getByRole("button", { name: "禁用不支持的 provider" }));
  fireEvent.click(screen.getByRole("button", { name: "禁用引用规则" }));
  fireEvent.click(screen.getByLabelText("保留现有本地设置"));
  fireEvent.click(screen.getByRole("button", { name: "应用迁移" }));
  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
    localSettingsPolicy: "preserve-existing",
    resolutions: expect.any(Array),
  }));
});
```

- [ ] **Step 2: Write import source/review/failure retention tests**

Create `apps/web/tests/importFlow.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { AuthorProjectConfig } from "@clash-route-kit/core";
import { AppProviders } from "../src/components/AppProviders.js";
import { ImportFlowDialog } from "../src/features/project/ImportFlowDialog.js";
import { testAuthorConfig, validIni } from "./projectFixtures.js";

function renderImportFlow(overrides: {
  onApply?: (config: AuthorProjectConfig) => void | Promise<void>;
} = {}) {
  const fetcher = vi.fn(async () => ({
    ok: true,
    json: async () => [{ id: "templates", label: "模板", kind: "ini-template", count: 1 }],
  }) as unknown as Response);
  return render(
    <AppProviders>
      <ImportFlowDialog
        open
        currentConfig={testAuthorConfig}
        currentRevision="revision-v2"
        fetcher={fetcher}
        onClose={vi.fn()}
        onApply={overrides.onApply ?? vi.fn()}
      />
    </AppProviders>,
  );
}

it("starts with template library and paste sources, then shows a structured replace review", async () => {
  renderImportFlow();
  expect(screen.getByRole("tab", { name: "模板库" })).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "粘贴 INI" }));
  fireEvent.change(screen.getByRole("textbox", { name: "INI 内容" }), {
    target: { value: validIni },
  });
  fireEvent.click(screen.getByRole("button", { name: "分析导入" }));
  expect(await screen.findByText("导入复核")).toBeTruthy();
  expect(screen.getByText(/新增策略组/)).toBeTruthy();
  expect(screen.getByText(/替换当前项目/)).toBeTruthy();
});

it("keeps input and review when apply fails", async () => {
  const onApply = vi.fn(async () => { throw new Error("revision changed"); });
  renderImportFlow({ onApply });
  fireEvent.click(screen.getByRole("tab", { name: "粘贴 INI" }));
  fireEvent.change(screen.getByRole("textbox", { name: "INI 内容" }), {
    target: { value: validIni },
  });
  fireEvent.click(screen.getByRole("button", { name: "分析导入" }));
  fireEvent.click(await screen.findByRole("button", { name: "应用导入" }));
  expect(await screen.findByText("revision changed")).toBeTruthy();
  expect(screen.getByDisplayValue(validIni)).toBeTruthy();
  expect(screen.getByText("导入复核")).toBeTruthy();
});
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
pnpm exec vitest run apps/web/tests/migrationReviewDrawer.test.tsx apps/web/tests/importFlow.test.tsx
```

Expected: FAIL because reviewed flows do not exist.

- [ ] **Step 4: Implement migration review as derived Core state**

`MigrationReviewDrawer` receives the legacy config and calls `migrateAuthorProjectConfig` in `useMemo`. Store only selected resolutions and local settings policy. Derive the resolved review during render:

```tsx
const baseReview = useMemo(
  () => migrateAuthorProjectConfig(props.snapshot.config),
  [props.snapshot.config],
);
const resolvedReview = useMemo(
  () => applyMigrationResolutions(baseReview, resolutions),
  [baseReview, resolutions],
);
const canApply = migrationCanApply(resolvedReview) && localSettingsPolicy !== null;
```

Render structured sections for entity counts, generated stable IDs, generated memberSets, local settings patch, semantic before/after counts and issue resolutions. Do not render a full INI diff.

When Apply is clicked, send `expectedRevision`, resolutions and selected policy. Keep the drawer open with its state on rejection; on success replace the controller snapshot and close.

- [ ] **Step 5: Implement import with on-demand parallel catalog loading**

`ImportFlowDialog` opens by starting independent source requests together:

```ts
useEffect(() => {
  if (!props.open) return;
  let active = true;
  void fetchCatalogSources(props.fetcher).then((sources) => {
    if (!active) return;
    setCatalogSources(sources);
  }).catch((error: unknown) => {
    if (active) setLoadError(error instanceof Error ? error.message : String(error));
  });
  return () => { active = false; };
}, [props.open, props.fetcher]);
```

This phase loads only the existing Catalog sources endpoint. Template entries are fetched lazily when the user selects a Catalog source; if entry metadata and preview content are independent, start those two existing Catalog requests with `Promise.all`. Output/template health remains owned by the Output phase and is not introduced into import.

State shape:

```ts
type ImportStep = "source" | "review" | "applying";
type ImportSourceMode = "template" | "paste";

interface ImportDialogState {
  step: ImportStep;
  sourceMode: ImportSourceMode;
  importMode: "replace" | "merge";
  ini: string;
  review?: IniImportReview;
  error: string;
}
```

Use functional updates for every state change. Analyze with Core; apply with `applyIniImportReview`, then save the resulting author config with the current revision. A failed save only sets `error` and returns to `review` with all other fields unchanged.

- [ ] **Step 6: Replace old import wiring and run GREEN**

Project empty/overview buttons open `ImportFlowDialog`; legacy migration uses `MigrationReviewDrawer`. Remove App global import state and old `ImportModal` after no references remain.

Run:

```powershell
pnpm exec vitest run apps/web/tests/migrationReviewDrawer.test.tsx apps/web/tests/importFlow.test.tsx apps/web/tests/projectPage.test.tsx
pnpm --filter @clash-route-kit/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/features/project apps/web/src/App.tsx apps/web/tests/migrationReviewDrawer.test.tsx apps/web/tests/importFlow.test.tsx apps/web/tests/projectPage.test.tsx apps/web/src/components/ImportModal.tsx apps/web/tests/importModal.test.tsx
git commit -m "feat: review project imports and migration"
```

### Task 4: Refactor the Rule Library around executable provider state

**Files:**

- Create: `apps/web/src/features/library/libraryModel.ts`
- Create: `apps/web/src/features/library/LibraryIssuesPanel.tsx`
- Create: `apps/web/src/features/library/ProviderList.tsx`
- Create: `apps/web/src/features/library/ProviderDrawer.tsx`
- Create: `apps/web/src/features/library/RepositorySettingsDrawer.tsx`
- Create/move: `apps/web/src/features/library/LibraryPage.tsx`
- Create: `apps/web/tests/libraryFixtures.tsx`
- Update: `apps/web/tests/libraryPage.test.tsx`
- Update/create: `apps/web/tests/providerDrawer.test.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**

- Consumes: v2 `AuthorRuleProvider`, diagnostics, Core provider mutations, Catalog/rule-file APIs.
- Produces: `deriveLibraryIssues(config, diagnostics): LibraryIssueSummary`.
- Produces: provider selection by `provider.id`, never by `name` or `output`.
- Produces: explicit-save `ProviderDrawer`.

- [ ] **Step 0: Create Library fixtures and render helpers**

Create `apps/web/tests/libraryFixtures.tsx`:

```tsx
import type {
  AuthorProjectConfig,
  AuthorRuleProvider,
  Diagnostic,
} from "@clash-route-kit/core";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { AppProviders } from "../src/components/AppProviders.js";
import { LibraryPage } from "../src/features/library/LibraryPage.js";
import { ProviderDrawer } from "../src/features/library/ProviderDrawer.js";
import { testAuthorConfig } from "./projectFixtures.js";

export const disabledProvider: AuthorRuleProvider = {
  id: "draft",
  name: "Draft",
  output: "Draft.yaml",
  behavior: "domain",
  enabled: false,
  sources: [],
};

export const authorConfigWithProviders: AuthorProjectConfig = {
  ...structuredClone(testAuthorConfig),
  ruleProviders: [
    { ...disabledProvider, id: "blocking", name: "Blocking", enabled: true },
    disabledProvider,
  ],
};

export const authorConfigWithDuplicateDisplayNames: AuthorProjectConfig = {
  ...structuredClone(testAuthorConfig),
  ruleProviders: [
    { ...disabledProvider, id: "ai-primary", name: "AI" },
    { ...disabledProvider, id: "ai-secondary", name: "AI", output: "AI_Secondary.yaml" },
  ],
};

export function renderLibrary(input: {
  config?: AuthorProjectConfig;
  diagnostics?: Diagnostic[];
  onReplaceProvider?: (id: string, provider: AuthorRuleProvider) => void;
} = {}) {
  return render(
    <AppProviders>
      <LibraryPage
        config={input.config ?? authorConfigWithProviders}
        diagnostics={input.diagnostics ?? []}
        onReplaceProvider={input.onReplaceProvider ?? vi.fn()}
        onReplaceVendorRepo={vi.fn()}
        onCreateRuleFile={vi.fn()}
        fetcher={vi.fn()}
      />
    </AppProviders>,
  );
}

export function renderProviderDrawer(input: {
  provider?: AuthorRuleProvider;
  onSave?: (provider: AuthorRuleProvider) => void;
} = {}) {
  const provider = input.provider ?? disabledProvider;
  return render(
    <AppProviders>
      <ProviderDrawer
        open
        config={{ ...structuredClone(testAuthorConfig), ruleProviders: [provider] }}
        provider={provider}
        onClose={vi.fn()}
        onSave={input.onSave ?? vi.fn()}
      />
    </AppProviders>,
  );
}
```

- [ ] **Step 1: Write priority-issue and stable-ID tests**

Update `apps/web/tests/libraryPage.test.tsx`:

```tsx
import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  authorConfigWithDuplicateDisplayNames,
  authorConfigWithProviders,
  renderLibrary,
} from "./libraryFixtures.js";

it("shows blocking and incomplete providers before the browser", () => {
  renderLibrary({
    config: authorConfigWithProviders,
    diagnostics: [
      { code: "provider.sources.empty", severity: "error", path: "ruleProviders[0].sources", message: "启用 provider 缺少来源" },
      { code: "provider.sources.disabled-empty", severity: "warning", path: "ruleProviders[1].sources", message: "禁用草稿待补全" },
    ],
  });
  expect(screen.getByText("阻断生成 1")).toBeTruthy();
  expect(screen.getByText("待补全来源 1")).toBeTruthy();
  expect(screen.getByRole("button", { name: "处理阻断问题" })).toBeTruthy();
});

it("selects and edits providers by stable id", () => {
  const onReplaceProvider = vi.fn();
  renderLibrary({ config: authorConfigWithDuplicateDisplayNames, onReplaceProvider });
  fireEvent.click(screen.getByTestId("provider-row-ai-primary"));
  fireEvent.click(screen.getByRole("button", { name: "编辑规则源" }));
  fireEvent.change(screen.getByLabelText("显示名称"), { target: { value: "AI Services" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(onReplaceProvider).toHaveBeenCalledWith("ai-primary", expect.objectContaining({
    id: "ai-primary",
    name: "AI Services",
  }));
});

it("keeps repository settings out of the main provider browser", () => {
  renderLibrary({ config: authorConfigWithProviders });
  expect(screen.queryByText("上游仓库列表")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "仓库设置" }));
  expect(screen.getByRole("dialog", { name: "仓库设置" })).toBeTruthy();
});
```

- [ ] **Step 2: Write explicit provider drawer tests**

Create `apps/web/tests/providerDrawer.test.tsx`:

```tsx
import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { disabledProvider, renderProviderDrawer } from "./libraryFixtures.js";

it("keeps provider edits local until Save", () => {
  const onSave = vi.fn();
  renderProviderDrawer({ provider: disabledProvider, onSave });
  fireEvent.change(screen.getByLabelText("输出文件名"), { target: { value: "Changed.yaml" } });
  fireEvent.click(screen.getByRole("switch", { name: "启用规则源" }));
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    id: disabledProvider.id,
    output: "Changed.yaml",
    enabled: true,
  }));
});

it("blocks enabling an empty provider inside the drawer", () => {
  const onSave = vi.fn();
  renderProviderDrawer({ provider: disabledProvider, onSave });
  fireEvent.click(screen.getByRole("switch", { name: "启用规则源" }));
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.getByText("启用的规则源至少需要一个数据源")).toBeTruthy();
  expect(onSave).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run Library tests and verify RED**

Run:

```powershell
pnpm exec vitest run apps/web/tests/libraryPage.test.tsx apps/web/tests/providerDrawer.test.tsx
```

Expected: FAIL because the v2 feature components do not exist.

- [ ] **Step 4: Implement one-pass Library model and deferred search**

Create `libraryModel.ts`:

```ts
export interface LibraryIssueSummary {
  blocking: Diagnostic[];
  incomplete: Diagnostic[];
  invalidSources: Diagnostic[];
}

export function deriveLibraryIssues(
  diagnostics: readonly Diagnostic[],
): LibraryIssueSummary {
  const summary: LibraryIssueSummary = { blocking: [], incomplete: [], invalidSources: [] };
  for (const diagnostic of diagnostics) {
    if (!diagnostic.path?.startsWith("ruleProviders")) continue;
    if (diagnostic.severity === "error") summary.blocking.push(diagnostic);
    if (diagnostic.code.includes("disabled-empty")) summary.incomplete.push(diagnostic);
    if (diagnostic.code.includes("source")) summary.invalidSources.push(diagnostic);
  }
  return summary;
}
```

In `ProviderList`, keep immediate input state and defer only filtering:

```tsx
const [query, setQuery] = useState("");
const deferredQuery = useDeferredValue(query);
const filtered = useMemo(() => {
  const needle = deferredQuery.trim().toLowerCase();
  return needle
    ? providers.filter((provider) => `${provider.name} ${provider.output}`.toLowerCase().includes(needle))
    : providers;
}, [providers, deferredQuery]);
```

Use `provider.id` for keys, selection and edit handlers. Add a text stale-state hint or reduced opacity when `query !== deferredQuery`.

- [ ] **Step 5: Implement explicit provider and repository drawers**

`ProviderDrawer` initializes a local deep clone when `open` and `provider.id` change. Do not call project mutation from field events. On Save, run Core validation against a temporary config with `replaceRuleProvider`; show its first local provider error in the drawer, otherwise call `onSave(provider.id, draft)` once.

`RepositorySettingsDrawer` edits `AuthorVendorRepo` by stable ID and remains a toolbar action. The main page shows provider list/source status and rule files; it does not render vendor repos beside them.

Move existing Catalog browser and rule-file editor under `features/library` with direct relative imports. Keep their focused tests and APIs unchanged except stable IDs.

- [ ] **Step 6: Rewire App and run GREEN**

Run:

```powershell
pnpm exec vitest run apps/web/tests/libraryPage.test.tsx apps/web/tests/providerDrawer.test.tsx apps/web/tests/catalogBrowser.test.tsx apps/web/tests/ruleFiles.test.ts
pnpm --filter @clash-route-kit/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/features/library apps/web/src/App.tsx apps/web/tests/libraryFixtures.tsx apps/web/tests/libraryPage.test.tsx apps/web/tests/providerDrawer.test.tsx apps/web/tests/catalogBrowser.test.tsx apps/web/tests/ruleFiles.test.ts
git commit -m "feat: prioritize executable rule sources"
```

### Task 5: Redesign Routing around one route list and one group drawer

**Files:**

- Create: `apps/web/src/features/routing/routingModel.ts`
- Create: `apps/web/src/features/routing/ProxyGroupList.tsx`
- Create: `apps/web/src/features/routing/RouteToolbar.tsx`
- Create: `apps/web/src/features/routing/RouteList.tsx`
- Create: `apps/web/src/features/routing/ProxyGroupDrawer.tsx`
- Create: `apps/web/src/features/routing/RouteDrawer.tsx`
- Create: `apps/web/src/features/routing/RoutingPage.tsx`
- Create: `apps/web/tests/routingFixtures.tsx`
- Rewrite: `apps/web/tests/routingPage.test.tsx`
- Create: `apps/web/tests/proxyGroupDrawer.test.tsx`
- Create: `apps/web/tests/routeList.test.tsx`
- Delete after GREEN: `apps/web/src/components/GroupContextPanel.tsx`
- Delete after GREEN: `apps/web/src/components/PreviewDock.tsx`
- Delete/migrate superseded routing components and tests。

**Interfaces:**

- Consumes: `AuthorProjectConfig`, `NormalizedProject`, Core route/group mutations and diagnostics.
- Produces: `RoutingViewModel` with `groupsById`, `providersById`, `routeRows`, `groupUsageCounts`, `groupReferenceCounts`.
- Produces: page state `groupFilterId`, `routeSearch`, `drawerGroupId`, `drawerRouteId`.
- Produces: `onFilterRoutes(groupId)` focus contract.

- [ ] **Step 0: Create Routing fixtures and render helpers**

Create `apps/web/tests/routingFixtures.tsx`:

```tsx
import type { Diagnostic } from "@clash-route-kit/core";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { AppProviders } from "../src/components/AppProviders.js";
import { ProxyGroupDrawer } from "../src/features/routing/ProxyGroupDrawer.js";
import { RouteList } from "../src/features/routing/RouteList.js";
import { RoutingPage } from "../src/features/routing/RoutingPage.js";
import { createRoutingViewModel } from "../src/features/routing/routingModel.js";
import { testAuthorConfig } from "./projectFixtures.js";

export function renderRouting(input: { diagnostics?: Diagnostic[] } = {}) {
  return render(
    <AppProviders>
      <RoutingPage
        config={testAuthorConfig}
        diagnostics={input.diagnostics ?? []}
        onReplaceGroup={vi.fn()}
        onReplaceRoute={vi.fn()}
        onReorderRoutes={vi.fn()}
      />
    </AppProviders>,
  );
}

export function renderProxyGroupDrawer(input: {
  onSave?: (id: string, group: typeof testAuthorConfig.proxyGroups[number]) => void;
} = {}) {
  const group = testAuthorConfig.proxyGroups.find((item) => item.id === "chat")!;
  return render(
    <AppProviders>
      <ProxyGroupDrawer
        open
        config={testAuthorConfig}
        group={group}
        routeUsageCount={2}
        parentReferenceCount={0}
        onClose={vi.fn()}
        onFilterRoutes={vi.fn()}
        onSave={input.onSave ?? vi.fn()}
      />
    </AppProviders>,
  );
}

export function renderRouteList(input: {
  diagnostics?: Diagnostic[];
  onEdit?: (id: string) => void;
  onFilter?: (groupId: string) => void;
} = {}) {
  const model = createRoutingViewModel(testAuthorConfig, input.diagnostics ?? []);
  return render(
    <AppProviders>
      <RouteList
        rows={model.routeRows}
        onEdit={input.onEdit ?? vi.fn()}
        onToggle={vi.fn()}
        onFilterPolicy={input.onFilter ?? vi.fn()}
      />
    </AppProviders>,
  );
}
```

- [ ] **Step 1: Write duplicate-removal and filter tests**

Rewrite `apps/web/tests/routingPage.test.tsx`:

```tsx
import { fireEvent, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderRouting } from "./routingFixtures.js";

it("renders one complete route list with no context preview or permanent INI", () => {
  renderRouting();
  expect(screen.getByTestId("route-row-telegram")).toBeTruthy();
  expect(screen.getByTestId("route-row-final")).toBeTruthy();
  expect(screen.queryByText("被以下策略组引用")).toBeNull();
  expect(screen.queryByText("下游策略组 / 内置策略")).toBeNull();
  expect(screen.queryByTestId("preview-dock")).toBeNull();
  expect(screen.queryByText("[custom]")).toBeNull();
});

it("opens the drawer directly when a strategy group is selected", () => {
  renderRouting();
  fireEvent.click(screen.getByTestId("proxy-group-chat"));
  expect(screen.getByRole("dialog", { name: "策略组 · 💬 即时通讯" })).toBeTruthy();
});

it("filters the main route list from the drawer usage action", () => {
  renderRouting();
  fireEvent.click(screen.getByTestId("proxy-group-chat"));
  expect(screen.getByText("被 2 条路由使用")).toBeTruthy();
  expect(screen.queryByText("telegram")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "筛选路由" }));
  expect(screen.getByRole("heading", { name: "路由规则" })).toHaveFocus();
  expect(screen.getByTestId("route-row-telegram")).toBeTruthy();
  expect(screen.queryByTestId("route-row-direct")).toBeNull();
});
```

- [ ] **Step 2: Write typed member and explicit-save drawer tests**

Create `apps/web/tests/proxyGroupDrawer.test.tsx`:

```tsx
import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderProxyGroupDrawer } from "./routingFixtures.js";

it("edits presets, group refs and builtins in one member control", async () => {
  const onSave = vi.fn();
  renderProxyGroupDrawer({ onSave });
  expect(screen.getByText("成员与 memberSets")).toBeTruthy();
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "添加成员" }));
  fireEvent.click(await screen.findByText("preset · standard-proxy"));
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(onSave).toHaveBeenCalledWith("chat", expect.objectContaining({
    id: "chat",
    members: expect.arrayContaining([{ preset: "standard-proxy" }]),
  }));
});

it("shows usage count but never copies the inbound route list", () => {
  renderProxyGroupDrawer();
  expect(screen.getByText("被 2 条路由使用")).toBeTruthy();
  expect(screen.queryByText("telegram")).toBeNull();
  expect(screen.queryByText("github")).toBeNull();
});

it("keeps a display rename local and stable references unchanged", () => {
  const onSave = vi.fn();
  renderProxyGroupDrawer({ onSave });
  fireEvent.change(screen.getByLabelText("显示名称"), { target: { value: "Chat Services" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(onSave).toHaveBeenCalledWith("chat", expect.objectContaining({ id: "chat", name: "Chat Services" }));
});
```

- [ ] **Step 3: Write route row stable-ID/local diagnostic tests**

Create `apps/web/tests/routeList.test.tsx`:

```tsx
import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderRouteList } from "./routingFixtures.js";

it("renders display names while edit callbacks use route and group ids", () => {
  const onEdit = vi.fn();
  const onFilter = vi.fn();
  renderRouteList({ onEdit, onFilter });
  expect(screen.getByText("💬 即时通讯")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("编辑 telegram"));
  expect(onEdit).toHaveBeenCalledWith("telegram");
  fireEvent.click(screen.getByRole("button", { name: "💬 即时通讯" }));
  expect(onFilter).toHaveBeenCalledWith("chat");
});

it("shows row diagnostics with text and path", () => {
  renderRouteList({ diagnostics: [{
    code: "route.provider.disabled",
    severity: "error",
    path: "routes[0].source.provider",
    message: "引用了禁用 provider",
  }] });
  expect(screen.getByText("引用了禁用 provider")).toBeTruthy();
  expect(screen.getByLabelText("错误：routes[0].source.provider")).toBeTruthy();
});
```

- [ ] **Step 4: Run routing tests and verify RED**

Run:

```powershell
pnpm exec vitest run apps/web/tests/routingPage.test.tsx apps/web/tests/proxyGroupDrawer.test.tsx apps/web/tests/routeList.test.tsx
```

Expected: FAIL because the new routing feature does not exist.

- [ ] **Step 5: Build the routing view model with Maps in one pass**

Create `routingModel.ts`:

```ts
export interface RoutingViewModel {
  groupsById: Map<string, AuthorProxyGroup>;
  providersById: Map<string, AuthorRuleProvider>;
  groupUsageCounts: Map<string, number>;
  groupReferenceCounts: Map<string, number>;
  routeRows: RouteRowModel[];
}

export function createRoutingViewModel(
  config: AuthorProjectConfig,
  diagnostics: readonly Diagnostic[],
): RoutingViewModel {
  const groupsById = new Map(config.proxyGroups.map((group) => [group.id, group]));
  const providersById = new Map(config.ruleProviders.map((provider) => [provider.id, provider]));
  const groupUsageCounts = new Map<string, number>();
  const groupReferenceCounts = new Map<string, number>();
  for (const route of config.routes) {
    if ("group" in route.policy) {
      groupUsageCounts.set(route.policy.group, (groupUsageCounts.get(route.policy.group) ?? 0) + 1);
    }
  }
  for (const group of config.proxyGroups) {
    for (const member of group.members) {
      if ("group" in member) {
        groupReferenceCounts.set(member.group, (groupReferenceCounts.get(member.group) ?? 0) + 1);
      }
    }
  }
  const diagnosticsByPath = groupDiagnosticsByEntityPath(diagnostics);
  const routeRows = config.routes.map((route) => createRouteRow(route, groupsById, providersById, diagnosticsByPath));
  return { groupsById, providersById, groupUsageCounts, groupReferenceCounts, routeRows };
}
```

Define `RouteRowModel`, `groupDiagnosticsByEntityPath`, and `createRouteRow` in the same file with exact fields consumed by `RouteList`: `id`, `enabled`, `section`, `sourceLabel`, `policyId?`, `policyName`, `diagnostics`.

- [ ] **Step 6: Implement one-list page state and deferred route filtering**

`RoutingPage` owns only IDs and search text:

```tsx
const [groupFilterId, setGroupFilterId] = useState<string | null>(null);
const [routeSearch, setRouteSearch] = useState("");
const [drawerGroupId, setDrawerGroupId] = useState<string | null>(null);
const [drawerRouteId, setDrawerRouteId] = useState<string | null>(null);
const deferredSearch = useDeferredValue(routeSearch);
const viewModel = useMemo(() => createRoutingViewModel(config, diagnostics), [config, diagnostics]);
const visibleRoutes = useMemo(() => viewModel.routeRows.filter((row) => {
  if (groupFilterId && row.policyId !== groupFilterId) return false;
  const needle = deferredSearch.trim().toLowerCase();
  return !needle || `${row.id} ${row.sourceLabel} ${row.policyName}`.toLowerCase().includes(needle);
}), [viewModel.routeRows, groupFilterId, deferredSearch]);
```

`ProxyGroupList` row click calls `setDrawerGroupId(id)`, never the route filter. `RouteToolbar` owns the explicit group filter. `onFilterRoutes(id)` closes the drawer, sets filter, and focuses a `ref` on the route heading in `requestAnimationFrame`.

`RouteList` is the only complete route rendering. Rows use `data-testid="route-row-${id}"` and class `rk-route-row`.

- [ ] **Step 7: Implement the sole Proxy Group detail drawer**

`ProxyGroupDrawer` deep-clones the group into local state keyed by `group.id`. It renders:

- read-only stable ID;
- editable display name/type;
- one ordered typed member editor containing group/builtin/preset choices;
- node filter fields with typed scope and match;
- health-check overrides;
- parent-reference count;
- `被 N 条路由使用` and a single `筛选路由` button.

Do not render member values again outside the member editor and do not render inbound route IDs/names. Save calls Core `replaceProxyGroup(config, id, draft)` and returns local diagnostics if invalid.

`RouteDrawer` uses route ID, typed policy, typed source and explicit Save. Reorder/toggle actions can remain immediate page mutations because they are not drawer field edits.

- [ ] **Step 8: Remove duplicate components and permanent INI imports**

After new tests pass, delete `GroupContextPanel.tsx`, `PreviewDock.tsx` and their tests. Replace App import with the feature Routing page. Search:

```powershell
rg -n "renderIni|GroupContextPanel|PreviewDock|selectInboundRuleSets" apps/web/src/features/routing apps/web/src/App.tsx
```

Expected: no matches in the routing feature. `selectInboundRuleSets` may remain elsewhere only if still used by a non-routing compatibility path; otherwise remove it and its test.

- [ ] **Step 9: Run GREEN and commit**

Run:

```powershell
pnpm exec vitest run apps/web/tests/routingPage.test.tsx apps/web/tests/proxyGroupDrawer.test.tsx apps/web/tests/routeList.test.tsx
pnpm --filter @clash-route-kit/web typecheck
```

Expected: PASS.

```powershell
git add apps/web/src/features/routing apps/web/src/App.tsx apps/web/tests/routingFixtures.tsx apps/web/tests/routingPage.test.tsx apps/web/tests/proxyGroupDrawer.test.tsx apps/web/tests/routeList.test.tsx apps/web/src/components/GroupContextPanel.tsx apps/web/src/components/PreviewDock.tsx apps/web/tests/groupContextPanel.test.tsx apps/web/tests/previewDock.test.tsx
git commit -m "feat: simplify route and group editing"
```

### Task 6: Complete feature ownership, responsive behavior and focus management

**Files:**

- Create: `apps/web/src/shared/hooks/useFocusOnOpen.ts`
- Modify: `apps/web/src/styles.css`
- Modify: Project/Library/Routing drawers and pages。
- Modify: `apps/web/tests/projectPage.test.tsx`
- Modify: `apps/web/tests/libraryPage.test.tsx`
- Modify: `apps/web/tests/routingPage.test.tsx`
- Modify: `apps/web/tests/appShell.test.tsx`
- Delete/move remaining superseded root `components` and model files after import search。

**Interfaces:**

- Produces: `useFocusOnOpen(open, ref)`.
- Produces: responsive classes with one main scroll region and near-fullscreen mobile drawers.
- Guarantees: page headings and first invalid field receive focus after navigation/error actions.

- [ ] **Step 1: Add focus and mobile semantic tests**

Add to component tests:

```tsx
it("moves focus to the drawer heading when opened", () => {
  renderRouting();
  fireEvent.click(screen.getByTestId("proxy-group-chat"));
  expect(screen.getByRole("heading", { name: "策略组 · 💬 即时通讯" })).toHaveFocus();
});

it("uses text labels in every domain status", () => {
  renderProjectPage(readySnapshotWithWarnings);
  expect(screen.getByText("有警告")).toBeTruthy();
  expect(screen.getByText(/待补全/)).toBeTruthy();
});
```

Add a class/DOM contract test for route rows:

```tsx
expect(screen.getByTestId("route-row-telegram").className).toContain("rk-route-row");
expect(screen.getByTestId("routing-main").className).toContain("rk-main-scroll");
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
pnpm exec vitest run apps/web/tests/projectPage.test.tsx apps/web/tests/libraryPage.test.tsx apps/web/tests/routingPage.test.tsx apps/web/tests/appShell.test.tsx
```

Expected: FAIL on focus/class contracts.

- [ ] **Step 3: Implement reusable focus transfer**

Create `useFocusOnOpen.ts`:

```ts
import { useEffect, type RefObject } from "react";

export function useFocusOnOpen<T extends HTMLElement>(
  open: boolean,
  ref: RefObject<T | null>,
): void {
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, ref]);
}
```

Drawer headings use `tabIndex={-1}` and a stable ref. Error-location actions first open the relevant drawer, then focus the exact field or diagnostic heading.

- [ ] **Step 4: Add single-scroll, long-list and mobile styles**

Append/update `styles.css` with exact layout contracts:

```css
.rk-page-shell {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.rk-main-scroll {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.rk-route-row,
.rk-provider-row {
  content-visibility: auto;
  contain-intrinsic-size: 0 72px;
}

@media (max-width: 640px) {
  .rk-routing-layout,
  .rk-library-layout {
    grid-template-columns: 1fr;
  }

  .rk-route-row,
  .rk-provider-row,
  .rk-subscription-row {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .rk-drawer-responsive .ant-drawer-content-wrapper {
    width: min(100vw, 520px) !important;
  }
}
```

Ensure fixed headers/footers do not cover the primary button; use flex/min-height rather than nested `100vh` inside pages.

- [ ] **Step 5: Finish feature imports and delete superseded roots**

Run:

```powershell
rg -n "src/components/(LibraryPage|RoutingPage|GroupNav|GroupDrawer|RuleStream|RuleRow)|from \"\.\/components\/(LibraryPage|RoutingPage)" apps/web/src apps/web/tests
```

Migrate every feature-owned import to `features/*`. Delete a superseded old file only when this search no longer shows a consumer and its behavior has a passing feature test. Keep the genuinely shared `apps/web/src/components/AppProviders.tsx` and `apps/web/src/components/InheritedSettingField.tsx` at their existing paths in this phase; exclude both from deletion.

- [ ] **Step 6: Run GREEN, build and two-width browser acceptance**

Run:

```powershell
pnpm exec vitest run apps/web/tests
pnpm --filter @clash-route-kit/web typecheck
pnpm --filter @clash-route-kit/web build
```

Expected: PASS.

Then start:

```powershell
pnpm dev
```

Browser acceptance at 1200px:

1. Open Project, Library, Routing and Output; confirm one main scroll area each.
2. Open group/provider/route drawers; confirm focus moves to headings and Cancel discards local edits.
3. Filter a 50+ row route list while typing; input remains responsive.
4. Confirm no full INI appears until an explicit generated-result action is used.

Browser acceptance at 360px:

1. Navigation remains reachable and labels remain visible.
2. Drawers occupy near-full width with visible Save/Cancel.
3. Route/provider rows stack vertically and no main task requires horizontal scrolling.
4. No fixed header/footer covers import, save or filter actions.

Expected: no console errors in either width.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/shared/hooks/useFocusOnOpen.ts apps/web/src/styles.css apps/web/src/shared/components/AppShell.tsx apps/web/src/features/project/ProjectPage.tsx apps/web/src/features/project/MigrationReviewDrawer.tsx apps/web/src/features/project/ImportFlowDialog.tsx apps/web/src/features/library/LibraryPage.tsx apps/web/src/features/library/ProviderList.tsx apps/web/src/features/library/ProviderDrawer.tsx apps/web/src/features/library/RepositorySettingsDrawer.tsx apps/web/src/features/routing/RoutingPage.tsx apps/web/src/features/routing/ProxyGroupList.tsx apps/web/src/features/routing/ProxyGroupDrawer.tsx apps/web/src/features/routing/RouteList.tsx apps/web/src/features/routing/RouteDrawer.tsx apps/web/tests/projectPage.test.tsx apps/web/tests/libraryPage.test.tsx apps/web/tests/routingPage.test.tsx apps/web/tests/appShell.test.tsx
git commit -m "refactor: organize web features by workflow"
```

Before committing, inspect `git diff --cached --stat`. If the import search authorized deletion of an additional superseded root component, add that exact deleted path in a second `git add <exact-path>` call. Do not stage an entire source/test directory and do not include output/GitHub implementation files beyond the `OutputPage` route wrapper.

### Task 7: Run Web workflow specification coverage audit

**Files:**

- Review: `apps/web/src/App.tsx`
- Review: `apps/web/src/features/project/`
- Review: `apps/web/src/features/library/`
- Review: `apps/web/src/features/routing/`
- Review: `apps/web/src/features/output/OutputPage.tsx`

**Interfaces:**

- Verifies: navigation, project states, import/migration, library priorities and routing deduplication.
- Verifies: React plan constraints materially applied.

- [ ] **Step 1: Search obsolete UI and bundled config artifacts**

Run:

```powershell
rg -n "routes.yaml\?raw|bundledProjectConfig|selectedView.*publish|label: \"发布\"|onImport=.*AppShell|GroupContextPanel|PreviewDock|publish-ini-preview" apps/web/src
```

Expected: no matches. Current output internals may still contain old publish component names, but the route/navigation and permanent routing preview artifacts must be absent.

- [ ] **Step 2: Search stable-ID and React state practices**

Run:

```powershell
rg -n "selectedProviderName|selectedCustomProxyGroupName|policy: .*name|source\.file" apps/web/src/features
rg -n "useDeferredValue|content-visibility|new Map|set[A-Z][A-Za-z]+\(\(current" apps/web/src/features apps/web/src/styles.css
```

Expected: feature selection uses IDs; deferred search, Map lookups, functional updates and long-list styles are present where planned.

- [ ] **Step 3: Run full automated gates**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
```

Expected: every command exits 0.

- [ ] **Step 4: Verify feature file ownership**

Run:

```powershell
Get-ChildItem apps/web/src/features -Directory | Select-Object Name
Get-ChildItem apps/web/src/components -File | Select-Object Name
git diff --check
```

Expected: `project`, `library`, `routing`, `output` exist; root `components` contains only still-shared components or is removed; no whitespace errors.

- [ ] **Step 5: Commit final test-only corrections if present**

```powershell
git add apps/web/tests/projectPage.test.tsx apps/web/tests/libraryPage.test.tsx apps/web/tests/routingPage.test.tsx apps/web/tests/appShell.test.tsx apps/web/tests/migrationReviewDrawer.test.tsx apps/web/tests/importFlow.test.tsx apps/web/tests/providerDrawer.test.tsx apps/web/tests/proxyGroupDrawer.test.tsx apps/web/tests/routeList.test.tsx
git commit -m "test: verify web workflow redesign"
```

Skip this commit when no correction was required.
