# ClashRouteKit 控制台精修 · 实施计划（统一 4 期）

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development（A 层任务，推荐）或 superpowers:executing-plans（B 层 UI 任务，建议 inline，先读活组件再落码）逐任务实施。步骤用 checkbox（`- [ ]`）跟踪。

**Goal:** 在已完成的 console-redesign（5 标签 IA + GitHub 深色主题）基础上，修掉头脑风暴定位的 9 个可用性问题，使 5 个页面形成一套完整自洽、字号舒适的可编辑控制台。

**Architecture:** 这是**增量精修**，不是重写。沿用现有 `WorkspaceRouter` 按 `selectedView` 分发、`draftConfig` 脏检查保存、`apps/web/dev/routeKitApi.ts` 可注入纯函数 API 的结构。视觉延续 `docs/design/console-redesign/README.md` 既有配色 token（即「方向 B」）。计划分两层（沿用本仓库 2026-06-08 计划的已确立范式）：**A 层**给 core/dev-API 纯函数的全量 TDD 代码；**B 层**给 UI 组件的「变更规格」（文件 + 改动 + 测试点），执行时先读当前活组件再落码（web 处于活跃重构，盲跑 subagent 不合适）。

**Tech Stack:** React 19 + TypeScript（NodeNext，相对 import 必带 `.js`）、vitest、vite dev middleware、lucide-react 图标。

## Global Constraints

- **ESM/NodeNext**：所有相对 import 必带 `.js` 扩展名（即使源是 `.ts`）。
- **新增 core 导出**必须在 `packages/core/src/index.ts` 显式 re-export（含类型）。
- **免构建开发**：改 core 源码无需先 build，cli/web/测试经 alias 直接用 `packages/core/src`。
- **唯一配置源**是 `config/routes.yaml`（类型 `RouteKitProjectConfig`）；改 schema 时同步 `types.ts` + CLI(`readConfig`) + web(`config.ts`) 三处消费方。
- **质量门禁**：无 lint，靠 `pnpm typecheck` + `pnpm test`；每个 A 任务 TDD（先写失败测试），收尾跑 `pnpm typecheck && pnpm test && pnpm build`。
- **视觉基准**：配色 token 见 `docs/design/console-redesign/README.md`；本计划的新增视觉规格（类型徽标 / 分段栏 / 底部预览分屏 / 模型 1 双块详情 / 导入向导）以各 B 任务的「布局规格」为准。
- **字号舒适**：禁止出现 < 12px 的功能性文字；正文基准 13–14px、标题 15–22px（用户明确反馈旧版过小）。

---

## 问题 → 任务映射（9 项全覆盖）

| # | 问题 | 任务 | 期 |
|---|---|---|---|
| #1 | 五页面统一自洽视觉 | B0（token/类精修）+ 各 B 页 | 0 + 全程 |
| #9 | 策略组 ↔ 策略 关系不直观 | A1 + B1（模型 1：策略组详情内嵌入站规则） | 1 |
| #2 | 路由「编辑/预览」未体现 | B2（有序表 + 编辑器 + 底部常驻 INI 预览） | 1 |
| #7 | 本地 .list 直接展示、去掉多一列 | B3（本地 .list 平铺左栏 + 右侧直编） | 2 |
| #5 | 单个数据源也能同步 | A2 + B3（每行 ⟳ + 右侧「同步此源」） | 2 |
| #4 | 「无 include / 读取中」误导 | A3 + B3（叶子无箭头、区分加载/空） | 2 |
| #3 | dler-io 同步 main 失败 | A2（钉 `branch: main` + 校验目录） | 2 |
| #6 | 添加上游仓库 / 新建本地 .list 摆设 | A4 + B3（两者做真，vendorRepos↔catalog 合一） | 2 |
| #8 | 按 aethersailor/acl4ssr 模板搭建 | A5 + A6 + B4（数据源浏览模板 + 粘贴/上传 → 统一向导 → 覆盖应用） | 3 |

排期：**方案 C 纵切 + 地基**。Phase 0 锁地基；Phase 1 纵切「策略组↔路由」（最核心）；Phase 2 纵切「数据源」；Phase 3 模板导入。规则源/发布两页在 Phase 0 做纯样式对齐。

---

# Phase 0 · 设计地基精修

## Task A0：策略色助手（已存在 → 复用，不新建）

