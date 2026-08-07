# Web Console Followups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. This plan is closed; `Execution Status` is authoritative. The detailed task bodies below are retained as historical implementation context and some were superseded by feedback.

**Goal:** 补齐 2026-06-19 Web 控制台重做计划中仍未完整覆盖的交互，并按 2026-06-23 反馈修订最终行为：导入替换/合并双模式、来源选择器跨仓库添加但移除无效分类、路由行只读展示策略且抽屉负责编辑、发布页展示当前 INI diff。

## Execution Status

- [x] Task 1：导入弹窗替换/合并双模式。
- [x] Task 2：来源选择器按反馈修订完成：保留跨仓库添加能力，移除无效的「全部 / GEOSITE / GEOIP / 规则源」分类和内置 GEOIP 列表，预览区增加滚动。
- [x] Task 3：路由行按反馈修订完成：路由行归属策略组只读展示为历史 AntD Tag 样式，规则抽屉里的归属策略组保留可编辑 Select，路由行删除入口已移除。
- [x] Task 4：发布页按反馈修订完成：不展示全仓 `git status`，改为展示当前模板 INI 相对原始配置的变更预览。
- [x] Follow-up：分节注释串联根因已修复，当前 `config/routes.yaml` 中污染的 `section` 已清理；INI 预览增加滚动。
- [x] Follow-up：缺失的 `GoogleCN_Domain.yaml`、`GameDownload_Domain.yaml`、`ProxyGFWlist_Domain.yaml` 规则源已补齐，路由页引用空规则源时显示待补全提示。
- [x] Verification：目标回归、core build、typecheck、全量测试、`pnpm check`、`pnpm generate` 均已通过。

## Closure Notes

- 详细步骤中的 `Historical step` 是原始执行草稿，不再作为待办 checklist。
- Task 2 原始的「全部 / GEOSITE / GEOIP / 规则源」分类和内置 GEOIP 列表已被反馈废弃；最终实现移除这些分类，只保留跨仓库添加与滚动预览。
- Task 3 原始的行内策略选择和行内删除已被反馈废弃；最终实现为路由行只读展示、抽屉内编辑策略、抽屉内删除。
- Task 4 原始的全仓 `git status` 展示已被反馈废弃；最终实现为当前模板 INI diff 预览，并显示增删情况。

**Architecture:** 保持当前已落地的三页结构，不恢复已删除的 `WorkspaceRouter` 或旧 workspace 组件。导入逻辑继续通过 `useProjectDraftActions` 进入纯配置 mutation；来源选择器继续复用 `catalog.ts` 客户端；发布页继续使用合并后的 `PublishLeftPanel`。顶栏“导出”按钮不是待办，发布页的 `config.yaml` 下载/二维码流程负责导出。

**Tech Stack:** TypeScript、React 19、AntD v5、lucide-react、Vitest + Testing Library、pnpm workspace。

## Global Constraints

- ESM/NodeNext：相对 import 保留显式 `.js` 后缀。
- 组件测试首行使用 `// @vitest-environment jsdom`，AntD 组件测试用 `AppProviders` 包裹。
- 错误/成功提示走 `notifyError` / `notifySuccess`。
- 不新增顶栏“导出”按钮；发布页继续承担导出 config.yaml。
- 修改文件内容使用 `apply_patch`，避免编码漂移。

---

## 文件结构

