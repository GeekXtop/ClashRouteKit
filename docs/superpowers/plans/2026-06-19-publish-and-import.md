# 发布页 + 导入流程 实现计划（重做计划 5/5）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现单栏「发布」页（模板 → 发布模板 Git → 装配 config.yaml）与统一「导入」流程（模板库 .ini / 粘贴 INI → 预览 → 替换/合并）。订阅在页面内填写、不落盘，支持二维码导设备、git 构建推送、OpenClash 对照填写。

**Architecture:** 复用 `subscriptions.ts`(buildSubconverterUrl)、`publishWorkflow.ts`(fetchGitRemote/createRawUrlTemplates/action states)、`actions.ts`(requestLocalAction)、`configMutations.ts`(parseIniToConfig 经 draftActions.importIni/importTemplate)。订阅链接只存在发布页组件 state 中，不写 `routes.yaml`、不写本地文件、不发布。页面单栏竖排三块；导入是 Modal。

**Tech Stack:** React 19、AntD（Collapse/Form/Input/Select/Switch/List/Button/Modal/Segmented/QRCode 或 qrcode 包）、vitest。

> 2026-06-23 完成状态：发布页主体、构建推送入口、内存订阅装配 config.yaml、二维码、模板导入弹窗已落地；`PublishTemplateSection`/`GitPublishSection` 被合并进 `PublishLeftPanel`。未完整覆盖原计划的导入双模式与 git 状态/diff 展示已迁移到 `docs/superpowers/plans/2026-06-23-web-console-followups.md`。

## 2026-06-23 状态总览

- [x] 发布模板 URL、本机 LAN URL、GitHub raw URL 解析已在 `PublishLeftPanel` 中落地。
- [x] 构建并推送入口已串行调用 `generate`、`git-commit`、`git-push`。
- [x] `ConfigYamlSection` 已实现会话内多订阅、SubConverter 参数、下载链接和二维码。
- [x] `PublishPage` 已接线发布页单栏流程。
- [x] `fetchCatalogTemplate` 与模板/粘贴导入弹窗已实现。
- [x] 当前验证：`pnpm typecheck`、`pnpm test`、`pnpm check`、`pnpm --filter @clash-route-kit/core build` 已通过。
- [ ] 剩余功能：`ImportModal` 替换/合并双模式、发布页 git status/diff 展示，已迁移到 `2026-06-23-web-console-followups.md`。
- [ ] 非功能历史项：逐步提交记录、手动 `pnpm dev` 全流程走查、旧 `subscriptions.ts` 未用导出清理未追溯。

## Global Constraints

- ESM/NodeNext：相对 import 带 `.js`。
- 组件测试首行 `// @vitest-environment jsdom`，AntD 用 `AppProviders` 包裹。
- 错误/成功走 `notify`（计划 2）。
- 依赖前置：计划 1（catalog template）、计划 2（骨架）、计划 4（已删 SubscribeAssembler? 否——本计划删）。
- 视觉参照：`publish-page-v5.html`（单栏）。
- 删除旧组件（Task 4/5）：`PublishPanel.tsx`、`SubscribeAssembler.tsx`、`PreviewWorkspace.tsx`、`TemplateImportWizard.tsx` 及测试。
- 二维码：保留 `qrcode` 依赖；编码 `clash://install-config?url=<subconverter URL>`。

---

## 文件结构

| 文件 | 责任 | 动作 |
|---|---|---|
| `apps/web/src/catalog.ts` | 加 `fetchCatalogTemplate` | 修改 |
| `apps/web/src/components/PublishTemplateSection.tsx` | 顶部：模板 + 校验 + URL | 新建 |
| `apps/web/src/components/GitPublishSection.tsx` | ① 发布模板（构建/推送/diff/OpenClash 对照） | 新建 |
| `apps/web/src/components/ConfigYamlSection.tsx` | ② 装配 config.yaml（多订阅 + 下载/二维码） | 新建 |
| `apps/web/src/components/PublishPage.tsx` | 容器（单栏竖排） | 重写 |
| `apps/web/src/components/ImportModal.tsx` | 统一导入（模板库/粘贴 INI） | 新建 |
| `apps/web/src/App.tsx` | 发布页接线 + 导入入口（空状态 CTA + 头部） | 修改 |
| 对应测试 | | 新建/删除 |

