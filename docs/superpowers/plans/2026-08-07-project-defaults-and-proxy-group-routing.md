# Project Defaults and Proxy Group Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 ClashRouteKit 增加项目级健康检查与 RuleSet 默认值、SubConverter `timeout` 全链路支持，并把路由页改为按原始顺序展示全部策略组及其真实引用关系。

**Architecture:** `packages/core` 新增唯一的默认值解析层，INI 渲染、CLI 检查和 Web 有效值展示都消费同一组纯函数。Web 继续以 `RouteKitProjectConfig` 为单一草稿状态，通过独立的项目默认值 Drawer、继承字段控件和策略组关系摘要编辑该配置，不引入 `role`、`categoryOverride` 或导入专用元数据。

**Tech Stack:** TypeScript 5.8、React 19、Ant Design 5、Vitest 3、YAML 2、pnpm workspace、SubConverter INI。

## Global Constraints

- 不再使用“服务组 / 地区组”分类；所有 `customProxyGroups` 严格按数组顺序显示。
- 不新增 `role`、`categoryOverride`，也不根据组名推断地区语义。
- 标准 SubConverter INI 导入不依赖 ClashRouteKit 专用字段，并保留原始策略组顺序。
- `timeout` 使用 SubConverter INI 的秒；`tolerance` 使用毫秒；其他 interval 均使用秒。
- 单组 `timeout` / `tolerance`：`undefined` 表示继承，`null` 表示明确留空，数值表示单项覆盖。
- 没有 `defaults` 的旧项目继续使用 URL `https://cp.cloudflare.com/generate_204`、测速间隔 `300`、空 timeout、容差 `50`、Rule Provider 间隔 `28800`、GEOIP `no-resolve: true`。
- 项目默认值中的 timeout 为 `5` 秒；迁移后的当前项目生成 `300,5,50`。
- 不修改现有 `nodeFilters`、策略组顺序、RuleSet 顺序、provider 配方或发布基础设施字段。
- 当前工作树已有大量用户改动；每一步先审阅目标文件现有 diff，不回滚、不覆盖、不把无关修改带入提交。
- 所有手工文件修改使用 `apply_patch`；格式化工具只用于机械格式化。

---

## File Structure

### Core

- Create: `packages/core/src/defaults.ts` — 默认值常量、继承解析、有效值来源和默认值相关校验的唯一实现。
- Create: `packages/core/tests/defaults.test.ts` — 解析优先级、`undefined` / `null` 和校验边界测试。
- Modify: `packages/core/src/types.ts` — `RouteKitDefaults` 类型树及 `CustomProxyGroup.timeout` / nullable tolerance。
- Modify: `packages/core/src/index.ts` — 导出新增类型、常量和解析函数。
- Modify: `packages/core/src/ini.ts` — 使用有效值生成最短合法健康检查尾段，并让 RuleSet 消费项目默认值。
- Modify: `packages/core/src/import.ts` — 解析 `interval[,timeout][,tolerance]` 的四种形态。
- Modify: `packages/core/tests/renderIni.test.ts` — 默认值、覆盖值、明确留空和旧配置兼容测试。
- Modify: `packages/core/tests/importIni.test.ts` — timeout/tolerance 导入矩阵测试。
- Modify: `packages/core/tests/configDocument.test.ts` — `defaults` YAML 往返保真测试。
- Modify: `apps/cli/src/program.ts` — `checkConfig` 复用 Core 默认值校验。
- Modify: `apps/cli/tests/cli.test.ts` — 手写无效默认值时 CLI 检查可发现错误。

### Web state and validation

- Modify: `apps/web/src/configMutations.ts` — 项目默认值替换、无语义策略组创建、nullable 覆盖克隆。
- Modify: `apps/web/src/useProjectDraftActions.ts` — 暴露 `setProjectDefaults`，策略组创建支持四种 type。
- Modify: `apps/web/src/draftValidation.ts` — 合并 Core 默认值校验结果。
- Modify: `apps/web/tests/configMutations.test.ts` — 默认值 mutation、创建逻辑和导入保留测试。
- Modify: `apps/web/tests/draftValidation.test.ts` — UI 自动保存前的默认值错误测试。

### Web routing and editors

- Modify: `apps/web/src/routeSummary.ts` — 直接 RuleSet、上游组引用、成员数和有效健康检查摘要。
- Modify: `apps/web/tests/routeSummary.test.ts` — 顺序和引用方向测试。
- Modify: `apps/web/src/components/GroupNav.tsx` — 单列表导航、type 徽标、规则数、引用数、统一新建入口和默认值入口。
- Modify: `apps/web/tests/groupNav.test.tsx` — 无分类、原顺序、统计和 type 选择测试。
- Create: `apps/web/src/components/GroupContextPanel.tsx` — 选中策略组后的摘要、上游引用、节点来源、有效健康检查和空规则说明。
- Create: `apps/web/tests/groupContextPanel.test.tsx` — 下游组无直接 RuleSet 时仍展示有效关系。
- Create: `apps/web/src/components/InheritedSettingField.tsx` — 继承 / 自定义 / 明确留空的文本和数值字段。
- Create: `apps/web/tests/inheritedSettingField.test.tsx` — 三态交互测试。
- Modify: `apps/web/src/components/GroupDrawer.tsx` — 四种组类型、健康检查继承控制和有效值来源。
- Modify: `apps/web/tests/groupDrawer.test.tsx` — timeout/tolerance 覆盖及 fallback/load-balance 字段测试。
- Create: `apps/web/src/components/ProjectDefaultsDrawer.tsx` — 统一项目默认值 Drawer，两组配置页签。
- Create: `apps/web/tests/projectDefaultsDrawer.test.tsx` — 默认值字段更新和定位页签测试。
- Modify: `apps/web/src/components/RuleDrawer.tsx` — Rule Provider interval 继承和 GEOIP no-resolve 三态。
- Modify: `apps/web/tests/ruleDrawer.test.tsx` — RuleSet 单项覆盖测试。
- Modify: `apps/web/src/components/RuleStream.tsx` — 支持默认值感知的来源文案与自定义空状态。
- Modify: `apps/web/src/components/RoutingPage.tsx` — 组合新导航、组上下文、Drawer 和规则流。
- Modify: `apps/web/tests/routingPage.test.tsx` — 页面级关系与入口回归。
- Modify: `apps/web/src/components/LibrarySidebar.tsx` — 规则源分组增加“规则默认值”入口。
- Modify: `apps/web/src/components/LibraryPage.tsx` — 从规则库打开同一 ProjectDefaultsDrawer。
- Modify: `apps/web/tests/libraryPage.test.tsx` — 规则默认值入口回归。
- Modify: `apps/web/src/styles.css` — 单列表统计、组上下文和 Drawer 辅助样式。