| 文件 | 责任 | 动作 |
|---|---|---|
| `apps/web/src/components/ImportModal.tsx` | 导入弹窗替换/合并双模式 | 修改 |
| `apps/web/src/App.tsx` | 按导入模式调用 `draftActions.importTemplate` 或 `draftActions.importIni` | 修改 |
| `apps/web/tests/importModal.test.tsx` | 导入双模式测试 | 修改 |
| `apps/web/src/components/SourcePickerModal.tsx` | 跨仓库搜索、预览滚动、移除无效分类 | 修改 |
| `apps/web/tests/sourcePickerModal.test.tsx` | 来源选择器完整交互测试 | 修改 |
| `apps/web/src/components/RuleRow.tsx` | 策略只读 Tag、编辑入口、待补全提示、移除行内删除 | 修改 |
| `apps/web/src/components/RuleStream.tsx` | 分节筛选保持分节标题、透传待补全提示 | 修改 |
| `apps/web/src/components/RoutingPage.tsx` | 抽屉编辑策略、抽屉删除、路由页待补全提示 | 修改 |
| `apps/web/tests/ruleRow.test.tsx` | 路由行只读策略和无行内删除测试 | 修改 |
| `apps/web/tests/ruleStream.test.tsx` | 规则流分节筛选测试 | 修改 |
| `apps/web/src/components/PublishLeftPanel.tsx` | 当前 INI diff 预览和增删统计 | 修改 |
| `apps/web/tests/publishLeftPanel.test.tsx` | INI diff 预览测试 | 修改 |

---

## Task 1: `ImportModal` 替换 / 合并双模式

**Files:**
- Modify: `apps/web/src/components/ImportModal.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/tests/importModal.test.tsx`

**Interfaces:**
- Consumes: `draftActions.importTemplate(imported)`、`draftActions.importIni(text)`、`parseIniToConfig(text)`。
- Produces: `ImportModal(props: { open; sources; onClose; onImport: (text: string, mode: "replace" | "merge") => void; fetcher? })`.

- Historical step **Step 1: 写失败测试**

在 `apps/web/tests/importModal.test.tsx` 增加合并与替换两个断言：

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { ImportModal } from "../src/components/ImportModal.js";

afterEach(cleanup);

it("imports pasted ini with merge mode", () => {
  const onImport = vi.fn();
  render(
    <AppProviders>
      <ImportModal open sources={[]} onClose={() => {}} onImport={onImport} fetcher={vi.fn()} />
    </AppProviders>,
  );
  fireEvent.click(screen.getByText("粘贴 INI"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "[custom]\nruleset=Proxy,[]FINAL" } });
  fireEvent.click(screen.getByText("合并进现有配置"));
  expect(onImport).toHaveBeenCalledWith("[custom]\nruleset=Proxy,[]FINAL", "merge");
});

it("imports pasted ini with replace mode", () => {
  const onImport = vi.fn();
  render(
    <AppProviders>
      <ImportModal open sources={[]} onClose={() => {}} onImport={onImport} fetcher={vi.fn()} />
    </AppProviders>,
  );
  fireEvent.click(screen.getByText("粘贴 INI"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "[custom]\nruleset=Proxy,[]FINAL" } });
  fireEvent.click(screen.getByText("替换现有配置"));
  expect(onImport).toHaveBeenCalledWith("[custom]\nruleset=Proxy,[]FINAL", "replace");
});
```

- Historical step **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run apps/web/tests/importModal.test.tsx`

Expected: FAIL，因为当前 `onImport` 只接收 `text`，按钮只有“覆盖导入”。

- Historical step **Step 3: 修改 `ImportModal` 接口和 footer**

把 `apps/web/src/components/ImportModal.tsx` 的 props 改为：

```ts
onImport: (text: string, mode: "replace" | "merge") => void;
```

将 `emit` 改为：

```ts
function emit(mode: "replace" | "merge") {
  if (!text.trim()) return;
  props.onImport(text, mode);
  props.onClose();
}
```

把 `Modal` 的 `okText` / `onOk` 改为自定义 footer：

```tsx
footer={[
  <Button key="cancel" onClick={props.onClose}>
    取消
  </Button>,
  <Button key="merge" onClick={() => emit("merge")}>
    合并进现有配置
  </Button>,
  <Button key="replace" type="primary" onClick={() => emit("replace")}>
    替换现有配置
  </Button>,
]}
```

若文件还未 import `Button`，把 AntD import 改为：

```ts
import { Button, Input, Modal, Segmented, Select, Space } from "antd";
```

