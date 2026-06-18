# 路由页 + 来源选择器 实现计划（重做计划 3/5）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现合并后的「路由」页——左策略组导航 + 中有序流（行内编规则）+ 组编辑右侧 Drawer + 「添加规则」来源选择器（树/列表 + 全高域名预览）+ 底部可收起 INI 预览。

**Architecture:** 复用逻辑层 `useProjectDraftActions`、`routeSummary`、`proxyGroups`，新增 `addRoute` 通用 mutation 与 `fetchCatalogEntries` 的 `hasChildren` 解析。页面拆成小组件：`RoutingPage`(容器) → `GroupNav` / `RuleStream`(含 `RuleRow`) / `GroupDrawer` / `SourcePickerModal` / `PreviewDock`。重排用改良原生 HTML5 拖拽（零依赖）。

**Tech Stack:** React 19、AntD v5（Select/Switch/Drawer/Modal/Tree/Input/Collapse/Empty）、lucide-react、vitest + @testing-library/react。

## Global Constraints

- ESM/NodeNext：相对 import 带 `.js`。
- 组件测试首行 `// @vitest-environment jsdom`，`afterEach(cleanup)`；组件若用 AntD 交互（Drawer/Modal/Select），测试需用 `AppProviders` 包裹（提供 ConfigProvider 上下文）。
- 计划 1 已把 `/api/catalog/entries` 响应改为 `{ entries: { name, hasChildren }[] }`；本计划 Task 1 同步前端客户端。
- 视觉保真参照线框：`.superpowers/brainstorm/2123-1781813518/content/routing-actions.html`、`left-nav-edit.html`、`inline-rule-row.html`、`source-picker-tree.html`。
- 依赖前置：计划 2 已立 `RoutingPage` 占位、`AppProviders`、`notify`。本计划替换 `RoutingPage` 实现。
- 删除旧组件：`RouteWorkspace.tsx`、`CustomProxyGroupWorkspace.tsx`、`CustomProxyGroupList.tsx`、`CustomProxyGroupEditor.tsx`、`RoutePicker.tsx` 及其测试，在 Task 9 统一删除。

---

## 文件结构

| 文件 | 责任 | 动作 |
|---|---|---|
| `apps/web/src/catalog.ts` | `fetchCatalogEntries` 返回 `{name,hasChildren}[]` | 修改 |
| `apps/web/src/configMutations.ts` | 新增 `addRoute` | 修改 |
| `apps/web/src/useProjectDraftActions.ts` | 暴露 `addRoute` | 修改 |
| `apps/web/src/components/RuleRow.tsx` | 行内可编辑规则行 | 新建 |
| `apps/web/src/components/RuleStream.tsx` | 分节有序流 + 重排 + 添加 | 新建 |
| `apps/web/src/components/GroupNav.tsx` | 左栏策略组导航（点名筛选 / ✎ 编辑） | 新建 |
| `apps/web/src/components/GroupDrawer.tsx` | 右侧策略组编辑抽屉 | 新建 |
| `apps/web/src/components/SourcePickerModal.tsx` | 添加规则来源选择器 | 新建 |
| `apps/web/src/components/PreviewDock.tsx` | 底部可收起 INI 预览 | 新建 |
| `apps/web/src/components/RoutingPage.tsx` | 容器，组装上述 | 重写 |
| `apps/web/src/App.tsx` | 给 RoutingPage 注入数据/动作 | 修改 |
| 对应 `apps/web/tests/*.test.tsx` | 各组件测试 | 新建/删除 |

---

## Task 1: catalog 客户端对齐 `hasChildren`

**Files:**
- Modify: `apps/web/src/catalog.ts:9-23`
- Test: `apps/web/tests/catalog.test.ts`

**Interfaces:**
- Produces: `interface CatalogEntry { name: string; hasChildren: boolean }`；`fetchCatalogEntries(origin, fetcher?): Promise<CatalogEntry[]>`。

- [ ] **Step 1: 改测试（先红）**

在 `apps/web/tests/catalog.test.ts` 中，为 `fetchCatalogEntries` 增/改用例：

```ts
it("parses catalog entries with hasChildren", async () => {
  const fetcher = vi.fn(async () =>
    ({ ok: true, json: async () => ({ entries: [{ name: "category-acg", hasChildren: true }, { name: "openai", hasChildren: false }] }) }) as unknown as Response,
  );
  const entries = await fetchCatalogEntries("domain-list-community", fetcher);
  expect(entries).toEqual([
    { name: "category-acg", hasChildren: true },
    { name: "openai", hasChildren: false },
  ]);
});
```

