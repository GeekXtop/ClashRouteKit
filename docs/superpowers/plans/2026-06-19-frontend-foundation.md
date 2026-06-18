# 前端基础（AntD + 三页骨架）实现计划（重做计划 2/5）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 引入 AntD（zh_CN + 全局通知）、把视图从 5 页改为 3 页（路由 / 规则库 / 发布）、立起新 AppShell 与三个占位页，作为计划 3-5 的承载骨架。

**Architecture:** 复用 `projectController`（纯状态机）与 `useProjectDraftActions`（逻辑层）。`main.tsx` 用 `ConfigProvider`(zhCN)+AntD `<App>` 包裹；新增 `notify` 桥把全局 `message/notification` 暴露成普通函数（React 19 静态方法需 `<App>` 上下文）。AppShell 用 AntD `Layout`，三页用占位组件，计划 3-5 再填实。

**Tech Stack:** React 19、AntD v5、vite、vitest + @testing-library/react（jsdom）。

## Global Constraints

- ESM/NodeNext：相对 import 带 `.js` 扩展名。
- 组件测试文件首行 `// @vitest-environment jsdom`，用 `@testing-library/react`，`afterEach(cleanup)`。
- 不改 `packages/core`、不改 `apps/cli`（计划 1 已覆盖后端）。
- AntD v5 配 React 19：全局 `message/notification` 必须经 `<App>` 上下文（见 Task 2）。
- 图标继续用现有 `lucide-react`（不引入 `@ant-design/icons`）。
- 旧的五页 workspace 组件（`CatalogWorkspace`/`ProviderWorkspace`/`RouteWorkspace`/`CustomProxyGroupWorkspace` 等）本计划**不删**，仅停止从路由引用；由计划 3-5 各自删除替换。

---

## 文件结构

| 文件 | 责任 | 动作 |
|---|---|---|
| `apps/web/package.json` | 加 `antd` 依赖 | 修改 |
| `apps/web/src/components/AppProviders.tsx` | ConfigProvider(zhCN)+AntD App 包裹 | 新建 |
| `apps/web/src/notify.ts` | 全局 message/notification 桥 + `notifyError` | 新建 |
| `apps/web/src/main.tsx` | 用 AppProviders 包裹 App | 修改 |
| `apps/web/src/projectController.ts` | `ProjectView` 改为 routing/library/publish | 修改 |
| `apps/web/src/components/AppShell.tsx` | AntD Layout + 三页导航 + 导入/导出 | 重写 |
| `apps/web/src/components/RoutingPage.tsx` | 路由页占位 | 新建 |
| `apps/web/src/components/LibraryPage.tsx` | 规则库页占位 | 新建 |
| `apps/web/src/components/PublishPage.tsx` | 发布页占位 | 新建 |
| `apps/web/src/components/WorkspaceRouter.tsx` | 按 3 视图分发到三页 | 重写 |
| `apps/web/src/App.tsx` | 瘦身为 骨架 + 三页 | 修改 |
| `apps/web/tests/projectController.test.ts` | 默认视图断言更新 | 修改 |
| `apps/web/tests/appShell.test.tsx` | 导航渲染/切换 | 新建 |
| `apps/web/tests/notify.test.ts` | notify 桥 | 新建 |

> 视觉保真参照已批准线框：`.superpowers/brainstorm/2123-1781813518/content/`（`routing-actions.html`、`library-page.html`、`publish-page-v5.html` 等）。

---

## Task 1: 引入 AntD + AppProviders

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/components/AppProviders.tsx`
- Modify: `apps/web/src/main.tsx`
- Test: `apps/web/tests/appProviders.test.tsx`

**Interfaces:**
- Produces: `AppProviders({ children }: { children: ReactNode }): JSX.Element` —— 用 `ConfigProvider`(locale=zhCN, 暗色 token) + AntD `App` 包裹，并挂载 `NotifyBridge`（Task 2 定义；本任务先不挂，Task 2 再加）。

- [ ] **Step 1: 加依赖**

`apps/web/package.json` 的 `dependencies` 加入：

```json
    "antd": "^5.24.0",