- Historical step **Step 4: 修改 App 接线**

把 `apps/web/src/App.tsx` 的 `handleImport` 改为：

```ts
function handleImport(text: string, mode: "replace" | "merge") {
  if (mode === "merge") {
    draftActions.importIni(text);
  } else {
    draftActions.importTemplate(parseIniToConfig(text));
  }
  setImportOpen(false);
}
```

- Historical step **Step 5: 运行测试确认通过**

Run: `pnpm exec vitest run apps/web/tests/importModal.test.tsx apps/web/tests/projectController.test.ts`

Expected: PASS。

---

## Task 2: `SourcePickerModal` 类型筛选、GEOIP、跨仓库搜索

**Files:**
- Modify: `apps/web/src/components/SourcePickerModal.tsx`
- Test: `apps/web/tests/sourcePickerModal.test.tsx`

**Interfaces:**
- Consumes: `fetchCatalogSources(fetcher)`, `fetchCatalogEntries(origin, fetcher)`, `fetchCatalogDomains(origin, name, fetcher)`.
- Produces: 类型筛选 `"all" | "geosite" | "geoip" | "rule-provider"`；GEOIP 内置项 `CN` / `LAN`；搜索时跨所有可浏览上游仓库合并 entries。

- Historical step **Step 1: 写失败测试**

在 `apps/web/tests/sourcePickerModal.test.tsx` 增加测试：

```tsx
it("searches across repositories and adds a rule-provider source", async () => {
  const onAdd = vi.fn();
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/catalog/sources")) {
      return jsonResponse({
        sources: [
          { id: "domain-list-community", label: "dlc", kind: "upstream", originKind: "domain-list", count: 1, syncedAt: null, browsable: true },
          { id: "ACL4SSR", label: "ACL4SSR", kind: "upstream", originKind: "list-dir", count: 1, syncedAt: null, browsable: true },
        ],
      });
    }
    if (url.includes("origin=domain-list-community")) return jsonResponse({ entries: [{ name: "openai", hasChildren: false }] });
    if (url.includes("origin=ACL4SSR")) return jsonResponse({ entries: [{ name: "Apple", hasChildren: false }] });
    if (url.includes("/api/catalog/domains")) return jsonResponse({ domains: ["DOMAIN-SUFFIX,apple.com"] });
    return jsonResponse({});
  });
  render(
    <AppProviders>
      <SourcePickerModal open policies={["Proxy"]} defaultPolicy="Proxy" sections={[]} onAdd={onAdd} onClose={() => {}} fetcher={fetcher} />
    </AppProviders>,
  );
  await waitFor(() => expect(screen.getByPlaceholderText("搜索来源…")).toBeTruthy());
  fireEvent.change(screen.getByPlaceholderText("搜索来源…"), { target: { value: "Apple" } });
  await waitFor(() => expect(screen.getByText("Apple")).toBeTruthy());
  fireEvent.click(screen.getByText("Apple"));
  fireEvent.click(screen.getByText("添加"));
  expect(onAdd).toHaveBeenCalledWith({ type: "rule-provider", behavior: "domain", file: "Apple" }, "Proxy", undefined);
});

it("adds a GEOIP source from the built-in list", async () => {
  const onAdd = vi.fn();
  render(
    <AppProviders>
      <SourcePickerModal open policies={["DIRECT"]} defaultPolicy="DIRECT" sections={[]} onAdd={onAdd} onClose={() => {}} fetcher={makeFetcher()} />
    </AppProviders>,
  );
  await waitFor(() => expect(screen.getByText("GEOIP")).toBeTruthy());
  fireEvent.click(screen.getByText("GEOIP"));
  fireEvent.click(screen.getByText("CN"));
  fireEvent.click(screen.getByText("添加"));
  expect(onAdd).toHaveBeenCalledWith({ type: "geoip", value: "CN", noResolve: true }, "DIRECT", undefined);
});
```