（若旧用例断言返回 `string[]`，一并更新为对象数组。）

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm exec vitest run apps/web/tests/catalog.test.ts`
Expected: FAIL

- [ ] **Step 3: 改实现**

`apps/web/src/catalog.ts` 把 `CatalogEntryDetail` 上方加入：

```ts
export interface CatalogEntry {
  name: string;
  hasChildren: boolean;
}
```

并把 `fetchCatalogEntries`（9-23 行）替换为：

```ts
export async function fetchCatalogEntries(
  origin: string,
  fetcher: Fetcher = globalThis.fetch,
): Promise<CatalogEntry[]> {
  const response = await fetcher(`/api/catalog/entries?origin=${encodeURIComponent(origin)}`);
  const payload = (await response.json()) as { entries?: unknown };
  if (
    !response.ok ||
    !Array.isArray(payload.entries) ||
    !payload.entries.every(
      (entry) =>
        typeof entry === "object" && entry !== null && typeof (entry as CatalogEntry).name === "string",
    )
  ) {
    throw new Error("Invalid catalog entries response");
  }
  return (payload.entries as CatalogEntry[]).map((entry) => ({
    name: entry.name,
    hasChildren: Boolean(entry.hasChildren),
  }));
}
```

- [ ] **Step 4: 运行，确认通过 + 提交**

Run: `pnpm exec vitest run apps/web/tests/catalog.test.ts`
Expected: PASS

```bash
git add apps/web/src/catalog.ts apps/web/tests/catalog.test.ts
git commit -m "feat(web): catalog entries client carries hasChildren"
```

---

## Task 2: `addRoute` 通用 mutation

**Files:**
- Modify: `apps/web/src/configMutations.ts`
- Modify: `apps/web/src/useProjectDraftActions.ts`
- Test: `apps/web/tests/configMutations.test.ts`

**Interfaces:**
- Consumes: `addRuleSet`（同文件已有）、`RuleSet`/`RuleSetSource`（core）。
- Produces:
  - `addRoute(config, params: { source: RuleSetSource; policy: string; section?: string }): RouteKitProjectConfig`（生成唯一 id，追加到 ruleSets 末尾）
  - draftActions 暴露 `addRoute(source, policy, section?)`，成功后 `selectedView: "routing"`、选中新 ruleSet。

- [ ] **Step 1: 写失败测试**

`apps/web/tests/configMutations.test.ts` 追加：

```ts
import { addRoute } from "../src/configMutations.js";