**执行核实结论：** `apps/web/src/proxyGroups.ts` 已有 `policyTone(name): "dir"|"rej"|"cat"|"reg"|"fin"`（带测试 `proxyGroups.test.ts`），`styles.css` 已有 `.policy-dot.tone-*` 与 `.pc.tone-*`，且 `RouteWorkspace.tsx` 已用 `policy-dot tone-${policyTone(name)}`。**本任务无需新建函数**——B0/B1/B2 的策略色点统一复用 `policyTone` + `.policy-dot tone-*`，不引入新的 `policyColor`（DRY，遵循既有模式）。

## Task B0：主题 token / 共享类精修（先于其它 B 任务）

**Files:**
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/tests/stylesRegression.test.ts`（沿用既有断言风格；无则新建简单字符串断言）

**布局规格（在既有 README token 之上新增）：**
- **字号 token**：`--fs-xs:12px; --fs-sm:13px; --fs-md:14px; --fs-lg:15px; --fs-xl:18px; --fs-2xl:22px;`（替换散落的 rem 小字；正文默认 `--fs-md`）。
- **类型徽标** `.type-badge`：12px、圆角 5px、低饱和描边底色（select=中性 `--bd`、url-test=绿 `#3fb950`、fallback/load-balance=蓝）。
- **策略色点**：复用既有 `.policy-dot.tone-{dir,rej,cat,reg,fin}`（styles.css 已有）+ `policyTone(name)`，不新增。若旧字号偏小，仅调字号 token。
- **分段控件** `.seg`（容器）/`.seg-item`/`.seg-on`：用于数据源左栏 [上游|本地] 与路由「规则列表/INI 预览」。
- **底部分屏** `.split-v`（上内容 + 下预览）/`.split-preview`（可折叠，带 header 与折叠钮）。
- **数据源行** `.src-row`/`.src-row.on`：色点/图标 + 名 + 计数 + 末尾 ⟳。
- 全部使用 `--fs-*` 字号、`--bg*`/`--bd`/`--tx*` 既有变量，保证 5 页一致。

**测试点：** stylesRegression 断言 `--fs-md`、`.type-badge`、`.policy-dot`、`.seg-item`、`.split-preview`、`.src-row` 等关键 token/类存在。

- [ ] 读 `styles.css` 现状 → 加 token 与类 → 跑 stylesRegression → 目测对照本计划规格 → 提交 `style(web): add type-scale tokens and shared classes for refinement`。

## Task B5a：规则源 + 发布两页纯样式对齐

**Files:**
- Modify: `apps/web/src/components/ProviderWorkspace.tsx`、`PublishPanel.tsx`（仅 className/字号，不动逻辑）

**变更：** 把这两页的字号/间距/卡片切到 B0 的 `--fs-*` 与共享类，使其与策略组/路由/数据源同语言。不改功能。
**测试点：** 既有 `publishWorkflow.test.ts` 仍绿；typecheck 通过；目测一致。

- [ ] 读两组件 → 套用共享类 → `pnpm --filter @clash-route-kit/web typecheck` → 提交 `style(web): align providers/publish pages to refined tokens`。

---

# Phase 1 · 纵切：策略组 ↔ 路由（#1 #2 #9）

## Task A1：入站规则选择器 `selectInboundRuleSets`

模型 1 的核心数据：给定策略组名，取所有 `policy` 指向它的规则（保序，含禁用，标注 enabled）。

**Files:**
- Modify: `apps/web/src/routeSummary.ts`
- Test: `apps/web/tests/routeSummary.test.ts`（无则新建）

**Interfaces — Produces:**
- `selectInboundRuleSets(config, groupName): InboundRuleSetRow[]`
- `interface InboundRuleSetRow { id: string; enabled: boolean; source: string; }`（`source` 复用本文件既有 `ruleSetSourceText` 输出，如 `[]GEOSITE,openai`）

- [ ] **Step 1: 写失败测试**

```ts
import { selectInboundRuleSets } from "../src/routeSummary.js";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";

const config = {
  publishBaseUrl: "http://127.0.0.1:8787",
  template: { output: "Custom_Clash.ini" },
  vendorRepos: [],
  customProxyGroups: [{ name: "AI", type: "select", options: ["Proxy"] }],
  ruleSets: [
    { id: "ai-openai", policy: "AI", source: { type: "geosite", value: "openai" } },
    { id: "direct-x", policy: "Direct", source: { type: "geosite", value: "private" } },
    { id: "ai-anthropic", enabled: false, policy: "AI", source: { type: "geosite", value: "anthropic" } },
  ],
  ruleProviders: [],
} as unknown as RouteKitProjectConfig;

it("returns only ruleSets whose policy matches, in order, keeping disabled", () => {
  const rows = selectInboundRuleSets(config, "AI");
  expect(rows.map((r) => r.id)).toEqual(["ai-openai", "ai-anthropic"]);
  expect(rows[0]).toEqual({ id: "ai-openai", enabled: true, source: "[]GEOSITE,openai" });
  expect(rows[1]!.enabled).toBe(false);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/web/tests/routeSummary.test.ts -t "inbound"`