- Historical step **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run apps/web/tests/sourcePickerModal.test.tsx`

Expected: FAIL，因为当前只搜索当前仓库，且没有 GEOIP 类型筛选。

- Historical step **Step 3: 实现候选模型**

在 `SourcePickerModal.tsx` 中加入：

```ts
type TypeFilter = "all" | "geosite" | "geoip" | "rule-provider";

interface PickerCandidate {
  key: string;
  origin?: string;
  originKind?: string;
  name: string;
  label: string;
  source: RuleSetSource;
}

const GEOIP_CANDIDATES: PickerCandidate[] = [
  { key: "geoip:CN", name: "CN", label: "CN", source: { type: "geoip", value: "CN", noResolve: true } },
  { key: "geoip:LAN", name: "LAN", label: "LAN", source: { type: "geoip", value: "LAN", noResolve: true } },
];
```

把 `selected` 从 `string` 改成 `PickerCandidate | null`，新增：

```ts
const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
const [crossRepoCandidates, setCrossRepoCandidates] = useState<PickerCandidate[]>([]);
```

- Historical step **Step 4: 实现跨仓库搜索**

新增 effect：

```ts
useEffect(() => {
  const q = search.trim().toLowerCase();
  if (!q) {
    setCrossRepoCandidates([]);
    return;
  }
  let alive = true;
  void Promise.all(
    sources
      .filter((s) => s.kind === "upstream" && s.browsable)
      .map(async (source) => ({
        source,
        entries: await fetchCatalogEntries(source.id, fetcher).catch(() => []),
      })),
  ).then((rows) => {
    if (!alive) return;
    const candidates = rows.flatMap(({ source, entries }) =>
      entries
        .filter((entry) => entry.name.toLowerCase().includes(q))
        .map((entry) => ({
          key: `${source.id}:${entry.name}`,
          origin: source.id,
          originKind: source.originKind,
          name: entry.name,
          label: `${entry.name} · ${source.label}`,
          source: buildSource(source.originKind, entry.name),
        })),
    );
    setCrossRepoCandidates(candidates);
  });
  return () => {
    alive = false;
  };
}, [search, sources, fetcher]);
```

- Historical step **Step 5: 实现类型筛选 UI**

在顶部 `Space` 中加入：

```tsx
<Select
  value={typeFilter}
  style={{ width: 140 }}
  options={[
    { value: "all", label: "全部" },
    { value: "geosite", label: "GEOSITE" },
    { value: "geoip", label: "GEOIP" },
    { value: "rule-provider", label: "规则源" },
  ]}
  onChange={setTypeFilter}
/>
```

列表候选按 `candidate.source.type` 过滤：

```ts
const visibleCandidates = (search.trim() ? crossRepoCandidates : currentCandidates)
  .concat(typeFilter === "geoip" || typeFilter === "all" ? GEOIP_CANDIDATES : [])
  .filter((candidate) => typeFilter === "all" || candidate.source.type === typeFilter);