---

## Task 1: `PublishTemplateSection`（顶部：模板 + 校验 + URL）

**Files:**
- Create: `apps/web/src/components/PublishTemplateSection.tsx`
- Test: `apps/web/tests/publishTemplateSection.test.tsx`

**Interfaces:**
```ts
PublishTemplateSection(props: {
  templateOutput: string;        // config.template.output
  publishBaseUrl: string;        // 本机 URL 根
  validation: ProjectValidationState;  // 来自 projectController
  onRunCheck: () => void;        // 触发校验（也可挂载即自动）
  fetcher?: Fetcher;
}): JSX.Element
```
- 展示模板名（只读，无下拉）、校验徽标（`✓ 引用完整` / `⚠ ...`，由 validation.status/output）。
- 两个模板 URL（各带复制）：
  - 本机：`${publishBaseUrl}/templates/${templateOutput}`
  - 发布 raw：经 `fetchGitRemote()` → `parseGitHubRemote()` → `createRawUrlTemplates(repo, templateOutput).template`（取不到则提示「先配置 git remote」）。
- 复制用 `navigator.clipboard.writeText` + `notifySuccess`。

- [ ] **Step 1-3: TDD**

测试要点：渲染显示本机 URL；mock fetcher 的 `/api/git/remote` 返回 github 地址后出现 raw URL。

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { PublishTemplateSection } from "../src/components/PublishTemplateSection.js";
afterEach(cleanup);
it("shows local and raw template urls", async () => {
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ url: "https://github.com/GeekXtop/ClashRouteKit.git" }) }) as unknown as Response);
  render(<AppProviders><PublishTemplateSection templateOutput="Custom_Clash.ini" publishBaseUrl="http://192.168.1.9:8787"
    validation={{ status: "success", output: "[check] ok" }} onRunCheck={() => {}} fetcher={fetcher} /></AppProviders>);
  expect(screen.getByText(/192\.168\.1\.9:8787\/templates\/Custom_Clash\.ini/)).toBeTruthy();
  await waitFor(() => expect(screen.getByText(/raw\.githubusercontent\.com\/GeekXtop\/ClashRouteKit\/publish\/templates\/Custom_Clash\.ini/)).toBeTruthy());
});
```

实现：`useEffect` 拉 git remote → 解析 raw URL；校验徽标按 `validation`；`onRunCheck` 可在 mount 调用一次。完整按 Interfaces + 线框。

- [ ] **Step 4: 通过 + 提交**

```bash
git add apps/web/src/components/PublishTemplateSection.tsx apps/web/tests/publishTemplateSection.test.tsx
git commit -m "feat(web): publish template section with local/raw urls"
```

---

## Task 2: `GitPublishSection`（构建/推送/diff/OpenClash 对照）

**Files:**
- Create: `apps/web/src/components/GitPublishSection.tsx`
- Test: `apps/web/tests/gitPublishSection.test.tsx`

**Interfaces:**
```ts
GitPublishSection(props: {
  rawTemplateUrl: string | null;     // 供 OpenClash 对照展示
  fetcher?: Fetcher;
}): JSX.Element
```
- 「构建并推送」按钮：顺序 `requestLocalAction("generate")` → `("git-commit")` → `("git-push")`；每步进度/结果用 `notify` + 行内状态；失败中断并 `notifyError`。
- git 状态：`requestLocalAction("git-status")` 展示（或挂载即查）。
- 变更 diff：展示 git-status 文本（精简）。
- OpenClash 对照填写清单（静态文案 + `rawTemplateUrl`）：在线订阅转换✓ / 订阅转换服务地址 / 自定义模板 URL = rawTemplateUrl / UA=clash.meta / Use Rule Provider（一句话条件说明）。

- [ ] **Step 1-3: TDD**

测试要点：点「构建并推送」依次调用 generate/git-commit/git-push。

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { GitPublishSection } from "../src/components/GitPublishSection.js";
afterEach(cleanup);
it("runs generate then commit then push", async () => {
  const calls: string[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input); const m = /\/api\/actions\/([\w-]+)/.exec(u);
    if (m) calls.push(m[1]!);
    return ({ ok: true, json: async () => ({ action: m?.[1], ok: true, output: "ok" }) }) as unknown as Response;
  });
  render(<AppProviders><GitPublishSection rawTemplateUrl="https://raw/x" fetcher={fetcher} /></AppProviders>);
  fireEvent.click(screen.getByText(/构建并推送/));
  await waitFor(() => expect(calls).toEqual(expect.arrayContaining(["generate", "git-commit", "git-push"])));
});
```

