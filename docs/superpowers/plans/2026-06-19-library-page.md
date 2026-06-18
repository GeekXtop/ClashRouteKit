# 规则库页 实现计划（重做计划 4/5）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现管理台式「规则库」页——左栏（上游仓库：同步/编辑弹窗 + 本地 .list + 规则源），右栏全高编辑（.list 文本 / 规则源配方 / 仓库摘要）；上游仓库增改删走弹窗，隐藏 vendor 路径、可钉分支、换 GeekXtop。

**Architecture:** 复用 `catalog.ts`（sources/sync）、`ruleFiles.ts`（list/load/save）、`configMutations.ts` 的 provider 变换。新增 catalog 客户端的 vendor 增改删（对齐计划 1 的 `{input}`/`{name}` 契约）。页面拆：`LibraryPage`(容器) → `LibrarySidebar` / `ListFileEditor` / `ProviderRecipeEditor` / `RepoModal`。

**Tech Stack:** React 19、AntD（Modal/Form/Select/Input/Switch/List/Tree/Button/Popconfirm/Empty）、vitest + @testing-library/react。

## Global Constraints

- ESM/NodeNext：相对 import 带 `.js`。
- 组件测试首行 `// @vitest-environment jsdom`，AntD 组件测试用 `AppProviders` 包裹。
- 错误统一走 `notify.notifyError`（计划 2）。
- 依赖前置：计划 1（vendor 增改删 API、sources、subscriptions）、计划 2（骨架/notify）、计划 3（catalog `CatalogEntry`）。
- 视觉参照：`.superpowers/brainstorm/2123-1781813518/content/library-page.html`、`library-scope.html`。
- 删除旧组件（Task 6）：`CatalogWorkspace.tsx`、`ProviderWorkspace.tsx`、`RuleProviderEditor.tsx`、`RuleProviderList.tsx`、`RuleFileWorkspace.tsx`、`SourcePicker.tsx` 及对应测试。

---

## 文件结构

| 文件 | 责任 | 动作 |
|---|---|---|
| `apps/web/src/catalog.ts` | vendor 增改删客户端（对齐 `{input}`/`{name}`） | 修改 |
| `apps/web/src/components/RepoModal.tsx` | 上游仓库 增/改 弹窗 | 新建 |
| `apps/web/src/components/LibrarySidebar.tsx` | 左栏来源管理 | 新建 |
| `apps/web/src/components/ListFileEditor.tsx` | 右栏 .list 编辑 | 新建 |
| `apps/web/src/components/ProviderRecipeEditor.tsx` | 右栏 规则源配方 | 新建 |
| `apps/web/src/components/LibraryPage.tsx` | 容器 | 重写 |
| `apps/web/src/App.tsx` | 注入 LibraryPage 所需 | 修改 |
| 对应测试 | | 新建/删除 |

---

## Task 1: catalog 客户端 vendor 增改删

**Files:**
- Modify: `apps/web/src/catalog.ts:108-129`
- Test: `apps/web/tests/catalog.test.ts`

**Interfaces:**
- Produces（对齐计划 1 的后端 `{ input }` / `{ name }`）：
  ```ts
  interface VendorRepoInput { name: string; url: string; branch?: string; catalog?: { reldir: string; kind: "domain-list" | "list-dir" | "provider-yaml" | "ini-template" } }
  addVendorRepoRequest(input: VendorRepoInput, fetcher?): Promise<void>     // POST /api/vendor/add {input}
  updateVendorRepoRequest(name: string, input: VendorRepoInput, fetcher?): Promise<void>  // POST /api/vendor/update {name,input}
  removeVendorRepoRequest(name: string, fetcher?): Promise<void>            // POST /api/vendor/remove {name}
  ```

- [ ] **Step 1: 写失败测试**

`apps/web/tests/catalog.test.ts` 追加：

```ts
it("posts vendor add with input envelope", async () => {
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response);
  await addVendorRepoRequest({ name: "G", url: "https://x.git", catalog: { reldir: "rule", kind: "list-dir" } }, fetcher);
  const [, init] = fetcher.mock.calls[0]!;
  expect(String(fetcher.mock.calls[0]![0])).toContain("/api/vendor/add");
  expect(JSON.parse(String((init as RequestInit).body))).toEqual({ input: { name: "G", url: "https://x.git", catalog: { reldir: "rule", kind: "list-dir" } } });
});

it("posts vendor update and remove", async () => {
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response);
  await updateVendorRepoRequest("G", { name: "G", url: "https://y.git" }, fetcher);
  expect(String(fetcher.mock.calls[0]![0])).toContain("/api/vendor/update");
  await removeVendorRepoRequest("G", fetcher);
  expect(String(fetcher.mock.calls[1]![0])).toContain("/api/vendor/remove");
});
```