describe("addRoute", () => {
  const cfg = {
    publishBaseUrl: "x",
    template: { output: "o.ini" },
    vendorRepos: [],
    customProxyGroups: [{ name: "Proxy", type: "select", options: [] }],
    ruleSets: [],
  } as unknown as import("@clash-route-kit/core").RouteKitProjectConfig;

  it("appends a ruleSet with a unique id and given policy/section", () => {
    const next = addRoute(cfg, { source: { type: "geosite", value: "openai" }, policy: "Proxy", section: "代理" });
    expect(next.ruleSets).toHaveLength(1);
    expect(next.ruleSets[0]).toMatchObject({ policy: "Proxy", section: "代理", source: { type: "geosite", value: "openai" } });
    expect(next.ruleSets[0]!.id).toMatch(/openai/);
  });

  it("dedupes id on collision", () => {
    const once = addRoute(cfg, { source: { type: "geosite", value: "ai" }, policy: "Proxy" });
    const twice = addRoute(once, { source: { type: "geosite", value: "ai" }, policy: "Proxy" });
    expect(twice.ruleSets[1]!.id).not.toBe(twice.ruleSets[0]!.id);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm exec vitest run apps/web/tests/configMutations.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 `addRoute`**

`apps/web/src/configMutations.ts` 追加（紧邻现有 `addRuleSet`）：

```ts
export function addRoute(
  config: RouteKitProjectConfig,
  params: { source: RuleSetSource; policy: string; section?: string },
): RouteKitProjectConfig {
  const existing = new Set(config.ruleSets.map((ruleSet) => ruleSet.id));
  const hint =
    params.source.type === "geosite" || params.source.type === "geoip"
      ? params.source.value
      : params.source.type === "rule-provider"
        ? params.source.file
        : "final";
  const base = `${params.source.type}-${hint || "entry"}`.replace(/[^A-Za-z0-9_-]+/g, "-");
  let id = base;
  let suffix = 2;
  while (existing.has(id)) id = `${base}-${suffix++}`;
  const ruleSet: RuleSet = {
    id,
    policy: params.policy,
    source: params.source,
    ...(params.section ? { section: params.section } : {}),
  };
  return addRuleSet(config, ruleSet);
}
```

确保文件顶部从 core 引入了 `RuleSetSource`（若无则加入 import）。

`apps/web/src/useProjectDraftActions.ts`：import 加入 `addRoute`，并在返回对象里加：

```ts
    addRoute(source: RuleSetSource, policy: string, section?: string) {
      setProject((current) => {
        try {
          const next = applyDraftConfig(current, addRoute(current.draftConfig, { source, policy, section }));
          const added = next.draftConfig.ruleSets.at(-1);
          return { ...dirtyMessage(next), selectedRuleSetId: added?.id ?? next.selectedRuleSetId, selectedView: "routing" };
        } catch (error: unknown) {
          return mutationError(current, error);
        }
      });
    },
```

- [ ] **Step 4: 运行，确认通过 + 提交**

Run: `pnpm exec vitest run apps/web/tests/configMutations.test.ts`
Expected: PASS

```bash
git add apps/web/src/configMutations.ts apps/web/src/useProjectDraftActions.ts apps/web/tests/configMutations.test.ts
git commit -m "feat(web): addRoute mutation for source picker"
```

---

## Task 3: `RuleRow`（行内可编辑规则行）

**Files:**
- Create: `apps/web/src/components/RuleRow.tsx`
- Test: `apps/web/tests/ruleRow.test.tsx`

参照线框 `inline-rule-row.html`。

**Interfaces:**
```ts
RuleRow(props: {
  ruleSet: RuleSet;
  sourceText: string;            // 来自 routeSummary 的来源文本
  tone: PolicyTone;
  policies: string[];            // 可选策略组名
  selected: boolean;
  onSelect: () => void;          // 点行（高亮/拖拽锚点）
  onPolicyChange: (policy: string) => void;
  onToggle: () => void;
  onDelete: () => void;
  onEditSource: () => void;      // 点 ✎
  dragHandlers: { draggable: boolean; onDragStart: () => void; onDragOver: (e: DragEvent) => void; onDrop: () => void };
}): JSX.Element
```
- FINAL 行（`ruleSet.source.type === "final"`）：隐藏开关与删除。

- [ ] **Step 1: 写失败测试**

`apps/web/tests/ruleRow.test.tsx`：

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { RuleRow } from "../src/components/RuleRow.js";
import type { RuleSet } from "@clash-route-kit/core";

afterEach(cleanup);

const ruleSet: RuleSet = { id: "geosite-openai", policy: "Proxy", source: { type: "geosite", value: "openai" } };
const noop = { draggable: true, onDragStart: () => {}, onDragOver: () => {}, onDrop: () => {} };

it("invokes onToggle and onDelete", () => {
  const onToggle = vi.fn();
  const onDelete = vi.fn();
  render(
    <AppProviders>
      <RuleRow ruleSet={ruleSet} sourceText="[]GEOSITE,openai" tone="reg" policies={["Proxy", "Direct"]}
        selected={false} onSelect={() => {}} onPolicyChange={() => {}} onToggle={onToggle} onDelete={onDelete}
        onEditSource={() => {}} dragHandlers={noop} />
    </AppProviders>,
  );
  fireEvent.click(screen.getByRole("switch"));
  expect(onToggle).toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("删除 geosite-openai"));
  expect(onDelete).toHaveBeenCalled();
});

it("hides toggle and delete for FINAL rows", () => {
  render(
    <AppProviders>
      <RuleRow ruleSet={{ id: "final", policy: "Fish", source: { type: "final" } }} sourceText="[]FINAL" tone="fin"
        policies={["Fish"]} selected={false} onSelect={() => {}} onPolicyChange={() => {}} onToggle={() => {}}
        onDelete={() => {}} onEditSource={() => {}} dragHandlers={noop} />
    </AppProviders>,
  );
  expect(screen.queryByRole("switch")).toBeNull();
});
```

- [ ] **Step 2: 运行，确认失败** — Run: `pnpm exec vitest run apps/web/tests/ruleRow.test.tsx`（FAIL：无 RuleRow）

- [ ] **Step 3: 实现 `RuleRow`**

`apps/web/src/components/RuleRow.tsx`：

```tsx
import { Select, Switch } from "antd";
import { GripVertical, Pencil, X } from "lucide-react";
import type { RuleSet } from "@clash-route-kit/core";
import type { PolicyTone } from "../proxyGroups.js";

export function RuleRow({
  ruleSet,
  sourceText,
  tone,
  policies,
  selected,
  onSelect,
  onPolicyChange,
  onToggle,
  onDelete,
  onEditSource,
  dragHandlers,
}: {
  ruleSet: RuleSet;
  sourceText: string;
  tone: PolicyTone;
  policies: string[];
  selected: boolean;
  onSelect: () => void;
  onPolicyChange: (policy: string) => void;
  onToggle: () => void;
  onDelete: () => void;
  onEditSource: () => void;
  dragHandlers: { draggable: boolean; onDragStart: () => void; onDragOver: (e: React.DragEvent) => void; onDrop: () => void };
}) {
  const isFinal = ruleSet.source.type === "final";
  return (
    <div
      data-testid={`route-row-${ruleSet.id}`}
      className={`rk-rule-row tone-${tone} ${selected ? "sel" : ""}`}
      draggable={dragHandlers.draggable}
      onDragStart={dragHandlers.onDragStart}
      onDragOver={dragHandlers.onDragOver}
      onDrop={dragHandlers.onDrop}
      onClick={onSelect}
    >
      <GripVertical size={14} className="rk-grip" />
      <span className="rk-src">{sourceText}</span>
      {!isFinal ? (
        <button type="button" aria-label={`编辑来源 ${ruleSet.id}`} className="rk-iconbtn" onClick={(e) => { e.stopPropagation(); onEditSource(); }}>
          <Pencil size={12} />
        </button>
      ) : null}
      <Select
        size="small"
        value={ruleSet.policy}
        options={policies.map((name) => ({ value: name, label: name }))}
        onClick={(e) => e.stopPropagation()}
        onChange={onPolicyChange}
        style={{ marginLeft: "auto", minWidth: 120 }}
      />
      {!isFinal ? (
        <Switch size="small" checked={ruleSet.enabled !== false} onClick={(_c, e) => e.stopPropagation()} onChange={onToggle} />
      ) : null}
      {!isFinal ? (
        <button type="button" aria-label={`删除 ${ruleSet.id}`} className="rk-iconbtn rk-del" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
          <X size={13} />
        </button>
      ) : null}
    </div>
  );
}
```

> 行的间距/颜色 token 用少量项目级 CSS（`apps/web/src/styles.css` 内新增 `.rk-rule-row` 等，参照 `inline-rule-row.html`）。AntD 暗色主题已提供底色。

- [ ] **Step 4: 运行，确认通过 + 提交**

Run: `pnpm exec vitest run apps/web/tests/ruleRow.test.tsx`（PASS）

```bash
git add apps/web/src/components/RuleRow.tsx apps/web/tests/ruleRow.test.tsx apps/web/src/styles.css
git commit -m "feat(web): inline-editable rule row"
```

---

## Task 4: `RuleStream`（分节有序流 + 重排 + 添加）

**Files:**
- Create: `apps/web/src/components/RuleStream.tsx`
- Test: `apps/web/tests/ruleStream.test.tsx`

参照 `routing-actions.html`。

**Interfaces:**
```ts
RuleStream(props: {
  ruleSets: RuleSet[];           // 已按筛选过滤后的、保持全局顺序的子集
  selectedGroup: string | null;  // null = 全部规则
  policies: string[];
  selectedRuleSetId: string;
  onSelectRuleSet: (id: string) => void;
  onPolicyChange: (id: string, policy: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEditSource: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;  // 全量顺序
  allOrderedIds: string[];       // 全局完整顺序（用于 drop 计算）
  onAddRule: () => void;         // 打开来源选择器
}): JSX.Element
```
- 按 `ruleSet.section`（默认「默认」）分节渲染，节标题为 `; <section>`。
- 头部：`有序流 · <selectedGroup||全部>` + 「＋ 给「X」添加规则 / ＋ 添加规则」按钮。
- 重排：原生 HTML5 拖拽；`onDrop` 用 `allOrderedIds` 计算新序后回调 `onReorder`。

- [ ] **Step 1: 写失败测试**

`apps/web/tests/ruleStream.test.tsx`：

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { RuleStream } from "../src/components/RuleStream.js";
import type { RuleSet } from "@clash-route-kit/core";

afterEach(cleanup);

const ruleSets: RuleSet[] = [
  { id: "a", policy: "Direct", section: "直连", source: { type: "geosite", value: "cn" } },
  { id: "b", policy: "Proxy", section: "代理", source: { type: "geosite", value: "gfw" } },
];

function setup(over: Partial<Parameters<typeof RuleStream>[0]> = {}) {
  const props = {
    ruleSets, selectedGroup: null, policies: ["Direct", "Proxy"], selectedRuleSetId: "a",
    onSelectRuleSet: vi.fn(), onPolicyChange: vi.fn(), onToggle: vi.fn(), onDelete: vi.fn(),
    onEditSource: vi.fn(), onReorder: vi.fn(), allOrderedIds: ["a", "b"], onAddRule: vi.fn(), ...over,
  };
  render(<AppProviders><RuleStream {...props} /></AppProviders>);
  return props;
}

it("renders section headers and rows", () => {
  setup();
  expect(screen.getByText("; 直连")).toBeTruthy();
  expect(screen.getByText("; 代理")).toBeTruthy();
  expect(screen.getByTestId("route-row-a")).toBeTruthy();
});

it("labels add button with the selected group", () => {
  const props = setup({ selectedGroup: "Proxy" });
  fireEvent.click(screen.getByText(/给「Proxy」添加规则/));
  expect(props.onAddRule).toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行，确认失败** — Run: `pnpm exec vitest run apps/web/tests/ruleStream.test.tsx`（FAIL）

- [ ] **Step 3: 实现 `RuleStream`**

`apps/web/src/components/RuleStream.tsx`（核心逻辑 + AntD/JSX；样式参照线框）：

```tsx
import { useRef } from "react";
import { Button } from "antd";
import { Plus } from "lucide-react";
import type { RuleSet } from "@clash-route-kit/core";
import { policyTone } from "../proxyGroups.js";
import { ruleSetSourceText } from "../routeSummary.js";
import { RuleRow } from "./RuleRow.js";

export function RuleStream(props: {
  ruleSets: RuleSet[];
  selectedGroup: string | null;
  policies: string[];
  selectedRuleSetId: string;
  onSelectRuleSet: (id: string) => void;
  onPolicyChange: (id: string, policy: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEditSource: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  allOrderedIds: string[];
  onAddRule: () => void;
}) {
  const dragId = useRef<string | null>(null);
  const sections: { label: string; rows: RuleSet[] }[] = [];
  for (const ruleSet of props.ruleSets) {
    const label = ruleSet.section?.trim() || "默认";
    const bucket = sections.find((s) => s.label === label) ?? (sections.push({ label, rows: [] }), sections.at(-1)!);
    bucket.rows.push(ruleSet);
  }

  function drop(targetId: string) {
    const id = dragId.current;
    dragId.current = null;
    if (!id || id === targetId) return;
    const ids = props.allOrderedIds.filter((x) => x !== id);
    const at = ids.indexOf(targetId);
    if (at === -1) return;
    ids.splice(at, 0, id);
    props.onReorder(ids);
  }

  return (
    <div className="rk-stream">
      <div className="rk-stream-head">
        <strong>有序流 · {props.selectedGroup ?? "全部规则"}</strong>
        <Button type="primary" size="small" icon={<Plus size={14} />} onClick={props.onAddRule}>
          {props.selectedGroup ? `给「${props.selectedGroup}」添加规则` : "添加规则"}
        </Button>
      </div>
      <div className="rk-stream-body">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="rk-section">; {section.label}</div>
            {section.rows.map((ruleSet) => (
              <RuleRow
                key={ruleSet.id}
                ruleSet={ruleSet}
                sourceText={ruleSetSourceText(ruleSet)}
                tone={ruleSet.source.type === "final" ? "fin" : policyTone(ruleSet.policy)}
                policies={props.policies}
                selected={ruleSet.id === props.selectedRuleSetId}
                onSelect={() => props.onSelectRuleSet(ruleSet.id)}
                onPolicyChange={(policy) => props.onPolicyChange(ruleSet.id, policy)}
                onToggle={() => props.onToggle(ruleSet.id)}
                onDelete={() => props.onDelete(ruleSet.id)}
                onEditSource={() => props.onEditSource(ruleSet.id)}
                dragHandlers={{
                  draggable: true,
                  onDragStart: () => (dragId.current = ruleSet.id),
                  onDragOver: (e) => e.preventDefault(),
                  onDrop: () => drop(ruleSet.id),
                }}
              />
            ))}
          </div>
        ))}
        {props.ruleSets.length === 0 ? <div className="rk-empty">没有匹配规则</div> : null}
      </div>
    </div>
  );
}
```

> 需把 `routeSummary.ts` 的 `ruleSetSourceText` 由内部函数改为 `export function ruleSetSourceText(...)`（当前是模块内私有）——在 Task 4 Step 3 一并加 `export`，并确认 `routeSummary.test.ts` 仍通过。

- [ ] **Step 4: 运行，确认通过 + 提交**

Run: `pnpm exec vitest run apps/web/tests/ruleStream.test.tsx`（PASS）

```bash
git add apps/web/src/components/RuleStream.tsx apps/web/src/routeSummary.ts apps/web/tests/ruleStream.test.tsx apps/web/src/styles.css
git commit -m "feat(web): sectioned ordered rule stream with native reorder"
```

---

## Task 5: `GroupNav`（左栏：点名筛选 / ✎ 编辑）

**Files:**
- Create: `apps/web/src/components/GroupNav.tsx`
- Test: `apps/web/tests/groupNav.test.tsx`

参照 `left-nav-edit.html`。

**Interfaces:**
```ts
GroupNav(props: {
  groups: CustomProxyGroup[];
  stats: CustomProxyGroupStat[];     // 每组入站规则数
  totalRules: number;
  selectedGroup: string | null;      // null = 全部规则
  onSelectGroup: (name: string | null) => void;  // 点名：筛选
  onEditGroup: (name: string) => void;            // 点 ✎：开 Drawer
  onCreateGroup: () => void;
}): JSX.Element
```
- 分「服务组 / 地区组」：地区组 = `type === "url-test"`，其余服务组（简单规则，后续可细化）。
- 行：组名 + 入站数；hover 出 `✎ 编辑`。顶部「全部规则 N」与「＋」。

- [ ] **Step 1: 写失败测试**

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { GroupNav } from "../src/components/GroupNav.js";
import type { CustomProxyGroup } from "@clash-route-kit/core";

afterEach(cleanup);
const groups: CustomProxyGroup[] = [
  { name: "Proxy", type: "select", options: [] },
  { name: "HK", type: "url-test", options: [], nodeFilters: ["(港|HK)"] },
];

it("click name filters, pencil edits", () => {
  const onSelectGroup = vi.fn();
  const onEditGroup = vi.fn();
  render(
    <AppProviders>
      <GroupNav groups={groups} stats={[{ name: "Proxy", ruleSets: 3, options: 0 }, { name: "HK", ruleSets: 0, options: 1 }]}
        totalRules={3} selectedGroup={null} onSelectGroup={onSelectGroup} onEditGroup={onEditGroup} onCreateGroup={() => {}} />
    </AppProviders>,
  );
  fireEvent.click(screen.getByText("Proxy"));
  expect(onSelectGroup).toHaveBeenCalledWith("Proxy");
  fireEvent.click(screen.getByLabelText("编辑 Proxy"));
  expect(onEditGroup).toHaveBeenCalledWith("Proxy");
});
```

- [ ] **Step 2: 运行，确认失败** — `pnpm exec vitest run apps/web/tests/groupNav.test.tsx`（FAIL）

- [ ] **Step 3: 实现 `GroupNav`**

`apps/web/src/components/GroupNav.tsx`（要点：点名 → `onSelectGroup`；行内 `✎`（`aria-label="编辑 <name>"`）→ `onEditGroup`；服务/地区分组；AntD `Button`/`Badge` + 项目 CSS）。完整实现按上述 props 与线框编写，确保两个交互入口分离（点名 vs 点 ✎，`stopPropagation`）。

```tsx
import { Badge, Button } from "antd";
import { Pencil, Plus } from "lucide-react";
import type { CustomProxyGroup } from "@clash-route-kit/core";
import type { CustomProxyGroupStat } from "../routeSummary.js";
import { policyTone } from "../proxyGroups.js";

export function GroupNav(props: {
  groups: CustomProxyGroup[];
  stats: CustomProxyGroupStat[];
  totalRules: number;
  selectedGroup: string | null;
  onSelectGroup: (name: string | null) => void;
  onEditGroup: (name: string) => void;
  onCreateGroup: () => void;
}) {
  const stat = new Map(props.stats.map((s) => [s.name, s]));
  const service = props.groups.filter((g) => g.type !== "url-test");
  const region = props.groups.filter((g) => g.type === "url-test");
  const Row = (g: CustomProxyGroup) => (
    <div key={g.name} className={`rk-nav-row ${props.selectedGroup === g.name ? "on" : ""}`} onClick={() => props.onSelectGroup(g.name)}>
      <span className={`rk-dot tone-${policyTone(g.name)}`} />
      <span className="rk-nav-name">{g.name}</span>
      <button type="button" aria-label={`编辑 ${g.name}`} className="rk-nav-edit" onClick={(e) => { e.stopPropagation(); props.onEditGroup(g.name); }}>
        <Pencil size={12} />
      </button>
      <span className="rk-nav-count">{g.type === "url-test" ? "url-test" : stat.get(g.name)?.ruleSets ?? 0}</span>
    </div>
  );
  return (
    <div className="rk-groupnav">
      <div className="rk-nav-head">
        <strong>策略组</strong>
        <Button size="small" type="text" aria-label="新建策略组" icon={<Plus size={16} />} onClick={props.onCreateGroup} />
      </div>
      <div className={`rk-nav-row ${props.selectedGroup === null ? "on" : ""}`} onClick={() => props.onSelectGroup(null)}>
        <span className="rk-nav-name">全部规则</span>
        <span className="rk-nav-count">{props.totalRules}</span>
      </div>
      <div className="rk-nav-sec">服务组</div>
      {service.map(Row)}
      <div className="rk-nav-sec">地区组</div>
      {region.map(Row)}
    </div>
  );
}
```

- [ ] **Step 4: 运行，确认通过 + 提交**

Run: `pnpm exec vitest run apps/web/tests/groupNav.test.tsx`（PASS）

```bash
git add apps/web/src/components/GroupNav.tsx apps/web/tests/groupNav.test.tsx apps/web/src/styles.css
git commit -m "feat(web): group nav with filter vs edit separation"
```

---

## Task 6: `GroupDrawer`（策略组编辑抽屉）

**Files:**
- Create: `apps/web/src/components/GroupDrawer.tsx`
- Test: `apps/web/tests/groupDrawer.test.tsx`

**Interfaces:**
```ts
GroupDrawer(props: {
  open: boolean;
  group: CustomProxyGroup | undefined;
  groups: CustomProxyGroup[];        // 供成员下拉（其它组 + DIRECT/REJECT）
  inbound: InboundRuleSetRow[];      // selectInboundRuleSets 结果
  onClose: () => void;
  onUpdate: (patch: Partial<CustomProxyGroup>) => void;
  onRename: (next: string) => void;
  onSetListField: (field: "options" | "nodeFilters", values: string[]) => void;
  onDelete: () => void;
  onJumpToRule: (id: string) => void;
}): JSX.Element
```
- 字段：名称（rename）、类型（Select：select/url-test/fallback/load-balance）、成员 options（AntD `Select mode=multiple` 或可重排列表，候选 = 其它组名 + DIRECT/REJECT）、nodeFilters（多值输入）、url-test 时显示 url/interval/tolerance、底部「命中此组的规则」列表（点跳转）+ 删除。

- [ ] **Step 1-2: 写失败测试并确认失败**

`apps/web/tests/groupDrawer.test.tsx`（要点：`open` 时渲染组名、改类型回调 `onUpdate({type})`、点 inbound 行回调 `onJumpToRule`）：

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { GroupDrawer } from "../src/components/GroupDrawer.js";

afterEach(cleanup);

it("shows the group name and routes inbound jumps", () => {
  const onJumpToRule = vi.fn();
  render(
    <AppProviders>
      <GroupDrawer open group={{ name: "Proxy", type: "select", options: ["Direct"] }} groups={[{ name: "Proxy", type: "select", options: [] }]}
        inbound={[{ id: "geosite-gfw", enabled: true, source: "[]GEOSITE,gfw" }]} onClose={() => {}} onUpdate={() => {}}
        onRename={() => {}} onSetListField={() => {}} onDelete={() => {}} onJumpToRule={onJumpToRule} />
    </AppProviders>,
  );
  expect(screen.getByDisplayValue("Proxy")).toBeTruthy();
  fireEvent.click(screen.getByText("geosite-gfw"));
  expect(onJumpToRule).toHaveBeenCalledWith("geosite-gfw");
});
```

Run: `pnpm exec vitest run apps/web/tests/groupDrawer.test.tsx`（FAIL）

- [ ] **Step 3: 实现 `GroupDrawer`**

用 AntD `Drawer`（`placement="right"` `width={420}` `open={props.open}` `onClose`）。内部用 `Form`/`Input`/`Select`/`InputNumber` 渲染字段；成员候选 = `groups.filter(g=>g.name!==group.name).map(name) + ["DIRECT","REJECT"]`；nodeFilters 用 `Select mode="tags"`；inbound 列表每行 `onClick={() => onJumpToRule(row.id)}` 显示 `row.id`。改动即调对应回调（受控）。名称用 `Input` `onBlur`→`onRename`。删除用 `Popconfirm`→`onDelete`。完整实现按 props 与 spec §5.2 编写。

- [ ] **Step 4: 运行，确认通过 + 提交**

Run: `pnpm exec vitest run apps/web/tests/groupDrawer.test.tsx`（PASS）

```bash
git add apps/web/src/components/GroupDrawer.tsx apps/web/tests/groupDrawer.test.tsx
git commit -m "feat(web): group editor drawer"
```

---

## Task 7: `SourcePickerModal`（添加规则来源选择器）

**Files:**
- Create: `apps/web/src/components/SourcePickerModal.tsx`
- Test: `apps/web/tests/sourcePickerModal.test.tsx`

参照 `source-picker-tree.html`。

**Interfaces:**
```ts
SourcePickerModal(props: {
  open: boolean;
  policies: string[];
  defaultPolicy: string;       // 预填当前选中组
  sections: string[];          // 现有分节，供选择/新建
  onAdd: (source: RuleSetSource, policy: string, section?: string) => void;
  onClose: () => void;
  fetcher?: Fetcher;
}): JSX.Element
```
- 顶部：搜索 + 类型筛选（全部/GEOSITE/GEOIP/列表/规则源）+ 仓库筛选。
- 左：搜索空 = AntD `Tree`（domain-list-community：节点 `isLeaf = !hasChildren`，懒加载子项用 `fetchCatalogEntry().includes`）；搜索有输入 = 扁平 `List`（跨仓库 `fetchCatalogEntries` + 客户端过滤）。
- 右：选中项 `fetchCatalogDomains` 全高预览（AntD 虚拟 `List` 或简单滚动容器 + `formatDomainRule`）。
- 底：归属策略组（`Select`，默认 `defaultPolicy`）+ 分节（`Select` 可输入）+「添加」→ 组装 `RuleSetSource` 调 `onAdd`。

- [ ] **Step 1: 写失败测试**

`apps/web/tests/sourcePickerModal.test.tsx`（要点：树渲染 `hasChildren` 决定可展开；选中 GEOSITE 项 + 点添加 → `onAdd({type:"geosite",value},policy)`）：

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { SourcePickerModal } from "../src/components/SourcePickerModal.js";

afterEach(cleanup);

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}
function makeFetcher() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/catalog/sources")) return jsonResponse({ sources: [{ id: "domain-list-community", label: "dlc", kind: "upstream", originKind: "domain-list", count: 2, syncedAt: null, browsable: true }] });
    if (url.includes("/api/catalog/entries")) return jsonResponse({ entries: [{ name: "openai", hasChildren: false }, { name: "category-acg", hasChildren: true }] });
    if (url.includes("/api/catalog/domains")) return jsonResponse({ domains: ["DOMAIN-SUFFIX,openai.com"] });
    return jsonResponse({});
  });
}

it("adds a geosite source with prefilled policy", async () => {
  const onAdd = vi.fn();
  render(
    <AppProviders>
      <SourcePickerModal open policies={["Proxy", "Direct"]} defaultPolicy="Proxy" sections={["代理"]} onAdd={onAdd} onClose={() => {}} fetcher={makeFetcher()} />
    </AppProviders>,
  );
  await waitFor(() => expect(screen.getByText("openai")).toBeTruthy());
  fireEvent.click(screen.getByText("openai"));
  fireEvent.click(screen.getByText("添加"));
  await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ type: "geosite", value: "openai" }, "Proxy", expect.anything()));
});
```

- [ ] **Step 2: 运行，确认失败** — `pnpm exec vitest run apps/web/tests/sourcePickerModal.test.tsx`（FAIL）

- [ ] **Step 3: 实现 `SourcePickerModal`**

用 AntD `Modal`（`width={860}`）。状态：`search`、`typeFilter`、`repoFilter`、`selected`(来源候选)、`domains`。逻辑：
- `useEffect` 拉 `fetchCatalogSources`；按选中仓库 `fetchCatalogEntries(origin)`。
- 浏览态（search 空且仓库为 domain-list）：`Tree` `treeData` 由顶层 entries 映射，`isLeaf: !hasChildren`；`loadData` 用 `fetchCatalogEntry(origin, node.name).includes` 生成子节点。
- 搜索态：跨仓库合并 entries → 过滤 `name.includes(search)` → 扁平 `List`，每项带类型徽标。
- 选中项 → `fetchCatalogDomains` 填右侧预览。
- GEOIP 走内置（如 CN/LAN 列表或文本输入）；列表/规则源选中后按类型组装 `RuleSetSource`。
- 「添加」按 `selected` 类型组装：GEOSITE→`{type:"geosite",value}`；GEOIP→`{type:"geoip",value}`；列表/规则源→`{type:"rule-provider",behavior:"domain",file}`（具体映射在实现时按来源种类定），调 `onAdd(source, policy, section)`。

完整实现按 props 与线框 `source-picker-tree.html` 编写。

- [ ] **Step 4: 运行，确认通过 + 提交**

Run: `pnpm exec vitest run apps/web/tests/sourcePickerModal.test.tsx`（PASS）

```bash
git add apps/web/src/components/SourcePickerModal.tsx apps/web/tests/sourcePickerModal.test.tsx
git commit -m "feat(web): add-rule source picker (tree + flat + domain preview)"
```

---

## Task 8: `PreviewDock`（底部可收起 INI 预览）

**Files:**
- Create: `apps/web/src/components/PreviewDock.tsx`
- Test: `apps/web/tests/previewDock.test.tsx`

**Interfaces:**
```ts
PreviewDock(props: { ini: string }): JSX.Element
```
- AntD `Collapse`（默认收起），展开显示 `ini`（`<pre>` 等宽滚动）。

- [ ] **Step 1-3: TDD**

测试：默认收起不显示完整 ini；点标题展开后出现某行。实现用 `Collapse` items=[{key:"ini",label:"INI 预览",children:<pre>{ini}</pre>}]。

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { PreviewDock } from "../src/components/PreviewDock.js";
afterEach(cleanup);
it("expands to show ini", () => {
  render(<AppProviders><PreviewDock ini={"[custom]\nruleset=Proxy,[]FINAL"} /></AppProviders>);
  fireEvent.click(screen.getByText("INI 预览"));
  expect(screen.getByText(/ruleset=Proxy/)).toBeTruthy();
});
```

实现：

```tsx
import { Collapse } from "antd";

export function PreviewDock({ ini }: { ini: string }) {
  return (
    <Collapse
      className="rk-preview-dock"
      items={[{ key: "ini", label: "INI 预览", children: <pre className="rk-ini">{ini}</pre> }]}
    />
  );
}
```

- [ ] **Step 4: 通过 + 提交**

Run: `pnpm exec vitest run apps/web/tests/previewDock.test.tsx`（PASS）

```bash
git add apps/web/src/components/PreviewDock.tsx apps/web/tests/previewDock.test.tsx apps/web/src/styles.css
git commit -m "feat(web): collapsible ini preview dock"
```

---

## Task 9: `RoutingPage` 容器 + App 接线 + 删除旧组件

**Files:**
- Rewrite: `apps/web/src/components/RoutingPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Delete: `RouteWorkspace.tsx`/`CustomProxyGroupWorkspace.tsx`/`CustomProxyGroupList.tsx`/`CustomProxyGroupEditor.tsx`/`RoutePicker.tsx` 及对应测试
- Test: `apps/web/tests/routingPage.test.tsx`

**Interfaces:**
```ts
RoutingPage(props: {
  config: RouteKitProjectConfig;
  iniPreview: string;
  stats: CustomProxyGroupStat[];
  selectedRuleSetId: string;
  draftActions: ReturnType<typeof useProjectDraftActions>;
  fetcher?: Fetcher;
}): JSX.Element
```
- 内部 state：`selectedGroup`(筛选)、`drawerGroup`(编辑中的组名|null)、`pickerOpen`。
- 组装：`GroupNav`（onSelectGroup→setSelectedGroup；onEditGroup→setDrawerGroup；onCreateGroup→draftActions.createCustomProxyGroup）、`RuleStream`（按 selectedGroup 过滤 config.ruleSets，policies、回调接 draftActions）、`GroupDrawer`（drawerGroup）、`SourcePickerModal`（pickerOpen，onAdd→draftActions.addRoute）、`PreviewDock`（iniPreview）。
- 布局：CSS grid 两栏（左 nav 固定宽 + 中 stream 自适应），Drawer 覆盖右侧，dock 吸底。

- [ ] **Step 1: 写失败测试**

`apps/web/tests/routingPage.test.tsx`：渲染 RoutingPage（用最小 config + 真实 `useProjectDraftActions` 经 `renderHook` 或传入 mock 对象），断言左栏出现组名、中栏出现规则行、点「全部规则」可见所有行。（用 `AppProviders` 包裹。）

- [ ] **Step 2: 运行，确认失败**

- [ ] **Step 3: 实现 RoutingPage**（组装上述子组件，完整代码按 Interfaces）

- [ ] **Step 4: App.tsx 接线**

在 `App.tsx` 重新引入路由页所需：`useProjectDraftActions(setProject)`、`renderIni(config)`、`createCustomProxyGroupStats(config)`，把 `RoutingPage` 经 `WorkspaceRouter` 或直接在 `view==="routing"` 渲染并传入 props。（更新 `WorkspaceRouter` 以接受并透传这些 props，或在 App 内按 view 直接渲染三页——二选一，保持与计划 2 的 `WorkspaceRouter({view})` 兼容：扩展其 props 传 routing 所需对象。）

- [ ] **Step 5: 删除旧组件 + 测试**

```bash
git rm apps/web/src/components/RouteWorkspace.tsx apps/web/src/components/CustomProxyGroupWorkspace.tsx apps/web/src/components/CustomProxyGroupList.tsx apps/web/src/components/CustomProxyGroupEditor.tsx apps/web/src/components/RoutePicker.tsx
git rm apps/web/tests/routeWorkspace.test.tsx apps/web/tests/customProxyGroupList.test.tsx apps/web/tests/customProxyGroupEditor.test.tsx apps/web/tests/routePicker.test.tsx
```

- [ ] **Step 6: 校验 + 提交**

Run: `pnpm exec vitest run apps/web/tests/routingPage.test.tsx`（PASS）
Run: `pnpm --filter @clash-route-kit/web typecheck`（无错误；若有对已删组件的悬挂引用，清理之）

```bash
git add apps/web/src/components/RoutingPage.tsx apps/web/src/App.tsx apps/web/src/components/WorkspaceRouter.tsx apps/web/tests/routingPage.test.tsx
git commit -m "feat(web): routing page (groups + rule stream + drawer + picker)"
```

---

## 收尾校验

- [ ] Run: `pnpm --filter @clash-route-kit/web typecheck`　Expected: 无错误
- [ ] Run: `pnpm exec vitest run apps/web/tests/`　Expected: 全绿（已删旧组件测试）
- [ ] 手动 `pnpm dev`：路由页 左栏点名筛选、点 ✎ 开 Drawer、行内改归属/开关/删除、拖拽重排、＋添加规则走选择器（树/搜索/预览）、底部预览可收起。对照线框。

## Self-Review 记录

- **Spec 覆盖**：spec §5（路由页全部）、§5.3（来源选择器树/列表/预览，修 category bug）、§5.2（组 Drawer）。
- **占位符**：逻辑/契约/测试均给完整代码；纯版面（GroupDrawer/SourcePickerModal/RoutingPage 的细节样式）以 props 契约 + 线框引用 + 关键代码描述，执行时照契约补全（非 "TBD"）。
- **类型一致性**：`CatalogEntry`、`addRoute`、`ruleSetSourceText`(export)、各组件 props 在定义与调用处一致；`RuleSetSource`/`CustomProxyGroup`/`InboundRuleSetRow` 取自 core/routeSummary。