```

- Historical step **Step 6: 更新添加逻辑**

添加按钮改为：

```tsx
onClick={() => {
  if (!selected) return;
  props.onAdd(selected.source, policy, section);
  props.onClose();
}}
```

域名预览 effect 仅对带 `origin` 的候选拉取：

```ts
if (!selected?.origin) {
  setDomains([]);
  return;
}
void fetchCatalogDomains(selected.origin, selected.name, fetcher)
```

- Historical step **Step 7: 运行测试确认通过**

Run: `pnpm exec vitest run apps/web/tests/sourcePickerModal.test.tsx apps/web/tests/catalog.test.ts`

Expected: PASS。

---

## Task 3: 路由行内策略切换与删除

**Files:**
- Modify: `apps/web/src/components/RuleRow.tsx`
- Modify: `apps/web/src/components/RuleStream.tsx`
- Modify: `apps/web/src/components/RoutingPage.tsx`
- Test: `apps/web/tests/ruleRow.test.tsx`
- Test: `apps/web/tests/ruleStream.test.tsx`

**Interfaces:**
- Consumes: `draftActions.updateRuleSet(ruleSetId, patch)`、`draftActions.deleteRuleSet(ruleSetId)`。
- Produces: `RuleRow` 支持 `policies`, `onPolicyChange(policy)`, `onDelete()`；`RuleStream` 支持 `policies`, `onPolicyChange(id, policy)`, `onDelete(id)`。

- Historical step **Step 1: 写失败测试**

在 `apps/web/tests/ruleRow.test.tsx` 增加：

```tsx
it("changes policy inline and deletes non-final rows", () => {
  const onPolicyChange = vi.fn();
  const onDelete = vi.fn();
  render(
    <AppProviders>
      <RuleRow
        ruleSet={ruleSet}
        sourceText="[]GEOSITE,openai"
        tone="reg"
        policies={["Proxy", "Direct"]}
        selected={false}
        onSelect={() => {}}
        onToggle={() => {}}
        onEdit={() => {}}
        onPolicyChange={onPolicyChange}
        onDelete={onDelete}
        dragHandlers={noop}
      />
    </AppProviders>,
  );
  fireEvent.mouseDown(screen.getByText("Proxy"));
  fireEvent.click(screen.getByText("Direct"));
  expect(onPolicyChange).toHaveBeenCalledWith("Direct");
  fireEvent.click(screen.getByLabelText("删除 geosite-openai"));
  expect(onDelete).toHaveBeenCalled();
});
```

- Historical step **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run apps/web/tests/ruleRow.test.tsx`

Expected: FAIL，因为当前 `RuleRow` 不接收 `policies` / `onDelete`。

- Historical step **Step 3: 修改 `RuleRow`**

把 AntD import 改为：

```ts
import { Select, Switch } from "antd";
import { GripVertical, Pencil, X } from "lucide-react";
```

在 props 中加入：

```ts
policies: string[];
onPolicyChange: (policy: string) => void;
onDelete: () => void;
```

把当前 `<Tag>` 替换为：

```tsx
<Select
  size="small"
  value={ruleSet.policy}
  options={policies.map((name) => ({ value: name, label: name }))}
  onClick={(e) => e.stopPropagation()}
  onChange={onPolicyChange}
  style={{ marginLeft: "auto", minWidth: 120 }}
/>
```

在非 FINAL 行追加删除按钮：

```tsx
{!isFinal ? (
  <button
    type="button"
    aria-label={`删除 ${ruleSet.id}`}
    className="rk-iconbtn rk-del"
    onClick={(e) => {
      e.stopPropagation();
      onDelete();
    }}
  >
    <X size={13} />
  </button>
) : null}
```

- Historical step **Step 4: 修改 `RuleStream` 与 `RoutingPage` 接线**

`RuleStream` props 加入：

```ts
policies: string[];
onPolicyChange: (id: string, policy: string) => void;
onDelete: (id: string) => void;
```

渲染 `RuleRow` 时传入：

```tsx
policies={props.policies}
onPolicyChange={(policy) => props.onPolicyChange(ruleSet.id, policy)}
onDelete={() => props.onDelete(ruleSet.id)}
```

`RoutingPage` 中 `RuleStream` 加入：

```tsx
policies={policies}
onPolicyChange={(id, policy) => draftActions.updateRuleSet(id, { policy })}
onDelete={draftActions.deleteRuleSet}
```

- Historical step **Step 5: 运行测试确认通过**

Run: `pnpm exec vitest run apps/web/tests/ruleRow.test.tsx apps/web/tests/ruleStream.test.tsx apps/web/tests/routingPage.test.tsx`

Expected: PASS。

---

## Task 4: 发布页 git status / diff 展示

**Files:**
- Modify: `apps/web/src/components/PublishLeftPanel.tsx`
- Test: `apps/web/tests/publishLeftPanel.test.tsx`