实现：串行 await 三个 `requestLocalAction`（注意 `requestLocalAction(action, fetcher)`）；OpenClash 清单静态渲染。完整按 Interfaces + 线框。

- [ ] **Step 4: 通过 + 提交**

```bash
git add apps/web/src/components/GitPublishSection.tsx apps/web/tests/gitPublishSection.test.tsx
git commit -m "feat(web): git publish section (build+push, openclash hints)"
```

---

## Task 3: `ConfigYamlSection`（多订阅 + 下载/二维码）

**Files:**
- Create: `apps/web/src/components/ConfigYamlSection.tsx`
- Test: `apps/web/tests/configYamlSection.test.tsx`

**Interfaces:**
```ts
ConfigYamlSection(props: {
  publishBaseUrl: string;
  templateOutput: string;
  subconverterUrl: string;       // config.subconverterUrl ?? 默认
}): JSX.Element
```
- 多订阅列表存在组件 state 中（行：名称 Input + URL Input + 启用 Switch + 删除；「＋ 添加订阅」），刷新页面即丢弃，不调用后端、不写本地文件。
- subconverter 端点 Input。
- 「生成 config.yaml」：`buildSubconverterUrl({ providers: subscriptions(过滤 enabled), publishBaseUrl, templateOutput, subconverterUrl })` → 得 URL；
  - 下载：`<a href={url} download="config.yaml">` 或 `Button` 包 `<a>`。
  - 二维码：`QRCode.toDataURL(`clash://install-config?url=${encodeURIComponent(url)}`)` → `<img>`。
- 提示：订阅含 token，仅本次会话、不落盘、不发布。

- [x] **Step 1-3: TDD**