### Project migration

- Modify: `config/routes.yaml` — 写入项目默认值并移除完全相同的单项重复值。
- Modify: `.agents/active.md` — 跟踪执行状态和验证结果。
- Modify: `.agents/progress.md` — 完成后追加阶段里程碑。

---

### Task 1: Define the defaults model and one resolution layer

**Files:**
- Create: `packages/core/src/defaults.ts`
- Create: `packages/core/tests/defaults.test.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `RouteKitDefaults`, `ResolvedConfigValue<T>`, `ResolvedProxyGroupHealthCheck`。
- Produces: `resolveProxyGroupHealthCheck(group, defaults)`、`resolveRuleProviderInterval(source, defaults)`、`resolveGeoipNoResolve(source, defaults)`。
- Produces: `validateDefaultAwareConfig(config): string[]`，供 Web 与 CLI 复用。

- [ ] **Step 1: Write failing tests for precedence and explicit empty values**

```ts
import { describe, expect, it } from "vitest";
import {
  resolveGeoipNoResolve,
  resolveProxyGroupHealthCheck,
  resolveRuleProviderInterval,
  validateDefaultAwareConfig,
} from "../src/index.js";

it("resolves group override, project default, legacy fallback and explicit empty in order", () => {
  const defaults = {
    proxyGroups: {
      healthCheck: { url: "https://probe.example/204", interval: 600, timeout: 5 },
      urlTest: { tolerance: 80 },
    },
  };

  expect(resolveProxyGroupHealthCheck(
    { name: "Auto", type: "url-test", options: [], timeout: null, tolerance: 20 },
    defaults,
  )).toMatchObject({
    url: { value: "https://probe.example/204", source: "project" },
    interval: { value: 600, source: "project" },
    timeout: { value: undefined, source: "empty" },
    tolerance: { value: 20, source: "item" },
  });
});

it("keeps legacy fallbacks when the project has no defaults", () => {
  expect(resolveRuleProviderInterval(
    { type: "rule-provider", behavior: "domain", file: "AI.yaml" },
  )).toEqual({ value: 28800, source: "fallback" });
  expect(resolveGeoipNoResolve({ type: "geoip", value: "cn" })).toEqual({
    value: true,
    source: "fallback",
  });
});
```

- [ ] **Step 2: Run the new test and verify the missing exports fail**

Run: `pnpm exec vitest run packages/core/tests/defaults.test.ts`

Expected: FAIL because the defaults types and resolver exports do not exist.

- [ ] **Step 3: Add the exact public types**

```ts
export interface ProxyGroupHealthCheckDefaults {
  url?: string;
  interval?: number;
  timeout?: number;
}

export interface ProxyGroupDefaults {
  healthCheck?: ProxyGroupHealthCheckDefaults;
  urlTest?: { tolerance?: number };
}

export interface RuleSetDefaults {
  ruleProviderInterval?: number;
  geoipNoResolve?: boolean;
}

export interface RouteKitDefaults {
  proxyGroups?: ProxyGroupDefaults;
  ruleSets?: RuleSetDefaults;
}

export interface CustomProxyGroup {
  name: string;
  type: "select" | "url-test" | "fallback" | "load-balance";
  options: string[];
  nodeFilters?: string[];
  url?: string;
  interval?: number;
  timeout?: number | null;
  tolerance?: number | null;
}

export interface RouteKitConfig {
  publishBaseUrl: string;
  subconverterUrl?: string;
  defaults?: RouteKitDefaults;
  customProxyGroups: CustomProxyGroup[];
  ruleSets: RuleSet[];
}
```

- [ ] **Step 4: Implement pure resolvers and validation**

```ts
export type ResolvedConfigValueSource = "item" | "project" | "fallback" | "empty";

export interface ResolvedConfigValue<T> {
  value: T | undefined;
  source: ResolvedConfigValueSource;
}

export interface ResolvedProxyGroupHealthCheck {
  url: ResolvedConfigValue<string>;
  interval: ResolvedConfigValue<number>;
  timeout: ResolvedConfigValue<number>;
  tolerance: ResolvedConfigValue<number>;
}