- [ ] **Step 2: 确认失败** — `pnpm exec vitest run apps/web/tests/catalog.test.ts`（FAIL）

- [ ] **Step 3: 改实现**

`apps/web/src/catalog.ts` 把 `NewVendorRepoInput` 与 `addVendorRepoRequest`（108-129 行）替换为：

```ts
export interface VendorRepoInput {
  name: string;
  url: string;
  branch?: string;
  catalog?: { reldir: string; kind: "domain-list" | "list-dir" | "provider-yaml" | "ini-template" };
}

async function postJson(url: string, body: unknown, fetcher: Fetcher, failMsg: string): Promise<void> {
  const response = await fetcher(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { output?: string };
    throw new Error(payload.output ?? failMsg);
  }
}

export function addVendorRepoRequest(input: VendorRepoInput, fetcher: Fetcher = globalThis.fetch): Promise<void> {
  return postJson("/api/vendor/add", { input }, fetcher, "添加上游仓库失败");
}

export function updateVendorRepoRequest(name: string, input: VendorRepoInput, fetcher: Fetcher = globalThis.fetch): Promise<void> {
  return postJson("/api/vendor/update", { name, input }, fetcher, "更新上游仓库失败");
}

export function removeVendorRepoRequest(name: string, fetcher: Fetcher = globalThis.fetch): Promise<void> {
  return postJson("/api/vendor/remove", { name }, fetcher, "移除上游仓库失败");
}
```

- [ ] **Step 4: 通过 + 提交**

Run: `pnpm exec vitest run apps/web/tests/catalog.test.ts`（PASS）

```bash
git add apps/web/src/catalog.ts apps/web/tests/catalog.test.ts
git commit -m "feat(web): vendor repo add/update/remove client"
```

---

## Task 2: `RepoModal`（上游仓库 增/改 弹窗）

**Files:**
- Create: `apps/web/src/components/RepoModal.tsx`
- Test: `apps/web/tests/repoModal.test.tsx`

参照 `library-page.html` 弹窗部分。

**Interfaces:**
```ts
RepoModal(props: {
  open: boolean;
  mode: "add" | "edit";
  initial?: { name: string; url: string; branch?: string; reldir?: string; kind?: VendorRepoInput["catalog"]["kind"] };
  onSubmit: (input: VendorRepoInput) => Promise<void>;   // 内部 add/update 已在容器决定
  onClose: () => void;
}): JSX.Element
```
- 字段：名称、Git URL、分支（Input + 「钉住」Switch；不钉则留空＝默认分支）、数据类型（Select）、数据目录（仓库内相对路径）。
- **不展示** vendor 本地路径（后端自动 `vendor/<name>`）。
- 提交：组装 `VendorRepoInput`（catalog 仅当 reldir 非空时带上），调 `onSubmit`；成功 `onClose`，失败 `notifyError`。

- [ ] **Step 1: 写失败测试**

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { RepoModal } from "../src/components/RepoModal.js";

afterEach(cleanup);