测试要点：在页面添加一条订阅；填端点 + 至少一条启用订阅后「生成」产生包含 `config=`/`url=` 的链接（断言 `<a download>` 的 href 含 subconverter 域）。

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { ConfigYamlSection } from "../src/components/ConfigYamlSection.js";
afterEach(cleanup);
it("builds a subconverter download url from in-memory subscriptions", async () => {
  render(<AppProviders><ConfigYamlSection publishBaseUrl="http://127.0.0.1:8787" templateOutput="Custom_Clash.ini" subconverterUrl="http://10.0.0.3:25500/sub" /></AppProviders>);
  fireEvent.click(screen.getByText("添加订阅"));
  fireEvent.change(screen.getByPlaceholderText("订阅 URL"), { target: { value: "https://air/sub" } });
  fireEvent.click(screen.getByText("生成 config.yaml"));
  await waitFor(() => expect(screen.getByText("下载").closest("a")?.getAttribute("href")).toContain("10.0.0.3:25500/sub"));
});
```

实现：使用 `subscriptions.ts` 的 `ProviderSubscription` 结构（`{id,name,url,enabled}`），可直接传 `providers`。完整按 Interfaces + 线框。

- [ ] **Step 4: 通过 + 提交**

```bash
git add apps/web/src/components/ConfigYamlSection.tsx apps/web/tests/configYamlSection.test.tsx
git commit -m "feat(web): assemble config.yaml from native multi-subscription"
```

---

## Task 4: `PublishPage` 容器 + App 接线 + 删旧

**Files:**
- Rewrite: `apps/web/src/components/PublishPage.tsx`
- Modify: `apps/web/src/App.tsx`、`apps/web/src/components/WorkspaceRouter.tsx`
- Delete: `PublishPanel.tsx`/`SubscribeAssembler.tsx`/`PreviewWorkspace.tsx` 及测试
- Test: `apps/web/tests/publishPage.test.tsx`

**Interfaces:**
```ts
PublishPage(props: {
  config: RouteKitProjectConfig;
  validation: ProjectValidationState;
  onRunCheck: () => void;
  fetcher?: Fetcher;
}): JSX.Element
```
- 单栏竖排：`PublishTemplateSection` → `GitPublishSection` → `ConfigYamlSection`（中间用 `↓` 分隔，参照 `publish-page-v5.html`）。
- `subconverterUrl` 取 `config.subconverterUrl ?? "http://10.0.0.3:25500/sub"`。
- raw URL 在 `PublishTemplateSection` 内解析；传给 `GitPublishSection` 作 OpenClash 对照（容器层提一个 `rawTemplateUrl` state，由 template section 回调上抛，或各自 `fetchGitRemote`——择一，避免重复请求建议容器提升）。

- [x] **Step 1-3: TDD**（渲染 PublishPage，mock fetcher，断言三块标志文案存在：模板 URL、构建并推送、生成 config.yaml）

- [x] **Step 4: App 接线**：`view==="publish"` 渲染 `PublishPage`，传 `config`、`project.validation`、`onRunCheck`(=`runLocalRouteKitAction("check")`，需把该函数从旧 App 逻辑保留/恢复)。

- [ ] **Step 5: 删旧 + 提交**

```bash
git rm apps/web/src/components/PublishPanel.tsx apps/web/src/components/SubscribeAssembler.tsx apps/web/src/components/PreviewWorkspace.tsx
git rm apps/web/tests/publishPanel.test.tsx apps/web/tests/subscribeAssembler.test.tsx
```
（旧 `subscriptions.ts` 的 `parseProviderLines`/`serializeProviderSubscriptions` 若不再被引用可删，`buildSubconverterUrl` 保留；`git grep` 确认。）

Run: `pnpm exec vitest run apps/web/tests/publishPage.test.tsx`（PASS）

```bash
git add apps/web/src/components/PublishPage.tsx apps/web/src/App.tsx apps/web/src/components/WorkspaceRouter.tsx apps/web/tests/publishPage.test.tsx
git commit -m "feat(web): single-column publish page"
```

---

## Task 5: 统一导入流程 `ImportModal` + 入口

**Files:**
- Modify: `apps/web/src/catalog.ts`（加 `fetchCatalogTemplate`）
- Create: `apps/web/src/components/ImportModal.tsx`
- Modify: `apps/web/src/App.tsx`、`apps/web/src/components/RoutingPage.tsx`（空状态 CTA）
- Delete: `TemplateImportWizard.tsx` 及测试
- Test: `apps/web/tests/importModal.test.tsx`

**Interfaces:**
- `fetchCatalogTemplate(origin, name, fetcher?): Promise<string>`（GET `/api/catalog/template` → `.ini`）
- ```ts
  ImportModal(props: {
    open: boolean;
    sources: CatalogSourceInfo[];      // 含 originKind==="ini-template" 的仓库
    onClose: () => void;
    onImport: (text: string, mode: "replace" | "merge") => void;  // 接 draftActions.importTemplate/importIni
    fetcher?: Fetcher;
  }): JSX.Element
  ```
- 两个来源（`Segmented`：模板库 / 粘贴 INI）：
  - 模板库：选 ini-template 仓库 + 模板项（`fetchCatalogEntries` 列 .ini，`fetchCatalogTemplate` 取文本）。
  - 粘贴：`Input.TextArea`。
- 「替换」/「合并」两个确认按钮 → `onImport(text, mode)`。

- [ ] **Step 1: 写失败测试**（粘贴文本 + 点合并 → onImport(text,"merge")；catalog.ts 测试加 fetchCatalogTemplate）

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { ImportModal } from "../src/components/ImportModal.js";
afterEach(cleanup);
it("imports pasted ini with merge mode", () => {
  const onImport = vi.fn();
  render(<AppProviders><ImportModal open sources={[]} onClose={() => {}} onImport={onImport} fetcher={vi.fn()} /></AppProviders>);
  fireEvent.click(screen.getByText("粘贴 INI"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "[custom]\nruleset=Proxy,[]FINAL" } });
  fireEvent.click(screen.getByText("合并进现有配置"));
  expect(onImport).toHaveBeenCalledWith("[custom]\nruleset=Proxy,[]FINAL", "merge");
});
```