export const LEGACY_HEALTH_CHECK_URL = "https://cp.cloudflare.com/generate_204";
export const LEGACY_HEALTH_CHECK_INTERVAL = 300;
export const LEGACY_URL_TEST_TOLERANCE = 50;
export const LEGACY_RULE_PROVIDER_INTERVAL = 28800;
export const LEGACY_GEOIP_NO_RESOLVE = true;
```

Implementation requirements:

- `item !== undefined` wins; `null` returns `{ value: undefined, source: "empty" }` only for timeout/tolerance.
- Project URLTest tolerance applies only when `group.type === "url-test"`.
- The legacy tolerance fallback remains `50` for all existing health-check group types so old projects render byte-for-byte as before.
- URL validation accepts only parseable `http:` and `https:` URLs.
- interval and timeout are positive integers; tolerance is a non-negative integer.
- Validate both project defaults and explicit group/RuleSet overrides, and return deterministic messages in config order.

- [ ] **Step 5: Export the new API and run Core tests**

Run: `pnpm exec vitest run packages/core/tests/defaults.test.ts`

Expected: PASS, including precedence, explicit empty, integer bounds and URL protocol cases.

- [ ] **Step 6: Review the scoped diff and checkpoint**

Run: `git diff -- packages/core/src/types.ts packages/core/src/defaults.ts packages/core/src/index.ts packages/core/tests/defaults.test.ts`

If and only if the staged patch contains no pre-existing user hunks:

```powershell
git add -- packages/core/src/types.ts packages/core/src/defaults.ts packages/core/src/index.ts packages/core/tests/defaults.test.ts
git commit -m "feat(core): add project default resolution"
```

Otherwise leave the verified task uncommitted and record the checkpoint in `.agents/active.md`.

---

### Task 2: Parse and render timeout/default-aware SubConverter INI

**Files:**
- Modify: `packages/core/src/import.ts`
- Modify: `packages/core/src/ini.ts`
- Modify: `packages/core/tests/importIni.test.ts`
- Modify: `packages/core/tests/renderIni.test.ts`
- Modify: `packages/core/tests/configDocument.test.ts`
- Modify: `apps/cli/src/program.ts`
- Modify: `apps/cli/tests/cli.test.ts`

**Interfaces:**
- Consumes: Task 1 resolver and validation exports.
- Produces: `parseIniToConfig` with nullable timeout/tolerance preservation.
- Produces: `renderIni` output whose RuleSet and health-check values use project defaults.

- [ ] **Step 1: Add the import matrix as a failing test**

```ts
it.each([
  ["300", { interval: 300, timeout: null, tolerance: null }],
  ["300,5", { interval: 300, timeout: 5, tolerance: null }],
  ["300,,50", { interval: 300, timeout: null, tolerance: 50 }],
  ["300,5,50", { interval: 300, timeout: 5, tolerance: 50 }],
])("parses health-check tail %s", (tail, expected) => {
  const out = parseIniToConfig(
    `custom_proxy_group=Auto\`url-test\`.*\`https://probe.example/204\`${tail}\n`,
  );
  expect(out.customProxyGroups[0]).toMatchObject(expected);
});
```

- [ ] **Step 2: Add failing render tests for inheritance and shortest legal tails**

```ts
it("renders inherited and explicitly empty health-check slots", () => {
  const ini = renderIni({
    publishBaseUrl: "https://example.com/publish",
    defaults: {
      proxyGroups: {
        healthCheck: { url: "https://probe.example/204", interval: 300, timeout: 5 },
        urlTest: { tolerance: 50 },
      },
    },
    customProxyGroups: [
      { name: "Inherited", type: "url-test", options: [], nodeFilters: [".*"] },
      { name: "NoTimeout", type: "url-test", options: [], nodeFilters: [".*"], timeout: null },
      { name: "NoTolerance", type: "url-test", options: [], nodeFilters: [".*"], timeout: 8, tolerance: null },
    ],
    ruleSets: [],
  });

  expect(ini).toContain("custom_proxy_group=Inherited`url-test`.*`https://probe.example/204`300,5,50");
  expect(ini).toContain("custom_proxy_group=NoTimeout`url-test`.*`https://probe.example/204`300,,50");
  expect(ini).toContain("custom_proxy_group=NoTolerance`url-test`.*`https://probe.example/204`300,8");
});
```

Add a separate regression asserting a config without `defaults` still emits `300,,50`.

- [ ] **Step 3: Run focused tests and confirm red state**

Run: `pnpm exec vitest run packages/core/tests/importIni.test.ts packages/core/tests/renderIni.test.ts`

Expected: FAIL because timeout is neither parsed nor rendered and RuleSets do not consume `config.defaults`.

- [ ] **Step 4: Implement parsing and compact rendering**

Use this tail construction after resolving effective values:

```ts
function renderHealthCheckTail(
  interval: number,
  timeout: number | undefined,
  tolerance: number | undefined,
): string {
  if (tolerance !== undefined) return `${interval},${timeout ?? ""},${tolerance}`;
  if (timeout !== undefined) return `${interval},${timeout}`;
  return String(interval);
}
```

Parsing requirements:

- For every non-select group with a recognized tail, initialize imported `timeout` and `tolerance` to `null`.
- Replace each `null` only when the corresponding slot is present, non-empty and numeric.
- Preserve explicit URL, interval, options and node filters exactly as the current parser does.

Rendering requirements:

- Pass `config.defaults` into RuleSet and group render helpers.
- Rule Provider uses explicit interval, then project default, then `28800`.
- GEOIP uses explicit boolean, then project default, then `true`.
- Health-check groups use `renderHealthCheckTail`; select groups remain unchanged.

- [ ] **Step 5: Cover YAML round-trip and CLI validation**

Add this shape to `configDocument.test.ts` and assert parse/serialize preservation:

```yaml
defaults:
  proxyGroups:
    healthCheck:
      url: https://probe.example/204
      interval: 300
      timeout: 5
    urlTest:
      tolerance: 50
  ruleSets:
    ruleProviderInterval: 28800
    geoipNoResolve: true