it("submits assembled input and does not expose vendor path", async () => {
  const onSubmit = vi.fn(async () => {});
  render(
    <AppProviders>
      <RepoModal open mode="add" onSubmit={onSubmit} onClose={() => {}} />
    </AppProviders>,
  );
  expect(screen.queryByText(/vendor\//)).toBeNull(); // 不暴露本地路径
  fireEvent.change(screen.getByLabelText("名称"), { target: { value: "GeekX" } });
  fireEvent.change(screen.getByLabelText("Git URL"), { target: { value: "https://x.git" } });
  fireEvent.change(screen.getByLabelText("数据目录"), { target: { value: "rule" } });
  fireEvent.click(screen.getByText("保存"));
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "GeekX", url: "https://x.git", catalog: { reldir: "rule", kind: expect.any(String) } })),
  );
});
```

- [ ] **Step 2: 确认失败** — `pnpm exec vitest run apps/web/tests/repoModal.test.tsx`（FAIL）

- [ ] **Step 3: 实现 `RepoModal`**

用 AntD `Modal` + `Form`（`Form.Item label` 提供 `aria-label` 对应：名称/Git URL/分支/数据类型/数据目录）。分支用 `Input` + 旁边 `Switch`「钉住」；数据类型 `Select`（domain-list/list-dir/provider-yaml/ini-template）。提交时：

```tsx
const input: VendorRepoInput = {
  name: name.trim(),
  url: url.trim(),
  ...(pinned && branch.trim() ? { branch: branch.trim() } : {}),
  ...(reldir.trim() ? { catalog: { reldir: reldir.trim(), kind } } : {}),
};
await onSubmit(input);
```

完整实现按 Interfaces 与线框编写。

- [ ] **Step 4: 通过 + 提交**

Run: `pnpm exec vitest run apps/web/tests/repoModal.test.tsx`（PASS）

```bash
git add apps/web/src/components/RepoModal.tsx apps/web/tests/repoModal.test.tsx
git commit -m "feat(web): upstream repo add/edit modal (hidden vendor path)"
```

---

## Task 3: `LibrarySidebar`（左栏来源管理）

**Files:**
- Create: `apps/web/src/components/LibrarySidebar.tsx`
- Test: `apps/web/tests/librarySidebar.test.tsx`

参照 `library-page.html` 左栏。

**Interfaces:**
```ts
type LibrarySelection =
  | { kind: "repo"; name: string }
  | { kind: "list"; file: string }
  | { kind: "provider"; name: string };

LibrarySidebar(props: {
  repos: CatalogSourceInfo[];        // fetchCatalogSources 中 kind==="upstream"
  listFiles: string[];               // listRuleFiles
  providers: RuleProviderConfig[];   // config.ruleProviders
  selection: LibrarySelection | null;
  syncingRepo: string | null;
  onSelect: (sel: LibrarySelection) => void;
  onSyncRepo: (name: string) => void;       // 单仓库同步
  onSyncAll: () => void;                     // 全部同步
  onAddRepo: () => void;                     // 打开 RepoModal(add)
  onEditRepo: (name: string) => void;        // 打开 RepoModal(edit)
  onNewList: () => void;
  onNewProvider: () => void;
}): JSX.Element
```
- 三组分区（上游仓库 / 本地 .list / 规则源），每组带「＋」；仓库行带同步时间（`formatSyncedAt`）、⟳ 同步（spin）、⚙ 编辑、`钉 main` 标记（branch）。

- [ ] **Step 1: 写失败测试**（要点：渲染三组标题；点仓库 ⚙ → onEditRepo；点 ⟳ → onSyncRepo；点 .list 行 → onSelect({kind:"list"})）

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { LibrarySidebar } from "../src/components/LibrarySidebar.js";

afterEach(cleanup);

it("edits and syncs a repo, selects a list file", () => {
  const onEditRepo = vi.fn(); const onSyncRepo = vi.fn(); const onSelect = vi.fn();
  render(
    <AppProviders>
      <LibrarySidebar
        repos={[{ id: "ACL4SSR", label: "ACL4SSR", kind: "upstream", count: 24, syncedAt: null, browsable: true }]}
        listFiles={["Direct.list"]} providers={[]} selection={null} syncingRepo={null}
        onSelect={onSelect} onSyncRepo={onSyncRepo} onSyncAll={() => {}} onAddRepo={() => {}}
        onEditRepo={onEditRepo} onNewList={() => {}} onNewProvider={() => {}} />
    </AppProviders>,
  );
  fireEvent.click(screen.getByLabelText("编辑 ACL4SSR"));
  expect(onEditRepo).toHaveBeenCalledWith("ACL4SSR");
  fireEvent.click(screen.getByLabelText("同步 ACL4SSR"));
  expect(onSyncRepo).toHaveBeenCalledWith("ACL4SSR");
  fireEvent.click(screen.getByText("Direct.list"));
  expect(onSelect).toHaveBeenCalledWith({ kind: "list", file: "Direct.list" });
});
```

- [ ] **Step 2: 确认失败** — `pnpm exec vitest run apps/web/tests/librarySidebar.test.tsx`（FAIL）

- [ ] **Step 3: 实现 `LibrarySidebar`**（按 Interfaces；同步图标用 lucide `RefreshCw`，`className={syncingRepo===name?"spin":""}`；`aria-label` 用「同步 <name>」「编辑 <name>」）。完整实现按线框。

- [ ] **Step 4: 通过 + 提交**

Run: `pnpm exec vitest run apps/web/tests/librarySidebar.test.tsx`（PASS）

```bash
git add apps/web/src/components/LibrarySidebar.tsx apps/web/tests/librarySidebar.test.tsx apps/web/src/styles.css
git commit -m "feat(web): library sidebar (repos/list/providers)"
```