Expected: FAIL（未导出）。

- [ ] **Step 3: 实现**

在 `apps/web/src/routeSummary.ts` 追加（复用文件内既有 `ruleSetSourceText`）：

```ts
export interface InboundRuleSetRow {
  id: string;
  enabled: boolean;
  source: string;
}

export function selectInboundRuleSets(
  config: RouteKitProjectConfig,
  groupName: string,
): InboundRuleSetRow[] {
  return config.ruleSets
    .filter((ruleSet) => ruleSet.policy === groupName)
    .map((ruleSet) => ({
      id: ruleSet.id,
      enabled: ruleSet.enabled !== false,
      source: ruleSetSourceText(ruleSet),
    }));
}
```

- [ ] **Step 4: 运行确认通过 + 提交**

Run: `pnpm exec vitest run apps/web/tests/routeSummary.test.ts`

```bash
git add apps/web/src/routeSummary.ts apps/web/tests/routeSummary.test.ts
git commit -m "feat(web): add selectInboundRuleSets for policy-group detail"
```

## Task B1：策略组页（模型 1）

**Files:**
- Modify: `apps/web/src/components/CustomProxyGroupList.tsx`、`CustomProxyGroupWorkspace.tsx`、`CustomProxyGroupEditor.tsx`
- Modify: `apps/web/src/App.tsx`（接线跨页跳转 + 入站规则增删）
- Test: `apps/web/tests/customProxyGroupWorkspace.test.tsx`（新建）

**布局规格：**
- **左列行**（CustomProxyGroupList）：`policy-dot`（`policyColor(name)`）+ 组名 + `type-badge`（group.type）。**删除**末尾的「N · M」裸计数（用 `stats` 仅做无障碍/排序，不渲染数字）。选中行高亮。
- **右侧详情**（CustomProxyGroupEditor）分**两块**：
  - **① 组内成员 options**（沿用既有 `setCustomProxyGroupListField(name,'options',...)` 的 chip 编辑 + 添加/删除/排序）。保留 type/url/interval/tolerance/nodeFilters 等「角色二」字段（折叠到「高级/节点」区）。
  - **② 指向本组的规则**（新增）：用 `selectInboundRuleSets(config, group.name)` 列出每条（类型徽标 + source 文本 + 「↗ 路由中查看」+ 删除）。「↗」调用新接线 `onJumpToRuleSet(id)`；删除调既有 `deleteRuleSet`；「+ 添加规则」用既有 `createRuleSet`+`addRuleSet`（policy 预填本组名）或打开 RoutePicker（若已存在）。
- **跨页跳转接线**（App.tsx）：新增 `jumpToRuleSet(id)` = `setProjectSelection({ selectedView: "ruleSets", selectedRuleSetId: id })`，经 props 传入。

**测试点（mock）：** 左列渲染 dot+name+type-badge 且无数字计数；选中 AI 组，② 区列出 policy=AI 的全部规则；点「↗」触发 `onJumpToRuleSet("ai-openai")`；「删除」触发 `deleteRuleSet`；禁用规则有视觉标注。

- [ ] 读三组件 + App.tsx 接线 → 写 workspace 测试 → 改组件（左列去计数加徽标、详情加 ② 区）→ 接线 jumpToRuleSet → 跑测试 + typecheck → 提交 `feat(web): policy-group detail shows inbound rules (issue #9 model 1)`。

## Task B2：路由页（编辑 + 底部常驻 INI 预览）

**Files:**
- Modify: `apps/web/src/components/RouteWorkspace.tsx`、`RuleSetEditor.tsx`、`RuleSetList.tsx`、`PreviewWorkspace.tsx`
- Test: `apps/web/tests/routeWorkspace.test.tsx`（无则新建）