```

In `checkConfig`, append `validateDefaultAwareConfig(config)` to diagnostics before returning. Add a CLI test with `timeout: 0` and expect the exact validation diagnostic.

- [ ] **Step 6: Run Core and CLI regression tests**

Run: `pnpm exec vitest run packages/core/tests/defaults.test.ts packages/core/tests/importIni.test.ts packages/core/tests/renderIni.test.ts packages/core/tests/configDocument.test.ts apps/cli/tests/cli.test.ts`

Expected: PASS.

- [ ] **Step 7: Review the scoped diff and checkpoint**

Run: `git diff -- packages/core/src/import.ts packages/core/src/ini.ts packages/core/tests/importIni.test.ts packages/core/tests/renderIni.test.ts packages/core/tests/configDocument.test.ts apps/cli/src/program.ts apps/cli/tests/cli.test.ts`

Commit only when task-owned hunks can be staged without existing user changes:

```powershell
git add -- packages/core/src/import.ts packages/core/src/ini.ts packages/core/tests/importIni.test.ts packages/core/tests/renderIni.test.ts packages/core/tests/configDocument.test.ts apps/cli/src/program.ts apps/cli/tests/cli.test.ts
git commit -m "feat(core): support inherited probe settings"
```

---

### Task 3: Add Web mutations and save-time validation for defaults

**Files:**
- Modify: `apps/web/src/configMutations.ts`
- Modify: `apps/web/src/useProjectDraftActions.ts`
- Modify: `apps/web/src/draftValidation.ts`
- Modify: `apps/web/tests/configMutations.test.ts`
- Modify: `apps/web/tests/draftValidation.test.ts`

**Interfaces:**
- Consumes: `RouteKitDefaults` and `validateDefaultAwareConfig` from Core.
- Produces: `setProjectDefaults(config, defaults)` and `draftActions.setProjectDefaults(defaults)`.
- Changes: `createCustomProxyGroup(config, type)` accepts all four `CustomProxyGroup["type"]` values.

- [ ] **Step 1: Write failing mutation tests**

```ts
it("sets and clears compact project defaults immutably", () => {
  const config = createConfig();
  const next = setProjectDefaults(config, {
    proxyGroups: { healthCheck: { interval: 300, timeout: 5 } },
    ruleSets: { geoipNoResolve: false },
  });

  expect(next.defaults).toEqual({
    proxyGroups: { healthCheck: { interval: 300, timeout: 5 } },
    ruleSets: { geoipNoResolve: false },
  });
  expect(config.defaults).toBeUndefined();
  expect(setProjectDefaults(next, undefined).defaults).toBeUndefined();
});

it.each(["url-test", "fallback", "load-balance"] as const)(
  "creates a %s group without baking project defaults into the item",
  (type) => {
    expect(createCustomProxyGroup(createConfig(), type)).toEqual({
      name: "ProxyGroup",
      type,
      options: [],
      nodeFilters: [".*"],
    });
  },
);
```

Also assert imported `timeout: null` and `tolerance: null` survive both merge and replace without changing existing `defaults`.
Add regressions showing `renameCustomProxyGroup` rewrites exact matches in parent-group `options`, and `deleteCustomProxyGroup` refuses deletion while another group still references the target.

- [ ] **Step 2: Run focused tests and verify red state**

Run: `pnpm exec vitest run apps/web/tests/configMutations.test.ts apps/web/tests/draftValidation.test.ts`

Expected: FAIL because the defaults mutation does not exist and URLTest creation still writes hard-coded probe fields.

- [ ] **Step 3: Implement immutable defaults replacement and type-neutral creation**

```ts
export function setProjectDefaults(
  config: RouteKitProjectConfig,
  defaults: RouteKitDefaults | undefined,
): RouteKitProjectConfig {
  return defaults === undefined
    ? { ...config, defaults: undefined }
    : { ...config, defaults: structuredCloneDefaults(defaults) };
}
```

`structuredCloneDefaults` must clone only the small nested defaults tree; do not use JSON serialization. Change group creation to:

```ts
export function createCustomProxyGroup(
  config: RouteKitProjectConfig,
  type: CustomProxyGroup["type"] = "select",
): CustomProxyGroup {
  const name = nextName(config.customProxyGroups.map((group) => group.name), "ProxyGroup");
  return type === "select"
    ? { name, type, options: ["DIRECT"] }
    : { name, type, options: [], nodeFilters: [".*"] };
}
```

When renaming a group, update both `ruleSet.policy` and every exact `parent.options` match. When deleting, treat either a RuleSet policy or a parent-group option as an active reference and include the referring group name in the thrown error.

- [ ] **Step 4: Wire draft actions and validation**

Expose:

```ts
setProjectDefaults(defaults: RouteKitDefaults | undefined) {
  mutate((current) => setProjectDefaults(current, defaults));
}
```

At the start of `validateDraftConfig`, append Core diagnostics to `errors`:

```ts
errors.push(...validateDefaultAwareConfig(config));
```

Add tests showing invalid URL, zero interval, zero timeout and negative tolerance block save, while `timeout: null` and `tolerance: null` remain valid per-group states.

- [ ] **Step 5: Run focused Web tests and typecheck**

Run: `pnpm exec vitest run apps/web/tests/configMutations.test.ts apps/web/tests/draftValidation.test.ts`

Run: `pnpm --filter @clash-route-kit/web typecheck`

Expected: both PASS.

- [ ] **Step 6: Review the scoped diff and checkpoint**

Run: `git diff -- apps/web/src/configMutations.ts apps/web/src/useProjectDraftActions.ts apps/web/src/draftValidation.ts apps/web/tests/configMutations.test.ts apps/web/tests/draftValidation.test.ts`

Commit only if the staged diff is isolated:

```powershell
git add -- apps/web/src/configMutations.ts apps/web/src/useProjectDraftActions.ts apps/web/src/draftValidation.ts apps/web/tests/configMutations.test.ts apps/web/tests/draftValidation.test.ts
git commit -m "feat(web): edit project route defaults"
```

---

### Task 4: Replace semantic group categories with ordered relationship statistics

**Files:**
- Modify: `apps/web/src/routeSummary.ts`
- Modify: `apps/web/tests/routeSummary.test.ts`
- Modify: `apps/web/src/components/GroupNav.tsx`
- Modify: `apps/web/tests/groupNav.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces: `CustomProxyGroupStat` with `type`, `directRuleSetCount`, `referencedByGroupCount`, `memberCount`.
- Produces: `createCustomProxyGroupDetails(config, groupName)` with ordered direct RuleSets, ordered parent groups and effective health values.
- Changes: `GroupNav.onCreateGroup(type)` and `GroupNav.onOpenDefaults()`; removes `onCreateRegion`.