```

Run: `pnpm install`
Expected: 安装成功，`antd` 出现在 lockfile。

- [ ] **Step 2: 写失败测试**

`apps/web/tests/appProviders.test.tsx`：

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";

afterEach(cleanup);

describe("AppProviders", () => {
  it("renders children inside antd providers", () => {
    render(<AppProviders><span>hello-shell</span></AppProviders>);
    expect(screen.getByText("hello-shell")).toBeTruthy();
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `pnpm exec vitest run apps/web/tests/appProviders.test.tsx`
Expected: FAIL（找不到 `AppProviders`）

- [ ] **Step 4: 实现 AppProviders**

`apps/web/src/components/AppProviders.tsx`：

```tsx
import type { ReactNode } from "react";
import { App as AntApp, ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorPrimary: "#3b82f6", borderRadius: 6 },
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
```

- [ ] **Step 5: 接入 main.tsx**

`apps/web/src/main.tsx` 改为：

```tsx
import { createRoot } from "react-dom/client";
import App from "./App.js";
import { AppProviders } from "./components/AppProviders.js";
import "antd/dist/reset.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <AppProviders>
    <App />
  </AppProviders>,
);
```

- [ ] **Step 6: 运行测试 + 类型检查**

Run: `pnpm exec vitest run apps/web/tests/appProviders.test.tsx`
Expected: PASS

Run: `pnpm --filter @clash-route-kit/web typecheck`
Expected: 无错误

- [ ] **Step 7: 提交**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/components/AppProviders.tsx apps/web/src/main.tsx apps/web/tests/appProviders.test.tsx
git commit -m "feat(web): adopt antd with zhCN config provider"
```

---

## Task 2: 全局通知桥 `notify`

**Files:**
- Create: `apps/web/src/notify.ts`
- Modify: `apps/web/src/components/AppProviders.tsx`（挂 NotifyBridge）
- Test: `apps/web/tests/notify.test.ts`

**Interfaces:**
- Produces:
  - `setNotifyApi(api: { error: (content: string) => void; success: (content: string) => void } | null): void`
  - `notifyError(content: string): void` / `notifySuccess(content: string): void`（无 api 时静默）
  - `NotifyBridge(): null` —— 组件，内部 `App.useApp()` 取 `message`，`useEffect` 注册到 `setNotifyApi`。

- [ ] **Step 1: 写失败测试**

`apps/web/tests/notify.test.ts`：

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyError, notifySuccess, setNotifyApi } from "../src/notify.js";

afterEach(() => setNotifyApi(null));

