# ClashRouteKit 控制台重设计 · 计划 4/4：Web 控制台对齐到 5 标签 IA

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans（建议 inline 执行）to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把进行中的 web 重构对齐到最终 5 标签信息架构【① 规则目录 → ② 规则源 → ③ 策略组 → ④ 路由 → ⑤ 发布】，并补上唯一缺失的「规则目录」页。

**Architecture:** web 已实现约 80% 目标结构 —— `WorkspaceRouter` 按 `projectController` 的 `selectedView` 分发，已有 `ProviderWorkspace`/`CustomProxyGroupWorkspace`/`RuleSetList+Editor`/`RuleFileWorkspace`/`PublishPanel`/`PreviewWorkspace`；状态走 `draftConfig`（脏检查 + 保存到 `/api/project/config`）；本地 dev API 在 `apps/web/dev/routeKitApi.ts`（配置/规则文件/动作端点，均为可注入依赖的纯函数）。本计划是**增量对齐**，不是重写。

**执行方式说明（重要）:** 因 web 是活跃重构中的代码（组件随时可能微调），本计划分两层：
- **A. 基础层（全量 TDD 代码）** —— 导航/视图重排、删概览、新增 mutation（拖动重排 / 全局移除 / 模板字段）、「规则目录」本地 API 与纯函数。这些已对着真实代码核实，给完整步骤。
- **B. 页面 UI 对齐（变更规格）** —— 6 个页面级工作项，给出文件、要做的改动、测试点；执行时**先读当前活组件**再落码（mid-refactor，不宜盲跑 subagent）。

**Tech Stack:** React 19 + TypeScript（NodeNext）、vitest、vite dev middleware。

**前置：** 计划 1（`RuleSet.section`/`template` 开关/`globalRemove`）+ 计划 2（`parseDomainListEntry`/`parseIniToConfig`）+ 计划 3 已合并。

---

## 现状 → 目标映射（已核实）