- [ ] **Step 1: Write failing relationship tests**

```ts
it("counts direct RuleSets and parent group references without reordering groups", () => {
  expect(createCustomProxyGroupStats(config)).toEqual([
    {
      name: "Proxy",
      type: "select",
      directRuleSetCount: 2,
      referencedByGroupCount: 1,
      memberCount: 2,
    },
    {
      name: "Tech",
      type: "select",
      directRuleSetCount: 2,
      referencedByGroupCount: 0,
      memberCount: 2,
    },
    {
      name: "Direct",
      type: "select",
      directRuleSetCount: 1,
      referencedByGroupCount: 2,
      memberCount: 1,
    },
  ]);
});

it("returns parent groups in customProxyGroups order", () => {
  expect(createCustomProxyGroupDetails(config, "Direct")?.referencedByGroups.map((group) => group.name))
    .toEqual(["Proxy", "Tech"]);
});
```

- [ ] **Step 2: Run summary tests and verify red state**

Run: `pnpm exec vitest run apps/web/tests/routeSummary.test.ts`

Expected: FAIL because only direct rule and member counts currently exist.

- [ ] **Step 3: Implement relationship indexes and effective summaries**

```ts
export interface CustomProxyGroupStat {
  name: string;
  type: CustomProxyGroup["type"];
  directRuleSetCount: number;
  referencedByGroupCount: number;
  memberCount: number;
}

export interface ReferencingProxyGroupRow {
  name: string;
  type: CustomProxyGroup["type"];
}

export interface CustomProxyGroupDetails {
  directRuleSets: InboundRuleSetRow[];
  referencedByGroups: ReferencingProxyGroupRow[];
  memberCount: number;
  healthCheck?: ResolvedProxyGroupHealthCheck;
}
```

Build counts with maps in one pass over `ruleSets` and one pass over every parent group's `options`; return arrays in existing config order.

- [ ] **Step 4: Rewrite GroupNav as one ordered list**

Required rendered structure:

```tsx
<div className="rk-nav-head">
  <strong>策略组</strong>
  <Space size={2}>
    <IconAction label="项目默认值" onClick={props.onOpenDefaults}><Settings size={14} /></IconAction>
    <Dropdown menu={{ items: groupTypeItems }} trigger={["click"]}>
      <button type="button" aria-label="新建策略组" className="rk-iconbtn"><Plus size={14} /></button>
    </Dropdown>
  </Space>
</div>
```

After the fixed “全部规则” row, map `props.groups` directly. Each group row must render its name, a type tag, `规则 N · 引用 N`, and edit action; do not call `filter` to create categories.

- [ ] **Step 5: Update navigation tests**

Assert:

- “服务组”和“地区组” do not exist.
- The DOM text order is `Proxy` before `HK` for the supplied input array.
- Both `select` and `url-test` badges are visible.
- `规则 3 · 引用 1` is visible.
- Choosing `fallback` from the create dropdown calls `onCreateGroup("fallback")`.
- Clicking the gear calls `onOpenDefaults`.

Run: `pnpm exec vitest run apps/web/tests/routeSummary.test.ts apps/web/tests/groupNav.test.tsx`

Expected: PASS.

- [ ] **Step 6: Review the scoped diff and checkpoint**

Run: `git diff -- apps/web/src/routeSummary.ts apps/web/tests/routeSummary.test.ts apps/web/src/components/GroupNav.tsx apps/web/tests/groupNav.test.tsx apps/web/src/styles.css`

Commit only if the staged diff contains no unrelated CSS or pre-existing hunks:

```powershell
git add -- apps/web/src/routeSummary.ts apps/web/tests/routeSummary.test.ts apps/web/src/components/GroupNav.tsx apps/web/tests/groupNav.test.tsx apps/web/src/styles.css
git commit -m "feat(web): show ordered proxy group relationships"
```

---

### Task 5: Show group context and edit inherited health-check values