describe("notify bridge", () => {
  it("routes calls to the registered api", () => {
    const error = vi.fn();
    const success = vi.fn();
    setNotifyApi({ error, success });
    notifyError("boom");
    notifySuccess("ok");
    expect(error).toHaveBeenCalledWith("boom");
    expect(success).toHaveBeenCalledWith("ok");
  });

  it("is a no-op when no api is registered", () => {
    expect(() => notifyError("x")).not.toThrow();
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm exec vitest run apps/web/tests/notify.test.ts`
Expected: FAIL（找不到 `../src/notify.js`）

- [ ] **Step 3: 实现 notify.ts**

`apps/web/src/notify.ts`：

```ts
import { useEffect } from "react";
import { App } from "antd";

interface NotifyApi {
  error: (content: string) => void;
  success: (content: string) => void;
}

let api: NotifyApi | null = null;

export function setNotifyApi(next: NotifyApi | null): void {
  api = next;
}

export function notifyError(content: string): void {
  api?.error(content);
}

export function notifySuccess(content: string): void {
  api?.success(content);
}

export function NotifyBridge(): null {
  const { message } = App.useApp();
  useEffect(() => {
    setNotifyApi({
      error: (content) => void message.error(content),
      success: (content) => void message.success(content),
    });
    return () => setNotifyApi(null);
  }, [message]);
  return null;
}
```

- [ ] **Step 4: 挂到 AppProviders**

`apps/web/src/components/AppProviders.tsx` 内 `<AntApp>` 下加入 `NotifyBridge`：

```tsx
import { NotifyBridge } from "../notify.js";
// ...
      <AntApp>
        <NotifyBridge />
        {children}
      </AntApp>
```

- [ ] **Step 5: 运行测试 + 类型检查**

Run: `pnpm exec vitest run apps/web/tests/notify.test.ts`
Expected: PASS

Run: `pnpm --filter @clash-route-kit/web typecheck`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/notify.ts apps/web/src/components/AppProviders.tsx apps/web/tests/notify.test.ts
git commit -m "feat(web): global notify bridge over antd message"
```

---

## Task 3: projectController 改三视图

**Files:**
- Modify: `apps/web/src/projectController.ts:7-12,94`
- Modify: `apps/web/src/useProjectDraftActions.ts`（旧视图字面量）
- Test: `apps/web/tests/projectController.test.ts`

**Interfaces:**
- Produces: `type ProjectView = "routing" | "library" | "publish"`；`createProjectController` 默认 `selectedView: "routing"`。

- [ ] **Step 1: 改测试（先红）**

在 `apps/web/tests/projectController.test.ts` 中，把断言默认视图为 `"catalog"` 的用例改为 `"routing"`（搜索 `selectedView` 相关断言，替换字符串）。若存在引用 `"providers"`/`"customProxyGroups"`/`"ruleSets"`/`"catalog"` 作为视图值的用例，统一更新为新三值之一（routing/library/publish）。

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm exec vitest run apps/web/tests/projectController.test.ts`
Expected: FAIL（默认仍是 "catalog"）

- [ ] **Step 3: 改类型与默认值**

`apps/web/src/projectController.ts` 第 7-12 行的 `ProjectView` 改为：

```ts
export type ProjectView = "routing" | "library" | "publish";
```

第 94 行 `selectedView: "catalog",` 改为：

```ts
    selectedView: "routing",
```

同步更新 `apps/web/src/useProjectDraftActions.ts` 中写死的旧视图字面量（否则 typecheck 报 `ProjectView` 不匹配）：
- `createRuleSet`、`addGeositeRoute`、`importIni`、`importTemplate` 里的 `selectedView: "ruleSets"` → `"routing"`
- `createCustomProxyGroup` 里的 `selectedView: "customProxyGroups"` → `"routing"`
- `createProvider` 里的 `selectedView: "providers"` → `"library"`

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm exec vitest run apps/web/tests/projectController.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/projectController.ts apps/web/src/useProjectDraftActions.ts apps/web/tests/projectController.test.ts
git commit -m "refactor(web): collapse project views to routing/library/publish"
```

---

## Task 4: 新 AppShell（AntD Layout + 三页导航）

**Files:**
- Rewrite: `apps/web/src/components/AppShell.tsx`
- Test: `apps/web/tests/appShell.test.tsx`

**Interfaces:**
- Consumes: `ProjectView`（projectController）。
- Produces:
  ```ts
  AppShell(props: {
    children: ReactNode;
    selectedView: ProjectView;
    dirty: boolean;
    onSelectView: (view: ProjectView) => void;
    onImport: () => void;
    onExport: () => void;
  }): JSX.Element
  ```
  顶栏含品牌、三页菜单（路由/规则库/发布）、右侧「导入」「导出」按钮与 dirty 标记。

- [ ] **Step 1: 写失败测试**

`apps/web/tests/appShell.test.tsx`：

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { AppShell } from "../src/components/AppShell.js";

afterEach(cleanup);

function renderShell(overrides: Partial<Parameters<typeof AppShell>[0]> = {}) {
  const onSelectView = vi.fn();
  render(
    <AppProviders>
      <AppShell
        selectedView="routing"
        dirty={false}
        onSelectView={onSelectView}
        onImport={() => {}}
        onExport={() => {}}
        {...overrides}
      >
        <div>page-body</div>
      </AppShell>
    </AppProviders>,
  );
  return { onSelectView };
}

describe("AppShell", () => {
  it("renders the three nav items and body", () => {
    renderShell();
    expect(screen.getByText("路由")).toBeTruthy();
    expect(screen.getByText("规则库")).toBeTruthy();
    expect(screen.getByText("发布")).toBeTruthy();
    expect(screen.getByText("page-body")).toBeTruthy();
  });

  it("fires onSelectView when a nav item is clicked", () => {
    const { onSelectView } = renderShell();
    fireEvent.click(screen.getByText("规则库"));
    expect(onSelectView).toHaveBeenCalledWith("library");
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm exec vitest run apps/web/tests/appShell.test.tsx`
Expected: FAIL（旧 AppShell 无「规则库」等）

- [ ] **Step 3: 重写 AppShell**

`apps/web/src/components/AppShell.tsx` 整体替换为：

```tsx
import type { ReactNode } from "react";
import { Badge, Button, Layout, Menu, Space } from "antd";
import { Download, Route, Send, Upload } from "lucide-react";
import type { ProjectView } from "../projectController.js";

const navItems: { key: ProjectView; label: string }[] = [
  { key: "routing", label: "路由" },
  { key: "library", label: "规则库" },
  { key: "publish", label: "发布" },
];

export function AppShell({
  children,
  selectedView,
  dirty,
  onSelectView,
  onImport,
  onExport,
}: {
  children: ReactNode;
  selectedView: ProjectView;
  dirty: boolean;
  onSelectView: (view: ProjectView) => void;
  onImport: () => void;
  onExport: () => void;
}) {
  return (
    <Layout style={{ height: "100vh" }}>
      <Layout.Header style={{ display: "flex", alignItems: "center", gap: 16, paddingInline: 16 }}>
        <Space style={{ color: "#fff", fontWeight: 600 }}>
          <Route size={16} /> ClashRouteKit
        </Space>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[selectedView]}
          onClick={(info) => onSelectView(info.key as ProjectView)}
          items={navItems.map((item) => ({ key: item.key, label: item.label }))}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Space>
          {dirty ? <Badge status="warning" text="未保存" /> : null}
          <Button size="small" icon={<Upload size={14} />} onClick={onImport}>
            导入
          </Button>
          <Button size="small" icon={<Download size={14} />} onClick={onExport}>
            导出
          </Button>
        </Space>
      </Layout.Header>
      <Layout.Content style={{ overflow: "hidden" }}>{children}</Layout.Content>
    </Layout>
  );
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm exec vitest run apps/web/tests/appShell.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/components/AppShell.tsx apps/web/tests/appShell.test.tsx
git commit -m "feat(web): antd app shell with three-page nav"
```

---

## Task 5: 三页占位 + Router 重写 + App 瘦身

**Files:**
- Create: `apps/web/src/components/RoutingPage.tsx`、`LibraryPage.tsx`、`PublishPage.tsx`
- Rewrite: `apps/web/src/components/WorkspaceRouter.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/tests/workspaceRouter.test.tsx`

**Interfaces:**
- Consumes: `ProjectControllerState`、`ProjectView`。
- Produces:
  - 三个占位组件：`RoutingPage()` / `LibraryPage()` / `PublishPage()`，各渲染一个标题（计划 3-5 替换实现）。
  - `WorkspaceRouter({ view }: { view: ProjectView }): JSX.Element`（按 view 渲染对应页）。

- [ ] **Step 1: 写失败测试**

`apps/web/tests/workspaceRouter.test.tsx`（覆盖旧文件内容）：

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { WorkspaceRouter } from "../src/components/WorkspaceRouter.js";

afterEach(cleanup);

describe("WorkspaceRouter", () => {
  it("renders the library page for the library view", () => {
    render(
      <AppProviders>
        <WorkspaceRouter view="library" />
      </AppProviders>,
    );
    expect(screen.getByText(/规则库/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm exec vitest run apps/web/tests/workspaceRouter.test.tsx`
Expected: FAIL（旧 WorkspaceRouter 签名不符 / 报错）

- [ ] **Step 3: 建三页占位**

`apps/web/src/components/RoutingPage.tsx`：

```tsx
import { Empty } from "antd";

export function RoutingPage() {
  return <Empty description="路由（建设中：计划 3）" style={{ paddingTop: 80 }} />;
}
```

`apps/web/src/components/LibraryPage.tsx`：

```tsx
import { Empty } from "antd";

export function LibraryPage() {
  return <Empty description="规则库（建设中：计划 4）" style={{ paddingTop: 80 }} />;
}
```

`apps/web/src/components/PublishPage.tsx`：

```tsx
import { Empty } from "antd";

export function PublishPage() {
  return <Empty description="发布（建设中：计划 5）" style={{ paddingTop: 80 }} />;
}
```

- [ ] **Step 4: 重写 WorkspaceRouter**

`apps/web/src/components/WorkspaceRouter.tsx` 整体替换为：

```tsx
import type { ProjectView } from "../projectController.js";
import { LibraryPage } from "./LibraryPage.js";
import { PublishPage } from "./PublishPage.js";
import { RoutingPage } from "./RoutingPage.js";

export function WorkspaceRouter({ view }: { view: ProjectView }) {
  if (view === "library") return <LibraryPage />;
  if (view === "publish") return <PublishPage />;
  return <RoutingPage />;
}
```

- [ ] **Step 5: 瘦身 App.tsx**

`apps/web/src/App.tsx` 整体替换为（保留项目加载 + 保存 + 选择视图；页内具体逻辑由计划 3-5 注入）：

```tsx
import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell.js";
import { WorkspaceRouter } from "./components/WorkspaceRouter.js";
import { bundledProjectConfig, bundledProjectConfigYaml } from "./config.js";
import { loadLocalProjectConfig } from "./localProject.js";
import { notifyError } from "./notify.js";
import {
  createProjectController,
  setProjectSelection,
  setProjectStatus,
} from "./projectController.js";

export default function App() {
  const [project, setProject] = useState(() =>
    createProjectController({ yaml: bundledProjectConfigYaml, config: bundledProjectConfig }),
  );

  useEffect(() => {
    let alive = true;
    setProject((current) => setProjectStatus(current, "loading", "正在读取本地 config/routes.yaml"));
    void loadLocalProjectConfig()
      .then((result) => {
        if (alive) setProject(createProjectController(result));
      })
      .catch((error: unknown) => {
        if (!alive) return;
        const message = error instanceof Error ? error.message : String(error);
        setProject((current) => setProjectStatus(current, "error", message));
        notifyError(message);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <AppShell
      dirty={project.dirty}
      selectedView={project.selectedView}
      onSelectView={(view) => setProject((current) => setProjectSelection(current, { selectedView: view }))}
      onImport={() => notifyError("导入：计划 5 接入")}
      onExport={() => notifyError("导出：计划 5 接入")}
    >
      <WorkspaceRouter view={project.selectedView} />
    </AppShell>
  );
}
```

> 计划 3-5 会把各页所需的 `useProjectDraftActions`、`renderIni`、`routeSummary`、`ruleFiles` 等按页重新接回 App.tsx 并传给对应页组件。本计划先让骨架可编译可导航。

- [ ] **Step 6: 运行测试 + 类型检查 + 构建**

Run: `pnpm exec vitest run apps/web/tests/workspaceRouter.test.tsx`
Expected: PASS

Run: `pnpm --filter @clash-route-kit/web typecheck`
Expected: 无错误（旧 workspace 组件虽未被引用但仍能编译；如根 tsconfig 开 `noUnusedLocals` 触发未用变量错，删除 App.tsx 中已不再使用的 import 即可——上面的新 App.tsx 已只保留所需 import）

Run: `pnpm --filter @clash-route-kit/web build`
Expected: 构建成功

- [ ] **Step 7: 提交**

```bash
git add apps/web/src/components/RoutingPage.tsx apps/web/src/components/LibraryPage.tsx apps/web/src/components/PublishPage.tsx apps/web/src/components/WorkspaceRouter.tsx apps/web/src/App.tsx apps/web/tests/workspaceRouter.test.tsx
git commit -m "feat(web): three-page shell with placeholder pages"
```

---

## 收尾校验（全 Task 完成后）

- [ ] Run: `pnpm --filter @clash-route-kit/web typecheck`　Expected: 无错误
- [ ] Run: `pnpm exec vitest run apps/web/tests/appProviders.test.tsx apps/web/tests/notify.test.ts apps/web/tests/appShell.test.tsx apps/web/tests/projectController.test.ts apps/web/tests/workspaceRouter.test.tsx`　Expected: 全绿
- [ ] 手动：`pnpm dev` 打开控制台，确认顶栏三页可切换、AntD 暗色样式生效、无控制台报错。

> 旧测试（`catalogWorkspace.test.tsx`/`routeWorkspace.test.tsx`/`providerWorkspace.test.tsx`/`subscribeAssembler.test.tsx`/`templateImportWizard.test.tsx` 等）对应的组件将在计划 3-5 删除，其测试一并删除——本计划暂不动它们；若此刻 `pnpm test` 全量跑因旧组件仍在而通过即可。

## Self-Review 记录

- **Spec 覆盖**：对应 spec §3（AntD 选型）、§4（5→3 页）、§9（全局通知）。三页实体留给计划 3-5。
- **占位符**：无；每个代码步给出完整文件/片段与命令。
- **类型一致性**：`ProjectView` 新三值在 projectController/AppShell/WorkspaceRouter/App 一致；`AppShell` props、`WorkspaceRouter({view})`、`notify` 三个导出签名前后一致。