**Interfaces:**
- Consumes: `requestLocalAction("git-status", fetcher)`。
- Produces: 发布页显示当前 git status 文本；构建推送后刷新 status。

- Historical step **Step 1: 写失败测试**

在 `apps/web/tests/publishLeftPanel.test.tsx` 增加：

```tsx
it("shows git status and refreshes it after build and push", async () => {
  const calls: string[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const action = /\/api\/actions\/([\w-]+)/.exec(url)?.[1] ?? "";
    calls.push(action);
    const output = action === "git-status" ? " M config/routes.yaml" : "ok";
    return { ok: true, json: async () => ({ action, ok: true, output }) } as unknown as Response;
  });
  render(
    <AppProviders>
      <PublishLeftPanel config={config} validation={{ status: "idle", output: "" }} onRunCheck={() => {}} fetcher={fetcher} />
    </AppProviders>,
  );
  await waitFor(() => expect(screen.getByText(/config\/routes\.yaml/)).toBeTruthy());
  fireEvent.click(screen.getByText(/构建并推送/));
  await waitFor(() => expect(calls.filter((call) => call === "git-status").length).toBeGreaterThanOrEqual(2));
});
```

- Historical step **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run apps/web/tests/publishLeftPanel.test.tsx`

Expected: FAIL，因为当前页面不拉取或展示 `git-status`。

- Historical step **Step 3: 实现 status state 与刷新函数**

在 `PublishLeftPanel` 中加入：

```ts
const [gitStatus, setGitStatus] = useState("");

async function refreshGitStatus() {
  try {
    const result = await requestLocalAction("git-status", fetcher);
    setGitStatus(result.output);
  } catch (error: unknown) {
    setGitStatus(error instanceof Error ? error.message : String(error));
  }
}
```

在 mount effect 里调用：

```ts
void refreshGitStatus();
```

在 `buildAndPush()` 成功或 finally 前后调用：

```ts
await refreshGitStatus();
```

- Historical step **Step 4: 渲染 git status / diff 面板**

在 GitHub 发布 block 的构建按钮下方加入：

```tsx
<div style={{ marginTop: 12 }}>
  <div className="rk-field-label">Git 变更状态</div>
  <pre className="rk-ini" style={{ maxHeight: 140 }}>
    {gitStatus || "正在读取 git status..."}
  </pre>
</div>
```

- Historical step **Step 5: 运行测试确认通过**

Run: `pnpm exec vitest run apps/web/tests/publishLeftPanel.test.tsx apps/web/tests/publishPage.test.tsx`

Expected: PASS。

---

## 收尾校验

- Historical verification target: Run: `pnpm --filter @clash-route-kit/web typecheck`　Expected: 无错误。
- Historical verification target: Run: `pnpm exec vitest run apps/web/tests/importModal.test.tsx apps/web/tests/sourcePickerModal.test.tsx apps/web/tests/ruleRow.test.tsx apps/web/tests/ruleStream.test.tsx apps/web/tests/routingPage.test.tsx apps/web/tests/publishLeftPanel.test.tsx apps/web/tests/publishPage.test.tsx`　Expected: 全绿。
- Historical verification target: Run: `pnpm test`　Expected: 全绿。
- Historical manual target: 手动 `pnpm dev`：验证导入替换/合并、来源选择器类型筛选/GEOIP/跨仓库搜索、规则行内策略/删除、发布页 git 状态。

## Self-Review 记录

- **Spec 覆盖**：覆盖 6-19 审计后的真实剩余项；顶栏“导出”按钮明确排除，发布页继续承担 config.yaml 导出。
- **占位符**：无 TBD/TODO；每个任务包含测试、实现位置和命令。
- **类型一致性**：`ImportModal` 的 mode union、`SourcePickerModal` 的 `PickerCandidate`、`RuleRow`/`RuleStream` 回调签名、`PublishLeftPanel` 的 `gitStatus` 状态前后一致。