**Files:**
- Create: `apps/web/src/components/GroupContextPanel.tsx`
- Create: `apps/web/tests/groupContextPanel.test.tsx`
- Create: `apps/web/src/components/InheritedSettingField.tsx`
- Create: `apps/web/tests/inheritedSettingField.test.tsx`
- Modify: `apps/web/src/components/GroupDrawer.tsx`
- Modify: `apps/web/tests/groupDrawer.test.tsx`
- Modify: `apps/web/src/components/RuleStream.tsx`
- Modify: `apps/web/src/components/RoutingPage.tsx`
- Modify: `apps/web/tests/routingPage.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `CustomProxyGroupDetails` and Core `ResolvedConfigValue<T>`.
- Produces: `InheritedNumberSetting` and `InheritedTextSetting` controlled components.
- Produces: `GroupContextPanel` that wraps the direct RuleSet stream without owning config state.

- [ ] **Step 1: Write failing tests for the selected-group context**

```tsx
it("shows references and node sources for a downstream group", () => {
  render(
    <GroupContextPanel
      group={{ name: "HK", type: "url-test", options: [], nodeFilters: ["(港|HK)"] }}
      details={{
        directRuleSets: [],
        referencedByGroups: [{ name: "Proxy", type: "select" }],
        memberCount: 1,
        healthCheck: resolvedHealthCheck,
      }}
      onEdit={() => {}}
      onSelectParent={() => {}}
    >
      <div>rule stream</div>
    </GroupContextPanel>,
  );

  expect(screen.getByText("Proxy")).toBeTruthy();
  expect(screen.getByText("(港|HK)")).toBeTruthy();
});
```

- [ ] **Step 2: Add failing three-state field tests**

Test the exact transitions:

```ts
expect(onChange).toHaveBeenCalledWith(undefined); // 继承项目默认值
expect(onChange).toHaveBeenCalledWith(null);      // 明确留空
expect(onChange).toHaveBeenCalledWith(8);         // 自定义数值
```

Text URL supports only inherit/custom; interval supports inherit/custom; timeout and tolerance support all three states.

- [ ] **Step 3: Run focused tests and verify red state**

Run: `pnpm exec vitest run apps/web/tests/groupContextPanel.test.tsx apps/web/tests/inheritedSettingField.test.tsx apps/web/tests/groupDrawer.test.tsx apps/web/tests/routingPage.test.tsx`

Expected: FAIL because the components and relationship view do not exist.

- [ ] **Step 4: Implement controlled inherited setting components**

Use one explicit mode type:

```ts
export type InheritedSettingMode = "inherit" | "custom" | "empty";

export function modeForValue(value: string | number | null | undefined): InheritedSettingMode {
  if (value === null) return "empty";
  if (value === undefined) return "inherit";
  return "custom";
}
```

The control displays an effective-value caption using these labels:

- `item` → `当前使用单项覆盖：…`
- `project` → `继承项目默认值：…`
- `fallback` → `使用程序默认值：…`
- `empty` → `明确留空，不继承`

When switching to custom, seed the input with the current effective value; timeout without any effective value seeds `5`, while URL and interval use the resolver fallback.

- [ ] **Step 5: Implement GroupContextPanel and RuleStream empty copy**

`GroupContextPanel` renders, in order:

1. Name, type, member count and edit button.
2. “被以下策略组引用” rows, preserving config order.
3. `options` and `nodeFilters` as separate lists.
4. Health-check effective values for non-select groups.
5. Direct-rule section and children.

Add `emptyDescription?: ReactNode` and `defaults?: RouteKitDefaults` to `RuleStream`. Use `ruleSetSourceText(ruleSet, props.defaults)` and render the supplied empty description instead of the generic “没有匹配规则”.

- [ ] **Step 6: Upgrade GroupDrawer**

Pass `defaults={config.defaults}` from RoutingPage. Show URL, interval and timeout for `url-test`, `fallback`, `load-balance`; show tolerance only for `url-test`. Use these exact item updates:

```ts
onChange={(url) => props.onUpdate({ url })}
onChange={(interval) => props.onUpdate({ interval })}
onChange={(timeout) => props.onUpdate({ timeout })}
onChange={(tolerance) => props.onUpdate({ tolerance })}
```

Retain name, type, options, nodeFilters, direct-rule links and delete action. Do not remove an imported fallback/load-balance tolerance field when editing other properties.

- [ ] **Step 7: Compose selected-group mode in RoutingPage**

When `selectedGroup === null`, render the existing complete `RuleStream`. Otherwise:

```tsx
<GroupContextPanel
  group={selectedGroupConfig}
  details={selectedGroupDetails}
  onEdit={() => setDrawerGroup(selectedGroupConfig.name)}
  onSelectParent={setSelectedGroup}
>
  <RuleStream
    ruleSets={visibleRuleSets}
    selectedGroup={selectedGroupConfig.name}
    defaults={config.defaults}
    emptyDescription={(
      <>
        <div>当前没有 RuleSet 直接指向此组。</div>
        <div>该组仍可作为下游策略组被其他组引用。</div>
      </>
    )}
    {...ruleStreamCallbacks}
  />