---

## Task 4: `ListFileEditor`（右栏 .list 编辑）

**Files:**
- Create: `apps/web/src/components/ListFileEditor.tsx`
- Test: `apps/web/tests/listFileEditor.test.tsx`

**Interfaces:**
```ts
ListFileEditor(props: { file: string; fetcher?: Fetcher }): JSX.Element
```
- 内部用 `loadRuleFile`/`saveRuleFile`（ruleFiles.ts）。AntD `Input.TextArea` 全高 + 「保存」按钮；保存成功/失败 `notifySuccess`/`notifyError`。

- [ ] **Step 1-3: TDD**

测试：mock fetcher 返回 `{file,text}`，渲染后 textarea 显示内容；改文本点保存调 PUT。

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { ListFileEditor } from "../src/components/ListFileEditor.js";
afterEach(cleanup);
it("loads and saves a list file", async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    ({ ok: true, json: async () => ({ file: "Direct.list", text: init?.method === "PUT" ? "DOMAIN,x.cn\n" : "DOMAIN,a.cn\n" }) }) as unknown as Response);
  render(<AppProviders><ListFileEditor file="Direct.list" fetcher={fetcher} /></AppProviders>);
  await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain("a.cn"));
  fireEvent.click(screen.getByText("保存"));
  await waitFor(() => expect(fetcher.mock.calls.some(([, i]) => (i as RequestInit)?.method === "PUT")).toBe(true));
});
```

实现：`useEffect` 载入 `loadRuleFile(file, fetcher)` → 受控 textarea；保存调 `saveRuleFile`。完整按 Interfaces。

- [ ] **Step 4: 通过 + 提交**

Run: `pnpm exec vitest run apps/web/tests/listFileEditor.test.tsx`（PASS）

```bash
git add apps/web/src/components/ListFileEditor.tsx apps/web/tests/listFileEditor.test.tsx
git commit -m "feat(web): local list file editor"
```

---

## Task 5: `ProviderRecipeEditor`（右栏 规则源配方）

**Files:**
- Create: `apps/web/src/components/ProviderRecipeEditor.tsx`
- Test: `apps/web/tests/providerRecipeEditor.test.tsx`

**Interfaces:**
```ts
ProviderRecipeEditor(props: {
  provider: RuleProviderConfig;
  onUpdate: (patch: Partial<RuleProviderConfig>) => void;        // draftActions.updateProvider
  onSetSources: (sources: RuleProviderSource[]) => void;         // draftActions.setProviderSources
  onSetListField: (field: "exclude" | "remove", values: string[]) => void;
  onDelete: () => void;
}): JSX.Element
```
- 字段：name（Input）、output（Input）、behavior（固定 domain，只读展示）、sources（列表：每条 type + name + path/entry；可增删）、exclude/remove（`Select mode="tags"`）。

- [ ] **Step 1-3: TDD**

测试要点：改 output 调 `onUpdate({output})`；删除调 `onDelete`。

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { ProviderRecipeEditor } from "../src/components/ProviderRecipeEditor.js";
afterEach(cleanup);
it("updates output", () => {
  const onUpdate = vi.fn();
  render(<AppProviders><ProviderRecipeEditor provider={{ name: "AI", output: "AI.yaml", behavior: "domain", sources: [] }}
    onUpdate={onUpdate} onSetSources={() => {}} onSetListField={() => {}} onDelete={() => {}} /></AppProviders>);
  fireEvent.change(screen.getByLabelText("输出文件名"), { target: { value: "AI2.yaml" } });
  fireEvent.blur(screen.getByLabelText("输出文件名"));
  expect(onUpdate).toHaveBeenCalledWith({ output: "AI2.yaml" });
});
```

实现：AntD `Form`/`Input`/`Select`/`List`；sources 行编辑（type 选 clash-list/clash-provider/domain-list-community，按 type 显示 path 或 entry）；删除 `Popconfirm`。完整按 Interfaces。

- [ ] **Step 4: 通过 + 提交**

Run: `pnpm exec vitest run apps/web/tests/providerRecipeEditor.test.tsx`（PASS）

```bash
git add apps/web/src/components/ProviderRecipeEditor.tsx apps/web/tests/providerRecipeEditor.test.tsx
git commit -m "feat(web): rule provider recipe editor"
```

---

## Task 6: `LibraryPage` 容器 + App 接线 + 删旧