**布局规格：**
- **保留**左有序表（拖拽重排用既有 `reorderRuleSets`；序号 + `policy-dot` + 类型徽标 + 匹配值 + → 目的地）+ 右编辑器（匹配来源类型/值、目的地策略下拉带 `policy-dot`、启用、section、删除、实时输出行）。顶部一句「顺序即优先级」。
- **INI 预览改为底部常驻分屏**：用 `.split-v`/`.split-preview` 把页面分上（表+编辑器）下（`renderIni(config)` 实时预览，`PreviewWorkspace` 内容移入）。预览面板可折叠（折叠钮）；删除原来「整片切换 previewMode」的二选一（窄屏折叠时等价于切换）。
- **跨页高亮**：当 `project.selectedRuleSetId` 由策略组「↗」设置时，列表滚动到该行并高亮（`scrollIntoView` + 高亮 class 短暂保留）。

**测试点（mock）：** 列表按 section 分组/有序渲染；拖动调用 `reorderRuleSets`；底部预览渲染 `renderIni` 文本且随 draftConfig 变化；折叠钮切换预览可见性；外部设置 selectedRuleSetId 时对应行加高亮 class。

- [ ] 读四组件 → 写 routeWorkspace 测试 → 改 RouteWorkspace 为上下分屏 + 折叠 + 高亮 → 跑测试 + typecheck → 提交 `feat(web): route page bottom-docked live INI preview + cross-link highlight (issue #2)`。

---

# Phase 2 · 纵切：数据源 / 规则目录（#3 #4 #5 #6 #7）

## Task A2：单源同步 `syncVendor({ only })` + dler-io 钉分支（#3 #5）

**Files:**
- Modify: `apps/cli/src/program.ts:124-154`（`syncVendor` + `SyncVendorOptions`）
- Modify: `apps/web/dev/routeKitApi.ts`（`/api/actions/sync-vendor` 读 `?name=`）
- Modify: `config/routes.yaml`（dler-io 加 `branch: main`）
- Test: `apps/cli/tests/program.test.ts`（沿用既有 syncVendor 测试夹具，injectable `runGit`）

**Interfaces — Produces:** `syncVendor(options & { only?: string })`：`only` 给定时仅同步 `repo.name === only` 的仓库；其余逻辑不变。

- [ ] **Step 1: 写失败测试**

```ts
it("syncs only the named repo when 'only' is given", async () => {
  const calls: string[][] = [];
  const runGit = async (args: string[]) => { calls.push(args); return ""; };
  const results = await syncVendor({
    root: tmpRoot, configFile: "routes.yaml", only: "Aethersailor", runGit,
  });
  expect(results.map((r) => r.name)).toEqual(["Aethersailor"]);
});
```
（`tmpRoot` 沿用该测试已有的临时项目夹具：写一份含多个 vendorRepos 的 routes.yaml。）

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/cli/tests/program.test.ts -t "only"`
Expected: FAIL。

- [ ] **Step 3: 实现** —— 在 `SyncVendorOptions` 加 `only?: string`；`syncVendor` 取 `repos` 后加：

```ts
  const selected = options.only ? repos.filter((repo) => repo.name === options.only) : repos;