</GroupContextPanel>
```

Keep the “添加直接路由规则” action available and keep global RuleSet reorder semantics.
Add a RoutingPage assertion for both exact empty-state lines so the explanatory copy is covered at the composition level.

- [ ] **Step 8: Run routing/editor tests and typecheck**

Run: `pnpm exec vitest run apps/web/tests/groupContextPanel.test.tsx apps/web/tests/inheritedSettingField.test.tsx apps/web/tests/groupDrawer.test.tsx apps/web/tests/routingPage.test.tsx apps/web/tests/ruleStream.test.tsx`

Run: `pnpm --filter @clash-route-kit/web typecheck`

Expected: PASS.

- [ ] **Step 9: Review the scoped diff and checkpoint**

Run: `git diff -- apps/web/src/components/GroupContextPanel.tsx apps/web/tests/groupContextPanel.test.tsx apps/web/src/components/InheritedSettingField.tsx apps/web/tests/inheritedSettingField.test.tsx apps/web/src/components/GroupDrawer.tsx apps/web/tests/groupDrawer.test.tsx apps/web/src/components/RuleStream.tsx apps/web/src/components/RoutingPage.tsx apps/web/tests/routingPage.test.tsx apps/web/src/styles.css`

Commit only if the staged patch can exclude pre-existing user work:

```powershell
git add -- apps/web/src/components/GroupContextPanel.tsx apps/web/tests/groupContextPanel.test.tsx apps/web/src/components/InheritedSettingField.tsx apps/web/tests/inheritedSettingField.test.tsx apps/web/src/components/GroupDrawer.tsx apps/web/tests/groupDrawer.test.tsx apps/web/src/components/RuleStream.tsx apps/web/src/components/RoutingPage.tsx apps/web/tests/routingPage.test.tsx apps/web/src/styles.css
git commit -m "feat(web): explain proxy group routing context"
```

---

### Task 6: Add the unified defaults Drawer and RuleSet inheritance controls

**Files:**
- Create: `apps/web/src/components/ProjectDefaultsDrawer.tsx`
- Create: `apps/web/tests/projectDefaultsDrawer.test.tsx`
- Modify: `apps/web/src/components/RuleDrawer.tsx`
- Modify: `apps/web/tests/ruleDrawer.test.tsx`
- Modify: `apps/web/src/components/RoutingPage.tsx`
- Modify: `apps/web/tests/routingPage.test.tsx`
- Modify: `apps/web/src/components/LibrarySidebar.tsx`
- Modify: `apps/web/src/components/LibraryPage.tsx`
- Modify: `apps/web/tests/libraryPage.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces: `ProjectDefaultsSection = "proxy-groups" | "rule-sets"`.
- Produces: controlled `ProjectDefaultsDrawer({ open, initialSection, defaults, onChange, onClose })`.
- Changes: `RuleDrawer` receives `defaults?: RouteKitDefaults`.

- [ ] **Step 1: Write failing Drawer tests**

```tsx
it("opens on the requested section and updates health-check defaults", () => {
  const onChange = vi.fn();
  render(
    <ProjectDefaultsDrawer
      open
      initialSection="proxy-groups"
      defaults={{}}
      onChange={onChange}
      onClose={() => {}}
    />,
  );

  expect(screen.getByRole("tab", { name: "策略组健康检查" }).getAttribute("aria-selected")).toBe("true");
  fireEvent.change(screen.getByLabelText("项目测速超时（秒）"), { target: { value: "5" } });
  expect(onChange).toHaveBeenCalledWith({
    proxyGroups: { healthCheck: { timeout: 5 } },
  });
});
```

Add a second test opening `rule-sets` and changing `ruleProviderInterval` plus `geoipNoResolve: false`.

- [ ] **Step 2: Write failing RuleDrawer inheritance tests**

For a Rule Provider with `interval: undefined`, selecting custom and entering `600` must emit:

```ts
{ source: { type: "rule-provider", behavior: "domain", file: "AI.yaml", interval: 600 } }
```

For GEOIP, test all three exact states:

```ts
{ source: { type: "geoip", value: "cn", noResolve: undefined } }
{ source: { type: "geoip", value: "cn", noResolve: true } }
{ source: { type: "geoip", value: "cn", noResolve: false } }
```

- [ ] **Step 3: Run UI tests and verify red state**

Run: `pnpm exec vitest run apps/web/tests/projectDefaultsDrawer.test.tsx apps/web/tests/ruleDrawer.test.tsx apps/web/tests/routingPage.test.tsx apps/web/tests/libraryPage.test.tsx`

Expected: FAIL because the unified Drawer and tri-state editors do not exist.

- [ ] **Step 4: Implement ProjectDefaultsDrawer**

Use Ant Design `Drawer` plus `Tabs`. Tab keys are the public section values. Render these controlled fields:

```text
策略组健康检查
  项目测速 URL
  项目测速间隔（秒）
  项目测速超时（秒）
  项目 URLTest 容差（毫秒）

规则默认值
  Rule Provider 刷新间隔（秒）
  GEOIP 默认 no-resolve
```

Every field allows clearing back to `undefined`. The GEOIP default Select has “使用程序默认值（开启） / 开启 / 关闭”. After every change, compact empty nested objects so clearing the last value emits `undefined` instead of `{ proxyGroups: {} }`.

- [ ] **Step 5: Upgrade RuleDrawer to consume effective defaults**

- Rule Provider interval uses `InheritedNumberSetting`, with project/fallback source caption.
- GEOIP uses a Select with values `inherit`, `enabled`, `disabled` mapped to `undefined`, `true`, `false`.
- `makeSource("geoip")` returns `{ type: "geoip", value: "" }`, allowing inheritance instead of writing `true` immediately.
- Pass `config.defaults` from RoutingPage.

- [ ] **Step 6: Wire both page entry points to the same component**

RoutingPage:

```ts
const [defaultsSection, setDefaultsSection] = useState<ProjectDefaultsSection | null>(null);
```

The GroupNav gear opens `proxy-groups`.

LibraryPage uses the same state shape; the “规则源” Collapse header gear opens `rule-sets`. Both render `ProjectDefaultsDrawer` with `onChange={draftActions.setProjectDefaults}`.

- [ ] **Step 7: Run focused UI tests and typecheck**

Run: `pnpm exec vitest run apps/web/tests/projectDefaultsDrawer.test.tsx apps/web/tests/ruleDrawer.test.tsx apps/web/tests/routingPage.test.tsx apps/web/tests/libraryPage.test.tsx apps/web/tests/groupNav.test.tsx`

Run: `pnpm --filter @clash-route-kit/web typecheck`

Expected: PASS.

- [ ] **Step 8: Review the scoped diff and checkpoint**