**Files:**
- Rewrite: `apps/web/src/components/LibraryPage.tsx`
- Modify: `apps/web/src/App.tsx`、`apps/web/src/components/WorkspaceRouter.tsx`
- Delete: `CatalogWorkspace.tsx`/`ProviderWorkspace.tsx`/`RuleProviderEditor.tsx`/`RuleProviderList.tsx`/`RuleFileWorkspace.tsx`/`SourcePicker.tsx` 及测试
- Test: `apps/web/tests/libraryPage.test.tsx`

**Interfaces:**
```ts
LibraryPage(props: {
  config: RouteKitProjectConfig;
  draftActions: ReturnType<typeof useProjectDraftActions>;
  onRefreshConfig: () => void;     // vendor 变更后重载 config（写盘后 reload）
  fetcher?: Fetcher;
}): JSX.Element
```
- 内部 state：`sources`（fetchCatalogSources）、`listFiles`（listRuleFiles）、`selection`、`repoModal`({open,mode,initial})、`syncingRepo`。
- 组装：`LibrarySidebar` + 右栏按 `selection.kind` 渲染 `ListFileEditor` / `ProviderRecipeEditor` / 仓库摘要（含同步/编辑/移除）/ `Empty`。
- 仓库增改：`RepoModal` `onSubmit` → `addVendorRepoRequest`/`updateVendorRepoRequest` → 成功 `notifySuccess` + 刷新 sources + `onRefreshConfig`。移除 → `removeVendorRepoRequest` + 刷新。
- 同步：`syncCatalogVendor(fetcher, name)`（或全部）→ 刷新 sources，错误 `notifyError`。
- 新建 .list：`createRuleFileRequest` → 刷新 listFiles。新建规则源：`draftActions.createProvider()`。

- [ ] **Step 1-3: TDD**（渲染 LibraryPage，mock fetcher 提供 sources/rules，断言左栏出现仓库与 .list；选中 .list 右栏出现编辑器）

- [ ] **Step 4: App.tsx 接线**：`view==="library"` 渲染 `LibraryPage`，传 `config`、`draftActions`、`onRefreshConfig`(= 重新 `loadLocalProjectConfig` 并 `setProject(createProjectController(...))`)。更新 `WorkspaceRouter` 透传或 App 内直接按 view 渲染。

- [ ] **Step 5: 删旧组件 + 测试**

```bash
git rm apps/web/src/components/CatalogWorkspace.tsx apps/web/src/components/ProviderWorkspace.tsx apps/web/src/components/RuleProviderEditor.tsx apps/web/src/components/RuleProviderList.tsx apps/web/src/components/RuleFileWorkspace.tsx apps/web/src/components/SourcePicker.tsx
git rm apps/web/tests/catalogWorkspace.test.tsx apps/web/tests/providerWorkspace.test.tsx
```
（`RuleFileWorkspace` 的类型 `RuleFileState` 若被他处 import，迁移或就地内联。检查 `git grep RuleFileState` 清理。）

- [ ] **Step 6: 校验 + 提交**

Run: `pnpm exec vitest run apps/web/tests/libraryPage.test.tsx`（PASS）
Run: `pnpm --filter @clash-route-kit/web typecheck`（无错误）

```bash
git add apps/web/src/components/LibraryPage.tsx apps/web/src/App.tsx apps/web/src/components/WorkspaceRouter.tsx apps/web/tests/libraryPage.test.tsx
git commit -m "feat(web): rule library page (repos/list/providers manage)"
```

---

## 收尾校验

- [ ] Run: `pnpm --filter @clash-route-kit/web typecheck`　Expected: 无错误
- [ ] Run: `pnpm exec vitest run apps/web/tests/`　Expected: 全绿
- [ ] 手动 `pnpm dev`：规则库页 左栏三组、仓库 ⚙ 弹窗编辑（无 vendor 路径、可钉分支）、⟳ 同步、.list 编辑保存、规则源配方编辑。

## Self-Review 记录

- **Spec 覆盖**：spec §6（规则库全部）、§6.2（仓库弹窗 + 隐藏路径 + 钉分支）、§6.3（客户端对齐后端 API）、§9（通知）。
- **占位符**：客户端/RepoModal/编辑器逻辑给完整代码与测试；侧栏/容器的版面以契约 + 线框 + 关键代码描述。
- **类型一致性**：`VendorRepoInput`(前端) 与计划 1 后端 `VendorRepoInput` 字段一致；`LibrarySelection`、各组件 props 前后一致；provider 变换复用 `useProjectDraftActions` 既有签名。