- [ ] **Step 2: 确认失败** — `pnpm exec vitest run apps/web/tests/importModal.test.tsx`（FAIL）

- [ ] **Step 3: 实现 `fetchCatalogTemplate` + `ImportModal`**

`apps/web/src/catalog.ts` 追加：

```ts
export async function fetchCatalogTemplate(
  origin: string,
  name: string,
  fetcher: Fetcher = globalThis.fetch,
): Promise<string> {
  const response = await fetcher(`/api/catalog/template?origin=${encodeURIComponent(origin)}&name=${encodeURIComponent(name)}`);
  const payload = (await response.json()) as { ini?: unknown };
  if (!response.ok || typeof payload.ini !== "string") {
    throw new Error("Invalid catalog template response");
  }
  return payload.ini;
}
```

`ImportModal`：AntD `Modal` + `Segmented`（["模板库","粘贴 INI"]）。模板库分支用 `sources.filter(s=>s.originKind==="ini-template")` + 选模板项；粘贴分支 `TextArea`。底部「替换现有配置」「合并进现有配置」按钮，分别 `onImport(text,"replace"|"merge")` 后 `onClose`。完整按 Interfaces。

- [ ] **Step 4: App / RoutingPage 接线**

- `App.tsx`：state `importOpen`；头部「导入」按钮 `onImport={()=>setImportOpen(true)}`（替换计划 2 的占位）；渲染 `<ImportModal open={importOpen} sources={...} onClose onImport={(text,mode)=> mode==="replace"? draftActions.importTemplate(parseIniToConfig(text)) : draftActions.importIni(text)} />`。
  > 注：`draftActions.importIni(text)` 已内部 `parseIniToConfig`；`importTemplate` 收 `ImportedConfig`，故 replace 分支用 `parseIniToConfig(text)` 转换后传入（从 core import `parseIniToConfig`）。
- `RoutingPage.tsx`：当 `config.ruleSets.length === 0 && config.customProxyGroups.length === 0` 显示空状态 CTA「从模板导入开始 / 手动新建」，点击触发导入（经 props 回调上抛到 App 的 `setImportOpen(true)`，给 RoutingPage 加可选 `onOpenImport?` prop）。

- [ ] **Step 5: 删旧 + 提交**

```bash
git rm apps/web/src/components/TemplateImportWizard.tsx apps/web/tests/templateImportWizard.test.tsx
```

Run: `pnpm exec vitest run apps/web/tests/importModal.test.tsx apps/web/tests/catalog.test.ts`（PASS）

```bash
git add apps/web/src/catalog.ts apps/web/src/components/ImportModal.tsx apps/web/src/App.tsx apps/web/src/components/RoutingPage.tsx apps/web/tests/importModal.test.tsx
git commit -m "feat(web): unified import (template library + paste ini)"
```

---

## 收尾校验（全计划完成后）

- [ ] Run: `pnpm typecheck`　Expected: 无错误
- [ ] Run: `pnpm test`　Expected: 全绿
- [ ] Run: `pnpm --filter @clash-route-kit/core build`（serve/dev 需 dist）
- [ ] Run: `pnpm check`　Expected: 退出码 0
- [ ] 手动 `pnpm dev` 全流程走查：三页可用；发布页三块（模板 URL 复制 / 构建推送 / 生成 config.yaml + 二维码）；导入弹窗（模板库 + 粘贴）；空配置时路由页 CTA。
- [ ] 清理：旧 `subscriptions.ts` 未用导出、`stylesRegression.test.ts` 若断言旧 class 需更新或删除。

## Self-Review 记录

- **Spec 覆盖**：spec §7（发布单栏：模板/Git/config.yaml）、§8（导入合并 + 空状态前置）、§9（通知）。OpenClash 对照与 Use Rule Provider 说明在 `GitPublishSection`。
- **占位符**：客户端/各 section 关键逻辑给完整代码与测试；容器/弹窗版面以契约 + 线框 + 关键代码描述。
- **类型一致性**：`ProviderSubscription` 结构直接供 `buildSubconverterUrl` 使用；`fetchCatalogTemplate`、各 section props 前后一致；导入接 `draftActions.importIni/importTemplate`（已存在）。