Run: `git diff -- apps/web/src/components/ProjectDefaultsDrawer.tsx apps/web/tests/projectDefaultsDrawer.test.tsx apps/web/src/components/RuleDrawer.tsx apps/web/tests/ruleDrawer.test.tsx apps/web/src/components/RoutingPage.tsx apps/web/tests/routingPage.test.tsx apps/web/src/components/LibrarySidebar.tsx apps/web/src/components/LibraryPage.tsx apps/web/tests/libraryPage.test.tsx apps/web/src/styles.css`

Commit only if no user-owned hunks would be included:

```powershell
git add -- apps/web/src/components/ProjectDefaultsDrawer.tsx apps/web/tests/projectDefaultsDrawer.test.tsx apps/web/src/components/RuleDrawer.tsx apps/web/tests/ruleDrawer.test.tsx apps/web/src/components/RoutingPage.tsx apps/web/tests/routingPage.test.tsx apps/web/src/components/LibrarySidebar.tsx apps/web/src/components/LibraryPage.tsx apps/web/tests/libraryPage.test.tsx apps/web/src/styles.css
git commit -m "feat(web): add unified route defaults editor"
```

---

### Task 7: Migrate the current project and run full verification

**Files:**
- Modify: `config/routes.yaml`
- Modify: `.agents/active.md`
- Modify: `.agents/progress.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: current project config with explicit project defaults and no duplicate per-item values.

- [ ] **Step 1: Capture the pre-migration generated template**

Run: `pnpm generate`

Run: `Copy-Item -LiteralPath 'output\templates\Custom_Clash.ini' -Destination "$env:TEMP\ClashRouteKit-before-defaults.ini"`

Expected: generation succeeds and the snapshot contains seven health-check lines ending in `300,,50`.

- [ ] **Step 2: Apply the exact YAML migration**

Insert after `publishBaseUrl`:

```yaml
defaults:
  proxyGroups:
    healthCheck:
      url: https://cp.cloudflare.com/generate_204
      interval: 300
      timeout: 5
    urlTest:
      tolerance: 50
  ruleSets:
    ruleProviderInterval: 28800
    geoipNoResolve: true
```

Remove only:

- Seven URLTest groups' `url`, `interval`, `tolerance` fields.
- Six Rule Provider `interval: 28800` fields.
- Seven GEOIP `noResolve: true` fields.

Do not edit any `nodeFilters`, group options, type, policy, section, provider recipe or array order.

- [ ] **Step 3: Verify config-level behavior**

Run: `pnpm check`

Expected: `[check] ok`.

Run: `pnpm generate`

Expected: generation succeeds.

Run:

```powershell
$before = Get-Content -Raw "$env:TEMP\ClashRouteKit-before-defaults.ini"
$after = Get-Content -Raw 'output\templates\Custom_Clash.ini'
$normalized = $after -replace '300,5,50', '300,,50'
if ($normalized -ne $before) { throw 'Generated INI changed outside the intended timeout slots' }
```

Expected: no exception; the only generated INI difference is seven `300,,50` tails becoming `300,5,50`.

- [ ] **Step 4: Run focused tests, then the complete suite**

Run:

```powershell
pnpm exec vitest run packages/core/tests/defaults.test.ts packages/core/tests/importIni.test.ts packages/core/tests/renderIni.test.ts packages/core/tests/configDocument.test.ts apps/cli/tests/cli.test.ts apps/web/tests/configMutations.test.ts apps/web/tests/draftValidation.test.ts apps/web/tests/routeSummary.test.ts apps/web/tests/groupNav.test.tsx apps/web/tests/groupContextPanel.test.tsx apps/web/tests/inheritedSettingField.test.tsx apps/web/tests/groupDrawer.test.tsx apps/web/tests/projectDefaultsDrawer.test.tsx apps/web/tests/ruleDrawer.test.tsx apps/web/tests/routingPage.test.tsx apps/web/tests/libraryPage.test.tsx apps/web/tests/ruleStream.test.tsx
```

Run: `pnpm test`

Run: `pnpm typecheck`

Run: `pnpm build`

Expected: all commands PASS; the existing Ant Design deprecation warning may remain non-blocking.

- [ ] **Step 5: Perform a browser-level routing-page smoke test**

Run: `pnpm dev`

Verify manually or with the available browser runner:

1. Left pane has one ordered strategy-group list and no service/region headings.
2. “全部规则” remains first.
3. A region node pool shows parent-group references even with zero direct RuleSets.
4. Project defaults Drawer opens from routing and library contexts on the expected tab.
5. URLTest group Drawer shows inherited URL/interval/timeout/tolerance and permits explicit empty timeout.
6. Rule Provider and GEOIP drawers expose inherit/custom states.
7. Preview INI shows `300,5,50` for inherited current-project URLTest groups.

- [ ] **Step 6: Audit the final workspace diff**

Run: `git status --short`

Run: `git diff --check`

Run: `git diff -- config/routes.yaml packages/core/src packages/core/tests apps/cli/src/program.ts apps/cli/tests/cli.test.ts apps/web/src apps/web/tests .agents/active.md .agents/progress.md`

Expected: no whitespace errors; every new change maps to this plan; pre-existing unrelated changes remain preserved.

- [ ] **Step 7: Record the milestone**

Update `.agents/active.md` with final commands and any non-blocking warning. Append a dated entry to `.agents/progress.md` covering:

- defaults model and timeout semantics;
- ordered strategy-group relationship UI;
- current config migration;
- exact verification commands and results.

- [ ] **Step 8: Create a final implementation commit only when isolation is safe**

Because several target files were already modified before this task, first inspect `git diff --cached --name-status` and the complete cached patch. If task-owned hunks are cleanly isolated, commit them with:

```powershell
git commit -m "feat: add project defaults and proxy group relationships"
```

If isolation is not safe, leave implementation changes uncommitted and report the verified file list instead of absorbing pre-existing work.