```
把后续循环的 `repos` 改为 `selected`。

- [ ] **Step 4: dev API 透传 `name`** —— `apps/web/dev/routeKitApi.ts` 的 `runRouteKitAction` `sync-vendor` 分支改为读取 `only`（从 handler 把 `url.searchParams.get("name")` 传入 options），无 name 时同步全部（向后兼容）。

- [ ] **Step 5: 修 dler-io（#3）** —— `config/routes.yaml` 的 dler-io 项加 `branch: main`（与 Aethersailor 一致，触发 `fetch --depth 1 origin main` + `checkout -B`）。**执行者校验**：`pnpm sync:vendor` 后确认 `vendor/Rules/Clash/Provider` 存在且非空（catalog origin `dler-io` 的 `dir`）。

- [ ] **Step 6: 跑测试 + 提交**

Run: `pnpm exec vitest run apps/cli/tests/program.test.ts`

```bash
git add apps/cli/src/program.ts apps/web/dev/routeKitApi.ts config/routes.yaml
git commit -m "feat: per-repo vendor sync + pin dler-io to main (issues #3 #5)"
```

## Task A3：目录条目含枝/叶标记（#4）

让前端无需「展开才知道空」即可判断 category 是否有子列表，消除「无 include / 读取中」误导。

**Files:**
- Modify: `apps/web/dev/routeKitApi.ts`（`listCatalogEntries` 增加可选 meta 形态，或新增 `listCatalogTree`）
- Test: `apps/web/tests/routeKitApi.test.ts`

**实现选择（低成本）：** 新增 `/api/catalog/entry` 已返回 `includes`；前端 #4 主要靠 B3 的「加载态区分」修复。后端这里仅补一个**轻量判定**：对 `domain-list` origin，新增 `readCatalogEntry` 返回的 `includes` 已够用；**本任务把 `listCatalogEntries` 的返回从 `string[]` 升级为可选带类别前缀的稳定排序**已满足。若 B3 实测仍需「不展开即知枝叶」，再加 `/api/catalog/tree?origin=` 一次性返回 `{name, hasIncludes}[]`（读每个 category 文件首段判断 `include:` 行是否存在）。

- [ ] **Step 1: 写失败测试（仅当决定加 tree 端点时）**

```ts
import { listCatalogTree } from "../dev/routeKitApi.js";
it("flags categories with includes vs leaf domain lists", async () => {
  const tree = await listCatalogTree(
    { root: "/x", configFile: "routes.yaml", origin: "domain-list-community" },
    {
      readDirectory: async () => ["category-ai", "openai"],
      readText: async (p: string) => (p.endsWith("category-ai") ? "include:openai\nfoo.com\n" : "bar.com\n"),
    },
  );
  expect(tree).toEqual([
    { name: "category-ai", hasIncludes: true },
    { name: "openai", hasIncludes: false },
  ]);
});
```

- [ ] **Step 2–4:** 实现 `listCatalogTree`（遍历 entries，对每个读首段判断是否含 `include:` 行）→ 接 `/api/catalog/tree` 端点 → 跑测试通过。

- [ ] **Step 5: 提交** `feat(web): catalog tree endpoint marks leaf vs category (issue #4)`。

> 注：若 B3 用「展开时区分 loading / loaded-empty」已足够解决 #4，本任务可只做前端、跳过 tree 端点——执行 B3 时定夺，二选一，勿两者都留半成品。

## Task A4：vendorRepos ↔ catalog 合一 + 添加上游仓库（#6 上游部分）

把硬编码 `CATALOG_ORIGINS` 改为从 `config.vendorRepos[].catalog` 派生，并提供追加仓库的写配置能力。

**Files:**
- Modify: `packages/core/src/types.ts`（`VendorRepoConfig` 加可选 `catalog`）
- Modify: `packages/core/src/index.ts`（类型已 re-export `VendorRepoConfig`，无需改）
- Modify: `apps/web/dev/routeKitApi.ts`（`CATALOG_ORIGINS` → `catalogOriginsFromConfig(config)`；新增 `/api/vendor/add`）
- Modify: `apps/web/src/configMutations.ts`（`addVendorRepo`）
- Test: `apps/web/tests/configMutations.test.ts` + `apps/web/tests/routeKitApi.test.ts`

**Interfaces — Produces:**
- `types.ts`：`interface VendorRepoConfig { name; url; path; branch?; catalog?: { dir: string; kind: "domain-list" | "list-dir" | "provider-yaml" } }`
- `configMutations.ts`：`addVendorRepo(config, repo: VendorRepoConfig): RouteKitProjectConfig`（重名/重路径报错）
- `routeKitApi.ts`：`catalogOriginsFromConfig(config): CatalogOriginDef[]`（从 `vendorRepos` 中带 `catalog` 的派生；保留 4 个内置仓库作为 routes.yaml 的默认 `catalog` 值）

- [ ] **Step 1: 写失败测试（addVendorRepo）**

```ts
import { addVendorRepo } from "../src/configMutations.js";
it("appends a vendor repo with catalog meta", () => {
  const next = addVendorRepo(baseConfig, {
    name: "MyRules", url: "https://x/y.git", path: "vendor/y",
    branch: "main", catalog: { dir: "vendor/y/rules", kind: "list-dir" },
  });
  expect(next.vendorRepos.at(-1)?.name).toBe("MyRules");
});
it("rejects duplicate repo name", () => {
  expect(() => addVendorRepo(baseConfig, {
    name: "dler-io", url: "x", path: "p",
  } as never)).toThrow(/exists/);
});
```

- [ ] **Step 2: 运行确认失败** → `pnpm exec vitest run apps/web/tests/configMutations.test.ts -t "vendor"`。

- [ ] **Step 3: 实现 `addVendorRepo`**（在 configMutations.ts，参照 `addRuleProvider` 风格）：

```ts
export function addVendorRepo(
  config: RouteKitProjectConfig,
  repo: import("@clash-route-kit/core").VendorRepoConfig,
): RouteKitProjectConfig {
  const name = repo.name.trim();
  if (!name) throw new Error("vendor repo name is required");
  if (config.vendorRepos.some((item) => item.name === name)) {
    throw new Error(`vendor repo "${name}" already exists`);
  }
  if (config.vendorRepos.some((item) => item.path === repo.path)) {
    throw new Error(`vendor repo path already exists: ${repo.path}`);
  }
  return { ...config, vendorRepos: [...config.vendorRepos, { ...repo, name }] };
}
```

- [ ] **Step 4: 改 `types.ts`** 给 `VendorRepoConfig` 加 `catalog?`（见 Produces）；**把现有 4 个内置 origin 的 dir/kind 写进 `config/routes.yaml` 各 vendorRepo 的 `catalog` 字段**（domain-list-community→`{dir:"vendor/domain-list-community/data",kind:"domain-list"}` 等，照搬 `CATALOG_ORIGINS`）。

- [ ] **Step 5: `routeKitApi.ts` 改为配置派生** —— 新增 `catalogOriginsFromConfig(config)` 读 `config.vendorRepos` 中含 `catalog` 的项生成 `CatalogOriginDef[]`；`listCatalogSources`/`catalogOrigin` 改用它（`listCatalogSources` 已能注入；先 `readProjectConfigFile` 取 config）。写 routeKitApi 测试：注入含 `catalog` 的 config，断言 sources 含该自定义源。

- [ ] **Step 6: 接 `/api/vendor/add`** —— POST body `{ repo }` → `readProjectConfigFile` → `addVendorRepo` → `writeProjectConfigFile` →（可选）`syncVendor({ only: repo.name })`；返回新 config。

- [ ] **Step 7: 跑测试 + typecheck + 提交**

```bash
git add packages/core/src/types.ts apps/web/src/configMutations.ts apps/web/dev/routeKitApi.ts config/routes.yaml apps/web/tests/configMutations.test.ts apps/web/tests/routeKitApi.test.ts
git commit -m "feat: config-driven catalog origins + addVendorRepo (issue #6 upstream)"
```

## Task B3：数据源页重设计（#3 #4 #5 #6 #7）

**Files:**
- Modify: `apps/web/src/components/CatalogWorkspace.tsx`（重写左栏与本地区）
- Modify: `apps/web/src/components/RuleFileWorkspace.tsx`（其加载/编辑/保存逻辑内联进详情，去掉自带文件列）
- Modify: `apps/web/src/catalog.ts`（加 `syncCatalogVendor(only?)` 调 `?name=`；如用 tree 端点则加 `fetchCatalogTree`）
- Modify: `apps/web/src/App.tsx`（接线新建 .list、添加仓库 action）
- Test: `apps/web/tests/catalogWorkspace.test.tsx`（新建）

**布局规格（左栏 = 定稿 B「顶部分段」）：**
- 左栏顶部 `.seg` 分段 **[上游 | 本地]**，一次显示一组；**无**「只读/可编辑/每行可单独同步」等说明文字。
- **上游段**：每行 `.src-row` = 状态点（绿=已同步/红=失败）+ 仓库名 + 计数 + 末尾 **⟳**（调 `syncCatalogVendor(name)`，#5）。**不**在左栏嵌入分类。
- **本地段（#7）**：把 `listProjectRuleFiles` 的 .list **平铺**为 `.src-row`（如 `Custom_Direct_Domain.list`），**不再**有「本地 .list」单一入口 + RuleFileWorkspace 的文件列。
- **底部单独整行 ＋**：上游段显示「＋ 添加上游仓库」（打开表单：name/url/branch + 数据目录 dir + 解析类型 kind → `POST /api/vendor/add`，#6）；本地段显示「＋ 新建本地 .list」（输入文件名 → `PUT /api/project/rules/:file` 空内容创建，#6）。
- **右侧**：选中上游 → 分类浏览（沿用 `renderNode` 树，#4 修复：只有 `hasIncludes`（A3）或展开后确有 includes 的才显示 ▸；纯域名列表无箭头、显示条数；加载中显「读取中…」、加载完为空则**降级为叶子**，绝不显示「无 include」）；顶部「⟳ 同步此源」。选中本地 .list → **直接**内联可编辑文本域 + 保存（RuleFileWorkspace 逻辑搬入，#7）。

**测试点（mock fetch）：** 分段切换上游/本地各自列表；上游行 ⟳ 调 `syncCatalogVendor("ACL4SSR")`；本地 .list 平铺为行、选中出现可编辑文本域 + 保存（无中间文件列）；底部 ＋ 行随分段变文案；分类树中 leaf 无箭头、category 有箭头、空 category 不显示「无 include」。

- [ ] 读 CatalogWorkspace + RuleFileWorkspace + catalog.ts → 写 catalogWorkspace 测试 → 重写左栏（分段 + 平铺 + 单源同步 + ＋行）、右侧（树修复 + 本地内联编辑）→ 接线 App.tsx → 跑测试 + typecheck → 提交 `feat(web): redesign data-source page (issues #3 #4 #5 #6 #7)`。

---

# Phase 3 · 模板导入（#8 · 覆盖整份配置）

## Task A5：`replaceImportedConfig`（覆盖应用）

**Files:**
- Modify: `apps/web/src/configMutations.ts`
- Test: `apps/web/tests/configMutations.test.ts`

**Interfaces — Produces:** `replaceImportedConfig(config, imported: ImportedConfig): RouteKitProjectConfig`：用 imported 的 `customProxyGroups` + `ruleSets` **整体替换**，保留 `publishBaseUrl`/`template`/`vendorRepos`/`ruleProviders`/`globalRemove`。

- [ ] **Step 1: 写失败测试**

```ts
import { replaceImportedConfig } from "../src/configMutations.js";
it("replaces groups & ruleSets but keeps infra fields", () => {
  const imported = {
    customProxyGroups: [{ name: "New", type: "select", options: ["DIRECT"] }],
    ruleSets: [{ id: "n1", policy: "New", source: { type: "final" } }],
    warnings: [],
  } as const;
  const next = replaceImportedConfig(baseConfig, imported);
  expect(next.customProxyGroups.map((g) => g.name)).toEqual(["New"]);
  expect(next.ruleSets.map((r) => r.id)).toEqual(["n1"]);
  expect(next.publishBaseUrl).toBe(baseConfig.publishBaseUrl);
  expect(next.vendorRepos).toBe(baseConfig.vendorRepos);
  expect(next.template).toEqual(baseConfig.template);
});
```

- [ ] **Step 2: 运行确认失败** → `-t "replaces groups"`。

- [ ] **Step 3: 实现**

```ts
export function replaceImportedConfig(
  config: RouteKitProjectConfig,
  imported: ImportedConfig,
): RouteKitProjectConfig {
  return {
    ...config,
    customProxyGroups: imported.customProxyGroups.map((group) => ({
      ...group,
      options: [...group.options],
      nodeFilters: group.nodeFilters ? [...group.nodeFilters] : undefined,
    })),
    ruleSets: imported.ruleSets.map((ruleSet) => ({ ...ruleSet, source: { ...ruleSet.source } })),
  };
}
```

- [ ] **Step 4: 跑测试 + 提交** `feat(web): add replaceImportedConfig for template import (issue #8)`。

## Task A6：模板源浏览（读 vendor 仓库的 .ini）

**Files:**
- Modify: `apps/web/dev/routeKitApi.ts`（catalog kind 增加 `ini-template`：列 `.ini` 文件、读取其文本）
- Test: `apps/web/tests/routeKitApi.test.ts`

**Interfaces — Produces:**
- `listCatalogEntries` 对 `kind: "ini-template"` 的 origin 返回 `.ini` 文件名（去扩展名）。
- 新增 `readCatalogTemplate(options): Promise<{ name: string; ini: string }>`（读 `.ini` 原文，供前端 `parseIniToConfig`）+ `/api/catalog/template?origin=&name=` 端点。

- [ ] **Step 1: 写失败测试**

```ts
import { readCatalogTemplate } from "../dev/routeKitApi.js";
it("reads an ini template's raw text", async () => {
  const tpl = await readCatalogTemplate(
    { root: "/x", configFile: "routes.yaml", origin: "ACL4SSR-ini", name: "ACL4SSR_Online" },
    { readText: async () => "[custom]\nruleset=DIRECT,[]GEOSITE,private\n" },
  );
  expect(tpl.ini).toContain("[custom]");
});
```

- [ ] **Step 2–4:** 在 `listCatalogEntries` 加 `ini-template` 分支（`.endsWith(".ini")`）；实现 `readCatalogTemplate`；接 `/api/catalog/template` 端点；在 `config/routes.yaml` 给 ACL4SSR/Aethersailor 增配一个 `ini-template` catalog 指向其 `.ini` 目录（或新增 origin 项）。跑测试通过。

- [ ] **Step 5: 提交** `feat(web): browse ini templates from vendor repos (issue #8)`。

## Task B4：统一导入向导（数据源选模板 / 粘贴 / 上传 → 预览 → 覆盖）

**Files:**
- Create: `apps/web/src/components/TemplateImportWizard.tsx`、`apps/web/tests/templateImportWizard.test.tsx`
- Modify: `apps/web/src/components/CatalogWorkspace.tsx`（模板源「用此模板」入口）
- Modify: `apps/web/src/components/AppShell.tsx` 或策略组/路由空态（全局「导入模板」入口）
- Modify: `apps/web/src/App.tsx`（接线 `importTemplate` = `parseIniToConfig` → `replaceImportedConfig`）

**布局规格（向导，模态/抽屉）：**
- **步骤 1 来源**：三选一——(a) 从数据源选模板（列 `ini-template` 源条目，`/api/catalog/template` 取原文）；(b) 粘贴 INI 文本；(c) 上传 `.ini` 文件。
- **步骤 2 预览**：`parseIniToConfig(ini)` → 显示「将创建 N 个策略组 · M 条规则」+ `warnings` 列表 + 关键差异（当前 → 即将覆盖）。
- **步骤 3 确认覆盖**：醒目警示「**将覆盖现有全部策略组与路由**（数据源/规则源/发布设置保留）」+ 二次确认 → `replaceImportedConfig` 写 draftConfig（不自动保存，留给用户在脏状态下检查后手动保存）。

**测试点（mock）：** 粘贴一段最小 INI → 预览显示正确 group/rule 数与 warnings；点确认调用 `onImportTemplate(imported)` 且为 replace 语义；取消不改 config；从数据源模板条目「用此模板」预填步骤 2。

- [ ] 写向导测试 → 建 TemplateImportWizard（三来源 + 预览 + 覆盖确认）→ 接 CatalogWorkspace 模板入口 + 全局入口 → App.tsx 接线 `importTemplate` → 跑测试 + typecheck → 提交 `feat(web): unified template import wizard with replace (issue #8)`。

---

# 收尾

## Task Z：全量校验

- [ ] Run: `pnpm typecheck && pnpm test && pnpm build`，全绿。
- [ ] `pnpm dev` 手动走查 5 页：策略组↔路由跳转、底部预览、数据源分段/单源同步/本地直编/添加仓库/新建 list、模板导入覆盖。
- [ ] 更新 `docs/design/console-redesign/README.md`：补本轮新增 token（`--fs-*`、type-badge、segmented、split-preview）与 9 问题修复说明。
- [ ] 提交 `chore: console refinement pass complete (issues #1–#9)`。

---

## Self-Review

**1. Spec 覆盖：** #1=B0+B5a+各B页；#2=B2；#3=A2(step5);#4=A3+B3;#5=A2+B3;#6=A4+B3;#7=B3;#8=A5+A6+B4;#9=A1+B1。9 项全部有任务。

**2. 占位扫描：** A 层（A0/A1/A2/A4/A5/A6）均给完整 TDD 代码与命令；B 层（B0/B1/B2/B3/B4/B5a）按本仓库已确立范式给「文件 + 布局规格 + 测试点 + 先读活组件」流程，Architecture 已显式声明此为 mid-refactor 范式而非占位。A3 显式标注「tree 端点 vs 前端加载态」二选一、勿留半成品。

**3. 类型一致性：** 新增 `selectInboundRuleSets`/`InboundRuleSetRow`（routeSummary）、`policyColor`（proxyGroups）、`addVendorRepo`/`replaceImportedConfig`（configMutations，返回 `RouteKitProjectConfig`，与既有 mutation 同签名风格）、`VendorRepoConfig.catalog?`（types，向后兼容可选）、`catalogOriginsFromConfig`/`readCatalogTemplate`/`listCatalogTree`（routeKitApi，复用 `ProgramOptions`/`ReadDirectory`/`ReadText`）。`replaceImportedConfig` 与既有 `mergeImportedConfig` 并存（覆盖 vs 合并）。导入解析复用 core 既有 `parseIniToConfig`/`ImportedConfig`。