| 当前 selectedView / 组件 | 目标 5 标签 | 处置 |
|---|---|---|
| `project` / ProjectWorkspace（[AppShell:22](apps/web/src/components/AppShell.tsx#L22)） | —— | **删除**（输出名/开关并入发布；无效信息去掉） |
| —— | ① 规则目录 | **新建** CatalogWorkspace + 本地 API |
| `providers` / ProviderWorkspace | ② 规则源 | 改造（全局移除 + 被引用；本地 .list 移走） |
| `customProxyGroups` / CustomProxyGroupWorkspace | ③ 策略组 | 改造（引用图选择器 + 地区预设 + 嵌套树 + 多订阅筛选） |
| `ruleSets` / RuleSetList+Editor | ④ 路由 | 改造（三列 + 段 + 拖动 + category 选择器 + 导入 INI） |
| `rules` / RuleFileWorkspace | —— | **并入①规则目录**（本地 .list 编辑） |
| `preview` / PreviewWorkspace | —— | **并入④路由**右栏（实时 INI 预览，不再独立标签） |
| `publish` / PublishPanel | ⑤ 发布 | 改造（纵向叙事 + 仓库自动探测 + 模板设置内置） |

---

# A. 基础层（全量 TDD 代码）

## Task A1：新增 mutation —— reorderRuleSets / setGlobalRemove / setTemplateField

**Files:**
- Modify: `apps/web/src/configMutations.ts`
- Test: `apps/web/tests/configMutations.test.ts`

- [ ] **Step 1: 写失败测试**

在 `apps/web/tests/configMutations.test.ts` 追加：

```ts
import {
  reorderRuleSets,
  setGlobalRemove,
  setTemplateField,
} from "../src/configMutations.js";

const baseConfig = {
  publishBaseUrl: "http://127.0.0.1:8787",
  template: { output: "Custom_Clash.ini" },
  vendorRepos: [],
  customProxyGroups: [],
  ruleSets: [
    { id: "a", policy: "AI", source: { type: "geosite", value: "openai" } },
    { id: "b", policy: "AI", source: { type: "geosite", value: "anthropic" } },
    { id: "final", policy: "AI", source: { type: "final" } },
  ],
  ruleProviders: [],
} as const;

it("reorders ruleSets to match the given id order", () => {
  const next = reorderRuleSets(baseConfig, ["b", "a", "final"]);
  expect(next.ruleSets.map((r) => r.id)).toEqual(["b", "a", "final"]);
});

it("ignores unknown ids and keeps the rest in original order", () => {
  const next = reorderRuleSets(baseConfig, ["b"]);
  expect(next.ruleSets.map((r) => r.id)).toEqual(["b", "a", "final"]);
});

it("sets a normalized globalRemove list", () => {
  const next = setGlobalRemove(baseConfig, [" ban.example ", "ban.example", ""]);
  expect(next.globalRemove).toEqual(["ban.example"]);
});

it("patches template fields without dropping output", () => {
  const next = setTemplateField(baseConfig, { clashRuleBase: "https://x/Base.yml" });
  expect(next.template).toEqual({ output: "Custom_Clash.ini", clashRuleBase: "https://x/Base.yml" });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/web/tests/configMutations.test.ts -t "reorder"`
Expected: FAIL（函数未定义）。

- [ ] **Step 3: 实现三个 mutation**

在 `apps/web/src/configMutations.ts` 末尾追加（复用文件内 `normalizeList`）：

```ts
export function reorderRuleSets(
  config: RouteKitProjectConfig,
  orderedIds: string[],
): RouteKitProjectConfig {
  const byId = new Map(config.ruleSets.map((ruleSet) => [ruleSet.id, ruleSet]));
  const seen = new Set<string>();
  const ordered: typeof config.ruleSets = [];
  for (const id of orderedIds) {
    const ruleSet = byId.get(id);
    if (ruleSet && !seen.has(id)) {
      ordered.push(ruleSet);
      seen.add(id);
    }
  }
  for (const ruleSet of config.ruleSets) {
    if (!seen.has(ruleSet.id)) ordered.push(ruleSet);
  }
  return { ...config, ruleSets: ordered };
}

export function setGlobalRemove(
  config: RouteKitProjectConfig,
  values: string[],
): RouteKitProjectConfig {
  return { ...config, globalRemove: normalizeList(values) };
}

export function setTemplateField(
  config: RouteKitProjectConfig,
  patch: Partial<RouteKitProjectConfig["template"]>,
): RouteKitProjectConfig {
  return { ...config, template: { ...config.template, ...patch } };
}
```

- [ ] **Step 4: 运行确认通过 + 提交**

Run: `pnpm exec vitest run apps/web/tests/configMutations.test.ts`
Expected: PASS。

```bash
git add apps/web/src/configMutations.ts apps/web/tests/configMutations.test.ts
git commit -m "feat(web): add reorderRuleSets/setGlobalRemove/setTemplateField mutations"
```

> 说明：`section` 跨段拖动复用既有 `updateRuleSet(id, { section })`（[configMutations.ts:85](apps/web/src/configMutations.ts#L85) 的 `Partial<RuleSet>` 已含 `section`），无需新 mutation。

---

## Task A2：导航与视图重排为 5 标签、删除概览

**Files:**
- Modify: `apps/web/src/projectController.ts:7-14`（`ProjectView` 联合 + 默认 view）
- Modify: `apps/web/src/components/AppShell.tsx:21-29`（`navItems`）
- Modify: `apps/web/src/components/WorkspaceRouter.tsx`（分发分支）
- Delete: `apps/web/src/components/ProjectWorkspace.tsx`
- Test: `apps/web/tests/projectController.test.ts`

- [ ] **Step 1: 写失败测试**

在 `apps/web/tests/projectController.test.ts` 追加（断言默认落地页与不再含 `project`）：

```ts
it("defaults the landing view to catalog", () => {
  const controller = createProjectController({ yaml: sampleYaml, config: sampleConfig });
  expect(controller.selectedView).toBe("catalog");
});
```

（`sampleYaml`/`sampleConfig` 沿用该测试文件已有夹具；若无则用 configDocument 测试里的最小 yaml 经 `parseRouteKitConfig` 构造。）

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/web/tests/projectController.test.ts -t "landing view"`
Expected: FAIL（当前默认 `ruleSets`）。

- [ ] **Step 3: 改 ProjectView 联合与默认 view**

把 `apps/web/src/projectController.ts:7-14` 的 `ProjectView` 改为：

```ts
export type ProjectView =
  | "catalog"
  | "providers"
  | "customProxyGroups"
  | "ruleSets"
  | "publish";
```

把 `createProjectController` 里 `selectedView: "ruleSets"`（[projectController.ts:96](apps/web/src/projectController.ts#L96)）改为 `selectedView: "catalog"`。

- [ ] **Step 4: 改 navItems（5 项，工作流顺序）**

把 `apps/web/src/components/AppShell.tsx:21-29` 的 `navItems` 替换为：

```ts
const navItems: NavItem[] = [
  { view: "catalog", label: "规则目录", description: "上游 / 本地素材", icon: <FileText size={17} /> },
  { view: "providers", label: "规则源", description: "合并产物 Provider", icon: <FileCode2 size={17} /> },
  { view: "customProxyGroups", label: "策略组", description: "出口 / 分组", icon: <Layers3 size={17} /> },
  { view: "ruleSets", label: "路由", description: "规则顺序 / 装配", icon: <Route size={17} /> },
  { view: "publish", label: "发布", description: "检查 / 生成 / 发布", icon: <Send size={17} /> },
];
```

（移除 `Settings2` import 若不再使用，避免未用告警。）

- [ ] **Step 5: 改 WorkspaceRouter 分发**

在 `apps/web/src/components/WorkspaceRouter.tsx`：删除 `project` 分支（[WorkspaceRouter.tsx:108-110](apps/web/src/components/WorkspaceRouter.tsx#L108)）与 `preview` 分支（[:151-163](apps/web/src/components/WorkspaceRouter.tsx#L151)）；删除对 `ProjectWorkspace`/`PreviewWorkspace`（preview 改入路由右栏，见 Task B5）的 import；新增 `catalog` 分支返回 `<CatalogWorkspace .../>`（组件见 Task B1）。`rules` 分支改由 CatalogWorkspace 内部承载（删除独立 `rules` 分支）。`ruleSets` 默认分支保留，由 Task B4 改造为三列。

- [ ] **Step 6: 删除 ProjectWorkspace + 类型检查**

```bash
git rm apps/web/src/components/ProjectWorkspace.tsx
```

Run: `pnpm --filter @clash-route-kit/web typecheck`
Expected: 仅剩对 `CatalogWorkspace` 未实现的引用错误（Task B1 解决）；先注释 catalog 分支占位以通过编译，或与 B1 同批提交。

- [ ] **Step 7: 提交**

```bash
git add apps/web/src/projectController.ts apps/web/src/components/AppShell.tsx apps/web/src/components/WorkspaceRouter.tsx apps/web/tests/projectController.test.ts
git commit -m "feat(web): reorder nav to 5-tab workflow IA, drop overview view"
```

---

## Task A3：「规则目录」本地 API —— 列源 / 列条目 / 看条目域名

**Files:**
- Modify: `apps/web/dev/routeKitApi.ts`
- Test: `apps/web/tests/routeKitApi.test.ts`

- [ ] **Step 1: 写失败测试**

在 `apps/web/tests/routeKitApi.test.ts` 追加（用可注入 reader，免依赖真实 vendor）：

```ts
import { listCatalogEntries, readCatalogEntry } from "../dev/routeKitApi.js";

it("lists geosite catalog entries from a data directory", async () => {
  const entries = await listCatalogEntries(
    { root: "/x", configFile: "routes.yaml", origin: "domain-list-community" },
    { readDirectory: async () => ["openai", "category-ai-!cn", "README.md"] },
  );
  expect(entries).toContain("openai");
  expect(entries).toContain("category-ai-!cn");
  expect(entries).not.toContain("README.md"); // 过滤非数据文件
});

it("reads a geosite entry's includes and rule count", async () => {
  const detail = await readCatalogEntry(
    { root: "/x", configFile: "routes.yaml", origin: "domain-list-community", name: "category-ai-!cn" },
    { readText: async () => "include:openai\ninclude:anthropic\nxai.com\n" },
  );
  expect(detail.includes).toEqual(["openai", "anthropic"]);
  expect(detail.ruleCount).toBe(1);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/web/tests/routeKitApi.test.ts -t "catalog"`
Expected: FAIL（未导出）。

- [ ] **Step 3: 实现纯函数**

在 `apps/web/dev/routeKitApi.ts` 顶部 core import 加入 `parseDomainListEntry`：

```ts
import {
  parseDomainListEntry,
  parseRouteKitConfig,
  serializeRouteKitConfig,
  type DomainListEntryInfo,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";
```

追加（`origin` 暂支持 `domain-list-community`；其余源后续扩展）：

```ts
const CATALOG_DATA_DIRS: Record<string, string> = {
  "domain-list-community": "vendor/domain-list-community/data",
};

export interface CatalogEntriesOptions extends ProgramOptions {
  origin: string;
  readDirectory?: ReadDirectory;
}

export interface CatalogEntryOptions extends ProgramOptions {
  origin: string;
  name: string;
  readText?: ReadText;
}

export async function listCatalogEntries(options: CatalogEntriesOptions): Promise<string[]> {
  const dir = CATALOG_DATA_DIRS[options.origin];
  if (!dir) throw new Error(`Unknown catalog origin: ${options.origin}`);
  const readDirectory = options.readDirectory ?? ((directory: string) => readdir(directory));
  const entries = await readDirectory(path.resolve(options.root, dir));
  return entries.filter((name) => !name.includes(".")).sort();
}

export async function readCatalogEntry(
  options: CatalogEntryOptions,
): Promise<DomainListEntryInfo & { name: string }> {
  const dir = CATALOG_DATA_DIRS[options.origin];
  if (!dir) throw new Error(`Unknown catalog origin: ${options.origin}`);
  if (!/^[A-Za-z0-9_!.@-]+$/.test(options.name)) throw new Error(`Invalid entry: ${options.name}`);
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  const text = await readText(path.resolve(options.root, dir, options.name));
  return { name: options.name, ...parseDomainListEntry(text) };
}
```

- [ ] **Step 4: 接入 HTTP handler**

在 `createRouteKitApiHandler` 的路由判断里（`/api/project/config` 之前）加入：

```ts
    if (url.pathname === "/api/catalog/entries") {
      const origin = url.searchParams.get("origin") ?? "domain-list-community";
      void listCatalogEntries({ ...options, origin })
        .then((entries) => writeJson(response, 200, { entries }))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }
    if (url.pathname === "/api/catalog/entry") {
      const origin = url.searchParams.get("origin") ?? "domain-list-community";
      const name = url.searchParams.get("name") ?? "";
      void readCatalogEntry({ ...options, origin, name })
        .then((detail) => writeJson(response, 200, detail))
        .catch((error: unknown) =>
          writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }
```

- [ ] **Step 5: 运行 + 提交**

Run: `pnpm exec vitest run apps/web/tests/routeKitApi.test.ts && pnpm --filter @clash-route-kit/web typecheck`
Expected: PASS。

```bash
git add apps/web/dev/routeKitApi.ts apps/web/tests/routeKitApi.test.ts
git commit -m "feat(web): add catalog browse endpoints (geosite entries + detail)"
```

> 后续扩展（同模式，按需加 Task）：`/api/catalog/sources`（源 + 计数 + vendorRepos 同步状态）、`/api/actions/sync-vendor`（包装 CLI `syncVendor`）、ACL4SSR/dler origin、`?expand=1` 用 `convertDomainListCommunity` 返回完整域名列表。

---

# B. 页面 UI 对齐（变更规格 · 执行时先读活组件再落码）

> 每项执行流程统一为：① 读当前组件 → ② 写组件级测试（vitest + @testing-library/react，沿用 `apps/web/tests` 现有范式）→ ③ 改组件 → ④ 跑测试 → ⑤ 提交。下列给出**必须达成的变更与测试点**。

## Task B1：① 规则目录页（新建 CatalogWorkspace，含本地 .list 编辑）
- **Create** `apps/web/src/components/CatalogWorkspace.tsx`、`apps/web/tests/catalogWorkspace.test.tsx`。
- 布局（密集版，见设计册 catalog-dense）：全宽搜索 ｜ 左「数据源/仓库」（上游只读 + 计数/同步状态；本地可编辑 + ＋新建）｜ 中双列条目网格 ｜ 右详情（域名/include 树）。
- 数据：`fetch('/api/catalog/entries?origin=...')` 列条目、`/api/catalog/entry?...` 看详情；本地 .list 复用既有 `/api/project/rules[/:file]`（把 `RuleFileWorkspace` 的加载/编辑/保存逻辑搬入「本地」区，然后删除 `RuleFileWorkspace` 或保留为子组件）。
- **测试点**：渲染源列表与条目网格（mock fetch）；选中上游条目显示只读详情（无编辑控件）；选中本地 .list 出现文本编辑器与保存按钮；搜索过滤条目。

## Task B2：② 规则源页（全局移除 + 被引用）
- **Modify** `apps/web/src/components/ProviderWorkspace.tsx`、`RuleProviderList.tsx`、`RuleProviderEditor.tsx`；新增 `apps/web/tests/providerWorkspace.test.tsx`。
- 左栏只放 Provider + 顶部固定「🗑 全局移除清单」项（点开编辑 `config.globalRemove`，用 Task A1 的 `setGlobalRemove` 经新 action 接线）。**移除**左栏的本地 .list（已搬到规则目录）。
- 右栏「被引用」：根据 `config.ruleSets` 中 `source.type==='rule-provider' && source.file===provider.output` 计算引用它的 ruleSet/策略，无引用则显示孤儿警告。
- per-provider `exclude` 收进「高级」折叠（沿用既有 `setProviderListField`）。
- **测试点**：选中全局移除项可编辑并写入 `draftConfig.globalRemove`；provider 被引用/孤儿状态正确显示。

## Task B3：③ 策略组页（引用图选择器 + 地区预设 + 嵌套树 + 多订阅筛选）
- **Modify** `apps/web/src/components/CustomProxyGroupEditor.tsx`、`CustomProxyGroupWorkspace.tsx`；新增 `apps/web/tests/customProxyGroupEditor.test.tsx`。
- 「选项=引用」：把 `options` 渲染为可拖排序 chip；「+添加引用」下拉来源 = 其它组名 + `DIRECT`/`REJECT`（写回经既有 `setCustomProxyGroupListField(name,'options',...)`）。
- 「节点筛选」拆「来源范围（全部 / `!!GROUPID=N` / `!!GROUP=tag`）+ 名称正则」，组合成一条写入 `nodeFilters`；地区正则给预设（🇭🇰/🇺🇸/🇯🇵…常量表）。
- 引用关系树（只读预览，由 `customProxyGroups` 的 `options` 推导）+ 无环校验（DFS 检测）。
- **测试点**：添加/移除/排序引用写回 options；来源范围+正则拼出 `!!GROUPID=0!!(港|HK)`；环检测给出告警。

## Task B4：④ 路由页（三列 + 段 + 拖动 + category 选择器 + 导入 INI）
- **Modify** `WorkspaceRouter.tsx` 的 `ruleSets` 分支、`RuleSetList.tsx`、`RuleSetEditor.tsx`；新增 `apps/web/src/components/RoutePicker.tsx`（category 选择器）、`apps/web/tests/routeWorkspace.test.tsx`。
- 三列：左「视图(全部规则)+按策略筛选(策略色点+计数)+新建策略组」｜中「按 `section` 分组的有序列表 + 启用开关 + 删除 + 拖动重排（用 Task A1 `reorderRuleSets`；跨段落点改 `section` 经 `updateRuleSet`）」｜右「选中规则编辑：改匹配 / 移动策略 / 域名预览」。
- 工具条：搜索 ruleset（既有 `ruleSetSearch`）＋「⇪ 导入 INI」（上传/粘贴 → POST 文本 → 用计划 2 `parseIniToConfig`；本地 API 加 `/api/import` 或前端直接 import core 函数解析后批量 `addRuleSet`/`addCustomProxyGroup`）＋「＋ 添加规则」打开 RoutePicker。
- RoutePicker：`fetch('/api/catalog/entries')` + category 树（`parseDomainListEntry` 的 includes 作为成员）→ 选中 + 目标策略 + 段 → 经 `createRuleSet`+`addRuleSet`（geosite 直引）或加进 provider。
- 实时 INI 预览（原 PreviewWorkspace）移入本页右栏的「预览」切换。
- **测试点**：按 section 分组渲染；拖动调用 reorderRuleSets 改顺序；筛选只高亮/过滤；RoutePicker 选 geosite 后新增对应 ruleSet；导入 INI 批量填充。

## Task B5：⑤ 发布页（纵向叙事 + 仓库自动探测 + 模板设置内置）
- **Modify** `apps/web/src/components/PublishPanel.tsx`、`publishWorkflow.ts`；更新 `apps/web/tests/publishWorkflow.test.ts`。
- 纵向三段：① 目标（模式 本地/GitHub；GitHub 下仓库自动探测，新增本地 API `/api/git/remote` 包装 `git remote get-url origin` 并用既有 `parseGitHubRepo` 解析，分支固定 `publish`，`publishBaseUrl` 由其派生）② 执行（横向 stepper：保存→检查→生成→提交→推送，复用 `requestLocalAction` 与现有 action 状态）③ 产物（raw URL，推送前置灰）。
- 模板「输出文件名 / 开关」并入本页（经 Task A1 `setTemplateField` 写 `config.template`）。
- **测试点**：`parseGitHubRepo` 解析 remote URL；模式切换；模板字段写回 `draftConfig.template`。

## Task B6：清理与全量校验
- 删除 `SubscriptionPanel`/`InspectorPanel`/`TagList` 等不再使用的组件（先 grep 引用确认）；更新 `App.tsx` 接线（新 action：`reorderRuleSets`/`setGlobalRemove`/`setTemplateField`/catalog/import）。
- Run: `pnpm typecheck && pnpm test && pnpm build`，全绿。
- 提交：`git commit -m "chore(web): prune unused workspaces and wire new actions"`。

---

## Self-Review

**1. Spec coverage：** ① 规则目录（A3 API + B1 页）；② 规则源全局移除/被引用（A1 + B2）；③ 策略组引用图/嵌套/多订阅（B3）；④ 路由三列/段/拖动/选择器/导入（A1 + B4 + 计划2 parseIniToConfig）；⑤ 发布纵向/自动探测/模板内置（A1 + B5）；删概览、本地 .list 归目录、preview 归路由（A2 + B1 + B4）。

**2. Placeholder 扫描：** A 层每步含完整代码与命令；B 层为「变更规格」（明确文件/改动/测试点），已在 Architecture 显式声明因 mid-refactor 采用「先读活组件再落码」的 inline 范式，非占位。

**3. 类型一致性：** 新 mutation 返回 `RouteKitProjectConfig`，签名与既有 `configMutations` 一致；`ProjectView` 联合更新后 `AppShell.navItems`/`WorkspaceRouter` 分支/`createProjectController` 默认值三处同步；catalog API 复用 `ProgramOptions` 与 `ReadDirectory`/`ReadText` 既有类型，`DomainListEntryInfo` 来自计划 2。
