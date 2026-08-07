# Explicit Drawer Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将策略组、RuleSet 和项目默认值三个抽屉改为事务式显式保存，简化 GEOIP/no-resolve 与 nullable 覆盖交互，并阻止配置写盘触发 Vite 整页重载。

**Architecture:** 三个抽屉各自维护本地编辑草稿，通过纯函数完成克隆、规范化和保存前校验；保存时调用原子配置 mutation 一次提交完整实体，其他页面操作继续使用现有自动保存。Vite 开发服务器只忽略实际 `config/routes.yaml` 文件的监听事件，从根因上切断“API 写盘 → HMR 整页重载”链路。

**Tech Stack:** TypeScript 5.8、React 19、Ant Design 5、Vite 7、Vitest 3、Testing Library、pnpm workspace。

## Global Constraints

- 仅策略组、RuleSet、项目默认值三个抽屉改为显式保存；不引入全局手动保存。
- 抽屉内字段变化不得修改全局项目草稿或触发 600 毫秒自动写盘。
- 规则开关、排序、增删、导入及其他既有操作继续自动保存。
- `nodeFilters` 使用多行文本，每行一项；忽略全空白行并保持非空行顺序。
- 删除“明确留空”选项；`timeout` / `tolerance` 的自定义空输入保存为 `null`。
- 项目级 `geoipNoResolve` 只显示开启/关闭；缺失时初始化并保存为 `true`。
- 单条 GEOIP RuleSet 继续支持继承项目默认值、开启、关闭。
- 不改变 Core 的 INI 导入、渲染和旧最小配置兜底行为。
- 当前工作树包含大量既有未提交修改；每个任务先审阅目标文件 diff，不回滚、不覆盖、不把无关修改带入提交。
- 所有手工文件修改使用 `apply_patch`；不使用脚本重写源文件。

---

## File Structure

### Draft model and mutations

- Create: `apps/web/src/drawerDrafts.ts` — 抽屉编辑类型、深拷贝、节点过滤文本转换、保存前规范化与校验。
- Create: `apps/web/tests/drawerDrafts.test.ts` — 草稿转换、nullable 数值、GEOIP 默认值和校验测试。
- Modify: `apps/web/src/configMutations.ts` — 新增策略组和 RuleSet 的完整原子替换 mutation。
- Modify: `apps/web/tests/configMutations.test.ts` — 原子替换、重命名引用和数组位置测试。
- Modify: `apps/web/src/useProjectDraftActions.ts` — 暴露完整保存 action，并移除抽屉不再使用的逐字段 action。

### Shared inherited controls

- Modify: `apps/web/src/components/InheritedSettingField.tsx` — 模式缩减为继承/自定义，`null` 映射为自定义空输入。
- Modify: `apps/web/tests/inheritedSettingField.test.tsx` — 两态模式与清空输入测试。

### Transactional drawers

- Modify: `apps/web/src/components/GroupDrawer.tsx` — 本地策略组草稿、多行正则、保存/取消和校验。
- Modify: `apps/web/tests/groupDrawer.test.tsx` — 不即时提交、完整保存、取消和正则转换测试。
- Modify: `apps/web/src/components/RuleDrawer.tsx` — 本地 RuleSet 草稿、保存/取消和三态 GEOIP 单项覆盖。
- Modify: `apps/web/tests/ruleDrawer.test.tsx` — 不即时提交、完整保存、取消和校验测试。
- Modify: `apps/web/src/components/ProjectDefaultsDrawer.tsx` — 本地默认值草稿、两态 GEOIP 和保存/取消。
- Modify: `apps/web/tests/projectDefaultsDrawer.test.tsx` — `geoipNoResolve: true` 物化和事务式保存测试。
- Modify: `apps/web/src/components/RoutingPage.tsx` — 三个抽屉的完整保存 wiring。
- Modify: `apps/web/tests/routingPage.test.tsx` — 策略组、RuleSet、默认值仅在保存时调用 draft action。
- Modify: `apps/web/src/components/LibraryPage.tsx` — 规则默认值抽屉保存 wiring。
- Modify: `apps/web/tests/libraryPage.test.tsx` — 规则默认值保存/取消页面集成测试。

### Vite reload regression

- Modify: `apps/web/vite.config.ts` — 解析实际配置路径并以 matcher 忽略该文件。
- Create: `apps/web/tests/viteConfig.test.ts` — 默认、相对和绝对配置路径 matcher 测试。

### Project memory

- Modify: `.agents/active.md` — 当前任务、规格、计划、验证状态。
- Modify: `.agents/progress.md` — 完成后记录显式保存与 HMR 修复里程碑。

---

### Task 1: Add drawer draft normalization and atomic entity mutations

**Files:**

- Create: `apps/web/src/drawerDrafts.ts`
- Create: `apps/web/tests/drawerDrafts.test.ts`
- Modify: `apps/web/src/configMutations.ts`
- Modify: `apps/web/tests/configMutations.test.ts`

**Interfaces:**

- Produces: `EditableCustomProxyGroup`, whose `interval` may temporarily be `null` while the custom input is blank.
- Produces: `EditableRuleSet`, whose Rule Provider `interval` may temporarily be `null`.
- Produces: `DraftResult<T> = { ok: true; value: T } | { ok: false; error: string }`.
- Produces: `createCustomProxyGroupDraft(group: CustomProxyGroup): CustomProxyGroupDraft` and `finalizeCustomProxyGroupDraft(draft: CustomProxyGroupDraft, groups: ReadonlyArray<Pick<CustomProxyGroup, "name">>, originalName: string): DraftResult<CustomProxyGroup>`.
- Produces: `createRuleSetDraft(ruleSet: RuleSet): EditableRuleSet` and `finalizeRuleSetDraft(draft: EditableRuleSet, ruleSetIds: string[], originalId: string): DraftResult<RuleSet>`.
- Produces: `createProjectDefaultsDraft(defaults?: RouteKitDefaults): RouteKitDefaults` and `finalizeProjectDefaultsDraft(defaults: RouteKitDefaults): DraftResult<RouteKitDefaults>`.
- Produces: `nodeFiltersToText(filters)` and `nodeFiltersFromText(text)`.
- Produces: `replaceCustomProxyGroup(config, originalName, nextGroup)` and `replaceRuleSet(config, originalId, nextRuleSet)`.

- [ ] **Step 1: Write failing node-filter and default-draft tests**

Add `apps/web/tests/drawerDrafts.test.ts` with these exact behaviors:

```ts
import { describe, expect, it } from "vitest";
import {
  createProjectDefaultsDraft,
  finalizeProjectDefaultsDraft,
  nodeFiltersFromText,
  nodeFiltersToText,
} from "../src/drawerDrafts.js";

describe("drawer draft helpers", () => {
  it("round-trips node filters through one-regex-per-line text", () => {
    expect(nodeFiltersToText(["(港|HK)", "!!GROUPID=0!!US"])).toBe(
      "(港|HK)\n!!GROUPID=0!!US",
    );
    expect(nodeFiltersFromText("(港|HK)\r\n  \r\n!!GROUPID=0!!US\n")).toEqual([
      "(港|HK)",
      "!!GROUPID=0!!US",
    ]);
  });

  it("materializes GEOIP no-resolve as true in project defaults", () => {
    const draft = createProjectDefaultsDraft(undefined);
    expect(draft.ruleSets?.geoipNoResolve).toBe(true);
    expect(finalizeProjectDefaultsDraft(draft)).toEqual({
      ok: true,
      value: { ruleSets: { geoipNoResolve: true } },
    });
  });
});
```

- [ ] **Step 2: Write failing editable-number validation tests**

Extend the same file:

```ts
import {
  createCustomProxyGroupDraft,
  createRuleSetDraft,
  finalizeCustomProxyGroupDraft,
  finalizeRuleSetDraft,
} from "../src/drawerDrafts.js";

it("accepts custom empty timeout and tolerance but rejects empty interval", () => {
  const draft = createCustomProxyGroupDraft({
    name: "Auto",
    type: "url-test",
    options: [],
    nodeFilters: [".*"],
  });
  draft.group.timeout = null;
  draft.group.tolerance = null;
  expect(finalizeCustomProxyGroupDraft(draft, [draft.group], "Auto")).toMatchObject({
    ok: true,
    value: { timeout: null, tolerance: null },
  });

  draft.group.interval = null;
  expect(finalizeCustomProxyGroupDraft(draft, [draft.group], "Auto")).toEqual({
    ok: false,
    error: "测速间隔（秒）不能为空",
  });
});

it("rejects a blank custom Rule Provider interval", () => {
  const draft = createRuleSetDraft({
    id: "ai-provider",
    policy: "AI",
    source: { type: "rule-provider", behavior: "domain", file: "AI.yaml" },
  });
  if (draft.source.type !== "rule-provider") throw new Error("unexpected source");
  draft.source.interval = null;
  expect(finalizeRuleSetDraft(draft, [draft.id], "ai-provider")).toEqual({
    ok: false,
    error: "更新间隔（秒）不能为空",
  });
});
```

- [ ] **Step 3: Run the helper tests and verify RED**

Run:

```powershell
pnpm exec vitest run apps/web/tests/drawerDrafts.test.ts
```

Expected: FAIL because `apps/web/src/drawerDrafts.ts` does not exist.

- [ ] **Step 4: Implement the draft helper types and conversions**

Create `apps/web/src/drawerDrafts.ts` with these public type shapes:

```ts
import {
  validateDefaultAwareConfig,
  type CustomProxyGroup,
  type RouteKitDefaults,
  type RuleProviderRuleSetSource,
  type RuleSet,
  type RuleSetSource,
} from "@clash-route-kit/core";

export type DraftResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type EditableCustomProxyGroup = Omit<CustomProxyGroup, "interval"> & {
  interval?: number | null;
};

export type EditableRuleProviderSource = Omit<RuleProviderRuleSetSource, "interval"> & {
  interval?: number | null;
};

export type EditableRuleSetSource =
  | Exclude<RuleSetSource, RuleProviderRuleSetSource>
  | EditableRuleProviderSource;

export type EditableRuleSet = Omit<RuleSet, "source"> & {
  source: EditableRuleSetSource;
};

export interface CustomProxyGroupDraft {
  group: EditableCustomProxyGroup;
  nodeFiltersText: string;
}
```

Implement line conversion without modifying non-empty regex text:

```ts
export function nodeFiltersToText(filters: string[] | undefined): string {
  return (filters ?? []).join("\n");
}

export function nodeFiltersFromText(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0);
}
```

Clone every nested array/source object when creating drafts. `createProjectDefaultsDraft` must always return this rule default shape even when input is missing:

```ts
ruleSets: {
  ...defaults?.ruleSets,
  geoipNoResolve: defaults?.ruleSets?.geoipNoResolve ?? true,
}
```

`finalizeProjectDefaultsDraft` must compact empty proxy-group branches but always retain `ruleSets.geoipNoResolve`. Validate the compact result with `validateDefaultAwareConfig` using an otherwise empty `RouteKitConfig`; return the first diagnostic as `error`.

- [ ] **Step 5: Implement entity finalizers**

`finalizeCustomProxyGroupDraft` must:

1. Trim and require the group name.
2. Reject another group with the same name while excluding `originalName`.
3. Convert `nodeFiltersText` to the array and use `undefined` when the array is empty.
4. Require at least one option or node filter.
5. Validate HTTP/HTTPS URL, positive integer interval/timeout, and non-negative integer tolerance.
6. Permit only timeout/tolerance to remain `null`.
7. Clone `options` and `nodeFilters` in the returned `CustomProxyGroup`.

`finalizeRuleSetDraft` must:

1. Trim and require the ID.
2. Reject another RuleSet with the same ID while excluding `originalId`.
3. Require policy.
4. Require GEOSITE/GEOIP value or Rule Provider file according to source type.
5. Reject `null`, zero, negative, or fractional Rule Provider interval.
6. Convert an empty section string to `undefined` and clone the source object.

- [ ] **Step 6: Run helper tests and verify GREEN**

Run:

```powershell
pnpm exec vitest run apps/web/tests/drawerDrafts.test.ts
```

Expected: PASS.

- [ ] **Step 7: Write failing atomic-mutation tests**

Add to `apps/web/tests/configMutations.test.ts`:

```ts
import {
  replaceCustomProxyGroup,
  replaceRuleSet,
} from "../src/configMutations.js";

it("atomically replaces and renames a custom proxy group without moving it", () => {
  const config = {
    ...createConfig(),
    customProxyGroups: [
      { name: "Proxy", type: "select", options: ["HK", "DIRECT"] },
      { name: "HK", type: "url-test", options: [], nodeFilters: ["(港|HK)"] },
    ],
    ruleSets: [
      { id: "hk", policy: "HK", source: { type: "geosite", value: "hk" } },
      { id: "final", policy: "Proxy", source: { type: "final" } },
    ],
  } satisfies RouteKitProjectConfig;

  const next = replaceCustomProxyGroup(config, "HK", {
    name: "Hong Kong",
    type: "fallback",
    options: [],
    nodeFilters: ["(港|HK)", "HKG"],
    timeout: 8,
  });

  expect(next.customProxyGroups.map((group) => group.name)).toEqual(["Proxy", "Hong Kong"]);
  expect(next.customProxyGroups[0]?.options).toEqual(["Hong Kong", "DIRECT"]);
  expect(next.ruleSets[0]?.policy).toBe("Hong Kong");
  expect(next.customProxyGroups[1]).toMatchObject({ type: "fallback", timeout: 8 });
});

it("atomically replaces a RuleSet and keeps its index", () => {
  const config = createConfig();
  const next = replaceRuleSet(config, "ai-geosite-openai", {
    id: "ai-geosite-anthropic",
    policy: "Proxy",
    section: "AI",
    source: { type: "geosite", value: "anthropic" },
  });
  expect(next.ruleSets.map((ruleSet) => ruleSet.id)).toEqual([
    "ai-geosite-anthropic",
    "final",
  ]);
});
```

- [ ] **Step 8: Run mutation tests and verify RED**

Run:

```powershell
pnpm exec vitest run apps/web/tests/configMutations.test.ts
```

Expected: FAIL because both complete replacement functions are missing.

- [ ] **Step 9: Implement atomic replacement functions**

Add to `apps/web/src/configMutations.ts`:

```ts
export function replaceCustomProxyGroup(
  config: RouteKitProjectConfig,
  originalName: string,
  nextGroup: CustomProxyGroup,
): RouteKitProjectConfig {
  const name = nextGroup.name.trim();
  const renamed = renameCustomProxyGroup(config, originalName, name);
  return updateCustomProxyGroup(renamed, name, {
    ...nextGroup,
    name,
    options: [...nextGroup.options],
    nodeFilters: nextGroup.nodeFilters ? [...nextGroup.nodeFilters] : undefined,
  });
}
```

`replaceRuleSet` must trim/require the new ID, reject duplicates excluding `originalId`, clone the source, and replace only the matching index:

```ts
export function replaceRuleSet(
  config: RouteKitProjectConfig,
  originalId: string,
  nextRuleSet: RuleSet,
): RouteKitProjectConfig {
  const id = nextRuleSet.id.trim();
  if (!id) throw new Error("RuleSet id is required");
  if (id !== originalId && config.ruleSets.some((ruleSet) => ruleSet.id === id)) {
    throw new Error(`RuleSet "${id}" already exists`);
  }
  return {
    ...config,
    ruleSets: config.ruleSets.map((ruleSet) =>
      ruleSet.id === originalId
        ? cloneRuleSet({ ...nextRuleSet, id })
        : ruleSet,
    ),
  };
}
```

- [ ] **Step 10: Run focused tests and typecheck**

Run:

```powershell
pnpm exec vitest run apps/web/tests/drawerDrafts.test.ts apps/web/tests/configMutations.test.ts
pnpm --filter @clash-route-kit/web typecheck
```

Expected: PASS.

- [ ] **Step 11: Review the scoped diff**

Run:

```powershell
git diff -- apps/web/src/drawerDrafts.ts apps/web/tests/drawerDrafts.test.ts apps/web/src/configMutations.ts apps/web/tests/configMutations.test.ts
git diff --check -- apps/web/src/drawerDrafts.ts apps/web/tests/drawerDrafts.test.ts apps/web/src/configMutations.ts apps/web/tests/configMutations.test.ts
```

Expected: only Task 1 behavior is added; pre-existing unrelated hunks remain untouched.

---

### Task 2: Collapse inherited setting controls to inherit/custom

**Files:**

- Modify: `apps/web/src/components/InheritedSettingField.tsx`
- Modify: `apps/web/tests/inheritedSettingField.test.tsx`

**Interfaces:**

- Changes: `InheritedSettingMode` becomes `"inherit" | "custom"`.
- Changes: `modeForValue(null)` returns `"custom"`.
- Changes: `InheritedNumberSetting.onChange` continues accepting `number | null | undefined` so drawers can represent custom blank inputs.
- Removes: `allowEmpty` and the “明确留空” option.

- [ ] **Step 1: Replace the three-state tests with failing two-state tests**

Update `apps/web/tests/inheritedSettingField.test.tsx`:

```ts
it("maps undefined to inherit and null or values to custom", () => {
  expect(modeForValue(undefined)).toBe("inherit");
  expect(modeForValue(null)).toBe("custom");
  expect(modeForValue(8)).toBe("custom");
});

it("does not expose a separate explicit-empty mode", () => {
  render(
    <AppProviders>
      <InheritedNumberSetting
        label="测速超时（秒）"
        value={null}
        resolved={{ value: undefined, source: "empty" }}
        customFallback={5}
        onChange={() => {}}
      />
    </AppProviders>,
  );
  expect(screen.queryByText("明确留空")).toBeNull();
  expect(screen.getByRole("combobox", { name: "测速超时（秒）模式" }).textContent).toContain("自定义");
  expect((screen.getByLabelText("测速超时（秒）") as HTMLInputElement).value).toBe("");
});
```

Add a clearing test:

```ts
it("emits null when a custom number input is cleared", () => {
  const onChange = vi.fn();
  render(
    <AppProviders>
      <InheritedNumberSetting
        label="测速超时（秒）"
        value={8}
        resolved={{ value: 8, source: "item" }}
        customFallback={5}
        onChange={onChange}
      />
    </AppProviders>,
  );
  fireEvent.change(screen.getByLabelText("测速超时（秒）"), { target: { value: "" } });
  expect(onChange).toHaveBeenLastCalledWith(null);
});
```

- [ ] **Step 2: Run the inherited-field test and verify RED**

Run:

```powershell
pnpm exec vitest run apps/web/tests/inheritedSettingField.test.tsx
```

Expected: FAIL because `null` still maps to `empty` and the third option still renders.

- [ ] **Step 3: Implement the two-state control**

Make these exact semantic changes:

```ts
export type InheritedSettingMode = "inherit" | "custom";

export function modeForValue(
  value: string | number | null | undefined,
): InheritedSettingMode {
  return value === undefined ? "inherit" : "custom";
}
```

`ModeSelect` must always render only:

```ts
[
  { value: "inherit", label: "继承项目默认值" },
  { value: "custom", label: "自定义" },
]
```

For number inputs:

```ts
onChange={(value) => props.onChange(value)}
```

Ant Design supplies `null` when the field is cleared. Keep the custom input visible because `modeForValue(null)` is `custom`. For an effective resolver source of `empty`, render the caption as `当前使用单项覆盖：未设置`; do not render “明确留空”.

- [ ] **Step 4: Run tests and typecheck**

Run:

```powershell
pnpm exec vitest run apps/web/tests/inheritedSettingField.test.tsx
pnpm --filter @clash-route-kit/web typecheck
```

Expected: PASS after downstream call sites are adjusted to remove `allowEmpty`; if typecheck identifies those two props in `GroupDrawer`, remove them without changing drawer behavior yet.

- [ ] **Step 5: Review the scoped diff**

Run:

```powershell
git diff -- apps/web/src/components/InheritedSettingField.tsx apps/web/tests/inheritedSettingField.test.tsx apps/web/src/components/GroupDrawer.tsx
git diff --check -- apps/web/src/components/InheritedSettingField.tsx apps/web/tests/inheritedSettingField.test.tsx apps/web/src/components/GroupDrawer.tsx
```

Expected: only the mode simplification and necessary prop removal are present.

---

### Task 3: Make GroupDrawer transactional and use multiline regex text

**Files:**

- Modify: `apps/web/src/components/GroupDrawer.tsx`
- Modify: `apps/web/tests/groupDrawer.test.tsx`
- Modify: `apps/web/src/useProjectDraftActions.ts`
- Modify: `apps/web/src/components/RoutingPage.tsx`
- Modify: `apps/web/tests/routingPage.test.tsx`

**Interfaces:**

- `GroupDrawer.onSave(nextGroup: CustomProxyGroup)` replaces `onUpdate`, `onRename`, and `onSetListField`.
- `GroupDrawer.onCancel()` is used by the Drawer close control and footer cancel button.
- `useProjectDraftActions.saveCustomProxyGroup(originalName, nextGroup)` performs one state mutation.

- [ ] **Step 1: Write failing transactional GroupDrawer tests**

Replace immediate-update assertions in `apps/web/tests/groupDrawer.test.tsx` with:

```ts
it("keeps group edits local until Save is clicked", async () => {
  const onSave = vi.fn();
  render(
    <AppProviders>
      <GroupDrawer
        open
        group={{ name: "Auto", type: "url-test", options: [], nodeFilters: [".*"] }}
        groups={[{ name: "Auto", type: "url-test", options: [], nodeFilters: [".*"] }]}
        inbound={[]}
        onSave={onSave}
        onCancel={() => {}}
        onDelete={() => {}}
        onJumpToRule={() => {}}
      />
    </AppProviders>,
  );

  fireEvent.mouseDown(screen.getByRole("combobox", { name: "策略组类型" }));
  fireEvent.click(await screen.findByText("fallback"));
  fireEvent.change(screen.getByLabelText("节点过滤正则"), {
    target: { value: "(港|HK)\nHKG" },
  });
  await new Promise((resolve) => setTimeout(resolve, 650));
  expect(onSave).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    name: "Auto",
    type: "fallback",
    nodeFilters: ["(港|HK)", "HKG"],
  }));
});
```

Add cancellation and nullable-field tests:

```ts
it("discards edits when Cancel is clicked", () => {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(
    <AppProviders>
      <GroupDrawer
        open
        group={{ name: "Auto", type: "url-test", options: [], nodeFilters: [".*"] }}
        groups={[{ name: "Auto", type: "url-test", options: [], nodeFilters: [".*"] }]}
        inbound={[]}
        onSave={onSave}
        onCancel={onCancel}
        onDelete={() => {}}
        onJumpToRule={() => {}}
      />
    </AppProviders>,
  );
  fireEvent.change(screen.getByDisplayValue("Auto"), { target: { value: "Changed" } });
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(onSave).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledTimes(1);
});

it("saves a custom blank timeout as null", async () => {
  const onSave = vi.fn();
  render(
    <AppProviders>
      <GroupDrawer
        open
        group={{
          name: "Auto",
          type: "url-test",
          options: [],
          nodeFilters: [".*"],
          timeout: 8,
        }}
        groups={[{ name: "Auto", type: "url-test", options: [], nodeFilters: [".*"] }]}
        inbound={[]}
        onSave={onSave}
        onCancel={() => {}}
        onDelete={() => {}}
        onJumpToRule={() => {}}
      />
    </AppProviders>,
  );
  fireEvent.change(screen.getByLabelText("测速超时（秒）"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ timeout: null }));
});

it("keeps duplicate-name validation inside the Drawer", () => {
  const onSave = vi.fn();
  render(
    <AppProviders>
      <GroupDrawer
        open
        group={{ name: "Auto", type: "url-test", options: [], nodeFilters: [".*"] }}
        groups={[
          { name: "Proxy", type: "select", options: ["DIRECT"] },
          { name: "Auto", type: "url-test", options: [], nodeFilters: [".*"] },
        ]}
        inbound={[]}
        onSave={onSave}
        onCancel={() => {}}
        onDelete={() => {}}
        onJumpToRule={() => {}}
      />
    </AppProviders>,
  );
  fireEvent.change(screen.getByDisplayValue("Auto"), { target: { value: "Proxy" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.getByText('custom_proxy_group "Proxy" already exists')).toBeTruthy();
  expect(onSave).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run GroupDrawer tests and verify RED**

Run:

```powershell
pnpm exec vitest run apps/web/tests/groupDrawer.test.tsx
```

Expected: FAIL because the Drawer still emits field-level callbacks and node filters still use `Select mode="tags"`.

- [ ] **Step 3: Implement GroupDrawer local state**

Use one state object plus one error string:

```ts
const [draft, setDraft] = useState<CustomProxyGroupDraft | null>(() =>
  props.group ? createCustomProxyGroupDraft(props.group) : null,
);
const [error, setError] = useState("");

useEffect(() => {
  if (props.open && props.group) {
    setDraft(createCustomProxyGroupDraft(props.group));
    setError("");
  }
}, [props.open, props.group?.name]);
```

All controls must read and update `draft.group`; no field handler may call a parent callback. Replace the node-filter Select with:

```tsx
<Input.TextArea
  aria-label="节点过滤正则"
  value={draft.nodeFiltersText}
  autoSize={{ minRows: 3, maxRows: 10 }}
  onChange={(event) =>
    setDraft((current) => current
      ? { ...current, nodeFiltersText: event.target.value }
      : current)
  }
/>
```

Resolve effective health-check captions from the local draft. For the temporary invalid `interval: null`, pass `undefined` to the Core resolver while leaving the editor value as `null`.

- [ ] **Step 4: Add footer Save/Cancel and local validation**

Use Drawer footer actions:

```tsx
footer={(
  <Space style={{ display: "flex", justifyContent: "flex-end" }}>
    <Button onClick={props.onCancel}>取消</Button>
    <Button type="primary" onClick={handleSave}>保存</Button>
  </Space>
)}
```

`onClose` must call `props.onCancel`. `handleSave` must call `finalizeCustomProxyGroupDraft`; on failure set the local error and keep the Drawer open, and on success call `props.onSave(result.value)` exactly once. Render the error with `Alert type="error" showIcon` above the footer content.

- [ ] **Step 5: Add the complete draft action**

In `apps/web/src/useProjectDraftActions.ts`, import `replaceCustomProxyGroup` and add:

```ts
saveCustomProxyGroup(originalName: string, nextGroup: CustomProxyGroup) {
  setProject((current) => {
    try {
      const next = applyDraftConfig(
        current,
        replaceCustomProxyGroup(current.draftConfig, originalName, nextGroup),
      );
      return dirtyMessage({
        ...next,
        selectedCustomProxyGroupName:
          current.selectedCustomProxyGroupName === originalName
            ? nextGroup.name
            : next.selectedCustomProxyGroupName,
      });
    } catch (error: unknown) {
      return mutationError(current, error);
    }
  });
},
```

Remove the now-unused drawer-facing actions `renameCustomProxyGroup`, `setCustomProxyGroupListField`, and `updateCustomProxyGroup` from the hook return object and imports. Keep their pure mutation exports because existing tests and non-hook code still cover them.

- [ ] **Step 6: Wire GroupDrawer in RoutingPage**

Replace three field callbacks with:

```tsx
onSave={(nextGroup) => {
  if (!drawerGroup) return;
  draftActions.saveCustomProxyGroup(drawerGroup, nextGroup);
  if (selectedGroup === drawerGroup) setSelectedGroup(nextGroup.name);
  setDrawerGroup(null);
}}
onCancel={() => setDrawerGroup(null)}
```

Keep delete immediate. `onJumpToRule` must close the Drawer and discard any local edits.

- [ ] **Step 7: Add RoutingPage save-wiring assertions**

In `apps/web/tests/routingPage.test.tsx`, add this helper:

```ts
function makeDraftActions(overrides: Record<string, unknown> = {}) {
  const fallback = vi.fn();
  return new Proxy(overrides, {
    get(target, key) {
      return Reflect.has(target, key) ? Reflect.get(target, key) : fallback;
    },
  }) as ReturnType<typeof useProjectDraftActions>;
}
```

Then add:

```ts
it("commits a complete strategy group only after Drawer Save", async () => {
  const saveCustomProxyGroup = vi.fn();
  render(
    <AppProviders>
      <RoutingPage
        config={config}
        selectedRuleSetId="geosite-gfw"
        draftActions={makeDraftActions({ saveCustomProxyGroup })}
        fetcher={vi.fn()}
      />
    </AppProviders>,
  );
  fireEvent.click(screen.getByLabelText("编辑 HK"));
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "策略组类型" }));
  fireEvent.click(await screen.findByText("fallback"));
  expect(saveCustomProxyGroup).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(saveCustomProxyGroup).toHaveBeenCalledWith(
    "HK",
    expect.objectContaining({ type: "fallback" }),
  );
});
```

- [ ] **Step 8: Run focused tests and typecheck**

Run:

```powershell
pnpm exec vitest run apps/web/tests/groupDrawer.test.tsx apps/web/tests/routingPage.test.tsx apps/web/tests/configMutations.test.ts
pnpm --filter @clash-route-kit/web typecheck
```

Expected: PASS.

- [ ] **Step 9: Review the scoped diff**

Run:

```powershell
git diff -- apps/web/src/components/GroupDrawer.tsx apps/web/tests/groupDrawer.test.tsx apps/web/src/useProjectDraftActions.ts apps/web/src/components/RoutingPage.tsx apps/web/tests/routingPage.test.tsx
git diff --check -- apps/web/src/components/GroupDrawer.tsx apps/web/tests/groupDrawer.test.tsx apps/web/src/useProjectDraftActions.ts apps/web/src/components/RoutingPage.tsx apps/web/tests/routingPage.test.tsx
```

Expected: strategy-group editing is the only behavior changed in this task.

---

### Task 4: Make RuleDrawer transactional

**Files:**

- Modify: `apps/web/src/components/RuleDrawer.tsx`
- Modify: `apps/web/tests/ruleDrawer.test.tsx`
- Modify: `apps/web/src/useProjectDraftActions.ts`
- Modify: `apps/web/src/components/RoutingPage.tsx`
- Modify: `apps/web/tests/routingPage.test.tsx`

**Interfaces:**

- `RuleDrawer.onSave(nextRuleSet: RuleSet)` replaces `onUpdate`.
- `RuleDrawer.onCancel()` handles close and footer cancel.
- Add prop `ruleSetIds: string[]` for duplicate validation.
- `useProjectDraftActions.saveRuleSet(originalId, nextRuleSet)` performs one atomic state mutation.

- [ ] **Step 1: Write failing local-edit and complete-save tests**

Replace the immediate `onUpdate` expectations in `apps/web/tests/ruleDrawer.test.tsx`:

```ts
it("keeps RuleSet edits local until Save is clicked", async () => {
  const onSave = vi.fn();
  render(
    <AppProviders>
      <RuleDrawer
        open
        ruleSet={{
          id: "ai-geosite-openai",
          policy: "AI",
          source: { type: "geosite", value: "openai" },
        }}
        ruleSetIds={["ai-geosite-openai", "final"]}
        policies={["AI", "Direct"]}
        onSave={onSave}
        onCancel={() => {}}
        onDelete={() => {}}
      />
    </AppProviders>,
  );

  fireEvent.mouseDown(screen.getByRole("combobox", { name: "归属策略组" }));
  fireEvent.click((await screen.findAllByText("Direct")).at(-1)!);
  fireEvent.change(screen.getByDisplayValue("openai"), {
    target: { value: "anthropic" },
  });
  expect(onSave).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenCalledWith({
    id: "ai-geosite-openai",
    policy: "Direct",
    source: { type: "geosite", value: "anthropic" },
  });
});
```

Add these tests after the complete-save case:

```ts
it("discards RuleSet edits when Cancel is clicked", () => {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(
    <AppProviders>
      <RuleDrawer
        open
        ruleSet={{ id: "geo", policy: "AI", source: { type: "geosite", value: "openai" } }}
        ruleSetIds={["geo", "final"]}
        policies={["AI"]}
        onSave={onSave}
        onCancel={onCancel}
        onDelete={() => {}}
      />
    </AppProviders>,
  );
  fireEvent.change(screen.getByDisplayValue("openai"), { target: { value: "anthropic" } });
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(onSave).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledTimes(1);
});

it("rejects a duplicate RuleSet ID without saving", () => {
  const onSave = vi.fn();
  render(
    <AppProviders>
      <RuleDrawer
        open
        ruleSet={{ id: "geo", policy: "AI", source: { type: "geosite", value: "openai" } }}
        ruleSetIds={["geo", "final"]}
        policies={["AI"]}
        onSave={onSave}
        onCancel={() => {}}
        onDelete={() => {}}
      />
    </AppProviders>,
  );
  fireEvent.change(screen.getByLabelText("规则 ID"), { target: { value: "final" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.getByText('RuleSet "final" already exists')).toBeTruthy();
  expect(onSave).not.toHaveBeenCalled();
});

it("rejects a blank custom Rule Provider interval", async () => {
  const onSave = vi.fn();
  render(
    <AppProviders>
      <RuleDrawer
        open
        ruleSet={{
          id: "provider",
          policy: "AI",
          source: { type: "rule-provider", behavior: "domain", file: "AI.yaml", interval: 600 },
        }}
        ruleSetIds={["provider", "final"]}
        policies={["AI"]}
        onSave={onSave}
        onCancel={() => {}}
        onDelete={() => {}}
      />
    </AppProviders>,
  );
  fireEvent.change(screen.getByLabelText("更新间隔（秒）"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.getByText("更新间隔（秒）不能为空")).toBeTruthy();
  expect(onSave).not.toHaveBeenCalled();
});

it("keeps inherit, enabled and disabled for per-rule GEOIP no-resolve", async () => {
  render(
    <AppProviders>
      <RuleDrawer
        open
        ruleSet={{ id: "geoip-cn", policy: "AI", source: { type: "geoip", value: "cn" } }}
        ruleSetIds={["geoip-cn", "final"]}
        policies={["AI"]}
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
      />
    </AppProviders>,
  );
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "GEOIP no-resolve" }));
  expect(await screen.findByText("继承项目默认值")).toBeTruthy();
  expect(screen.getByText("开启")).toBeTruthy();
  expect(screen.getByText("关闭")).toBeTruthy();
});
```

- [ ] **Step 2: Run RuleDrawer tests and verify RED**

Run:

```powershell
pnpm exec vitest run apps/web/tests/ruleDrawer.test.tsx
```

Expected: FAIL because RuleDrawer still calls `onUpdate` on every field change.

- [ ] **Step 3: Implement local EditableRuleSet state**

Initialize and reset with:

```ts
const [draft, setDraft] = useState<EditableRuleSet | null>(() =>
  props.ruleSet ? createRuleSetDraft(props.ruleSet) : null,
);
const [error, setError] = useState("");

useEffect(() => {
  if (props.open && props.ruleSet) {
    setDraft(createRuleSetDraft(props.ruleSet));
    setError("");
  }
}, [props.open, props.ruleSet?.id]);
```

All ID, source, policy, section and enabled controls must update `draft`. Preserve these GEOIP options exactly:

```ts
[
  { value: "inherit", label: "继承项目默认值" },
  { value: "enabled", label: "开启" },
  { value: "disabled", label: "关闭" },
]
```

Rule Provider interval clearing must remain `null` in the editable source until Save validation rejects it or the user chooses inherit.

- [ ] **Step 4: Add footer Save/Cancel and validation**

Use this footer and save handler shape:

```tsx
footer={(
  <Space style={{ display: "flex", justifyContent: "flex-end" }}>
    <Button onClick={props.onCancel}>取消</Button>
    <Button type="primary" onClick={handleSave}>保存</Button>
  </Space>
)}
```

`handleSave` calls:

```ts
const result = finalizeRuleSetDraft(draft, props.ruleSetIds, props.ruleSet.id);
```

On failure show an in-drawer `Alert`; on success call `props.onSave(result.value)` once. Close button and Cancel call `props.onCancel` without saving.

- [ ] **Step 5: Add saveRuleSet draft action**

In `apps/web/src/useProjectDraftActions.ts`:

```ts
saveRuleSet(originalId: string, nextRuleSet: RuleSet) {
  setProject((current) => {
    try {
      const next = applyDraftConfig(
        current,
        replaceRuleSet(current.draftConfig, originalId, nextRuleSet),
      );
      return dirtyMessage({
        ...next,
        selectedRuleSetId:
          current.selectedRuleSetId === originalId
            ? nextRuleSet.id
            : next.selectedRuleSetId,
      });
    } catch (error: unknown) {
      return mutationError(current, error);
    }
  });
},
```

Remove the hook's drawer-facing `updateRuleSet` method; keep the pure `updateRuleSet` import because `toggleRuleSet` in `configMutations.ts` still uses it internally, not through this hook.

- [ ] **Step 6: Wire RuleDrawer in RoutingPage**

Pass `ruleSetIds={config.ruleSets.map((ruleSet) => ruleSet.id)}` and replace `onUpdate` with:

```tsx
onSave={(nextRuleSet) => {
  if (!editRuleId) return;
  draftActions.saveRuleSet(editRuleId, nextRuleSet);
  setEditRuleId(null);
}}
onCancel={() => setEditRuleId(null)}
```

Delete remains immediate and closes the Drawer.

- [ ] **Step 7: Add RoutingPage RuleSet wiring test**

Add:

```ts
it("commits a complete RuleSet only after Drawer Save", async () => {
  const saveRuleSet = vi.fn();
  render(
    <AppProviders>
      <RoutingPage
        config={config}
        selectedRuleSetId="geosite-gfw"
        draftActions={makeDraftActions({ saveRuleSet })}
        fetcher={vi.fn()}
      />
    </AppProviders>,
  );
  fireEvent.click(screen.getByLabelText("编辑 geosite-gfw"));
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "归属策略组" }));
  fireEvent.click((await screen.findAllByText("HK")).at(-1)!);
  expect(saveRuleSet).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(saveRuleSet).toHaveBeenCalledWith(
    "geosite-gfw",
    expect.objectContaining({ policy: "HK" }),
  );
});
```

- [ ] **Step 8: Run focused tests and typecheck**

Run:

```powershell
pnpm exec vitest run apps/web/tests/ruleDrawer.test.tsx apps/web/tests/routingPage.test.tsx apps/web/tests/inheritedSettingField.test.tsx
pnpm --filter @clash-route-kit/web typecheck
```

Expected: PASS.

- [ ] **Step 9: Review the scoped diff**

Run:

```powershell
git diff -- apps/web/src/components/RuleDrawer.tsx apps/web/tests/ruleDrawer.test.tsx apps/web/src/useProjectDraftActions.ts apps/web/src/components/RoutingPage.tsx apps/web/tests/routingPage.test.tsx
git diff --check -- apps/web/src/components/RuleDrawer.tsx apps/web/tests/ruleDrawer.test.tsx apps/web/src/useProjectDraftActions.ts apps/web/src/components/RoutingPage.tsx apps/web/tests/routingPage.test.tsx
```

Expected: RuleSet drawer editing is the only new behavior in this task.

---

### Task 5: Make ProjectDefaultsDrawer transactional and two-state

**Files:**

- Modify: `apps/web/src/components/ProjectDefaultsDrawer.tsx`
- Modify: `apps/web/tests/projectDefaultsDrawer.test.tsx`
- Modify: `apps/web/src/components/RoutingPage.tsx`
- Modify: `apps/web/tests/routingPage.test.tsx`
- Modify: `apps/web/src/components/LibraryPage.tsx`
- Modify: `apps/web/tests/libraryPage.test.tsx`

**Interfaces:**

- `ProjectDefaultsDrawer.onSave(defaults: RouteKitDefaults)` replaces `onChange`.
- `ProjectDefaultsDrawer.onCancel()` handles close and footer cancel.
- Project GEOIP Select has only `enabled` and `disabled`.

- [ ] **Step 1: Write failing default-drawer transaction tests**

Update `apps/web/tests/projectDefaultsDrawer.test.tsx`:

```ts
it("keeps default edits local and materializes GEOIP true on Save", () => {
  const onSave = vi.fn();
  render(
    <AppProviders>
      <ProjectDefaultsDrawer
        open
        initialSection="proxy-groups"
        defaults={undefined}
        onSave={onSave}
        onCancel={() => {}}
      />
    </AppProviders>,
  );

  fireEvent.change(screen.getByLabelText("项目测速超时（秒）"), {
    target: { value: "5" },
  });
  expect(onSave).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(onSave).toHaveBeenCalledWith({
    proxyGroups: { healthCheck: { timeout: 5 } },
    ruleSets: { geoipNoResolve: true },
  });
});
```

Add:

```ts
it("shows only enabled and disabled GEOIP project defaults", async () => {
  render(
    <AppProviders>
      <ProjectDefaultsDrawer
        open
        initialSection="rule-sets"
        defaults={undefined}
        onSave={() => {}}
        onCancel={() => {}}
      />
    </AppProviders>,
  );
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "GEOIP 默认 no-resolve" }));
  expect(await screen.findByText("开启")).toBeTruthy();
  expect(screen.getByText("关闭")).toBeTruthy();
  expect(screen.queryByText("使用程序默认值（开启）")).toBeNull();
});

it("discards default edits when Cancel is clicked", () => {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(
    <AppProviders>
      <ProjectDefaultsDrawer
        open
        initialSection="proxy-groups"
        defaults={{ proxyGroups: { healthCheck: { timeout: 5 } } }}
        onSave={onSave}
        onCancel={onCancel}
      />
    </AppProviders>,
  );
  fireEvent.change(screen.getByLabelText("项目测速超时（秒）"), { target: { value: "8" } });
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(onSave).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledTimes(1);
});

it("keeps an invalid project URL inside the Drawer", () => {
  const onSave = vi.fn();
  render(
    <AppProviders>
      <ProjectDefaultsDrawer
        open
        initialSection="proxy-groups"
        defaults={undefined}
        onSave={onSave}
        onCancel={() => {}}
      />
    </AppProviders>,
  );
  fireEvent.change(screen.getByLabelText("项目测速 URL"), { target: { value: "ftp://probe" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.getByText("defaults.proxyGroups.healthCheck.url 必须是 HTTP/HTTPS URL")).toBeTruthy();
  expect(onSave).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run ProjectDefaultsDrawer tests and verify RED**

Run:

```powershell
pnpm exec vitest run apps/web/tests/projectDefaultsDrawer.test.tsx
```

Expected: FAIL because controls still call `onChange` immediately and the third GEOIP option still exists.

- [ ] **Step 3: Implement local defaults draft**

Replace direct use of `props.defaults` with:

```ts
const [draft, setDraft] = useState<RouteKitDefaults>(() =>
  createProjectDefaultsDraft(props.defaults),
);
const [error, setError] = useState("");

useEffect(() => {
  if (props.open) {
    setActiveSection(props.initialSection);
    setDraft(createProjectDefaultsDraft(props.defaults));
    setError("");
  }
}, [props.initialSection, props.open]);
```

All field changes update `draft` only. GEOIP Select must use:

```ts
value={draft.ruleSets?.geoipNoResolve === false ? "disabled" : "enabled"}
options={[
  { value: "enabled", label: "开启" },
  { value: "disabled", label: "关闭" },
]}
onChange={(value) => updateRuleSets({ geoipNoResolve: value === "enabled" })}
```

- [ ] **Step 4: Add footer Save/Cancel and validation**

`handleSave` calls `finalizeProjectDefaultsDraft(draft)`. On failure render an error Alert and remain open; on success call `props.onSave(result.value)` once. Drawer close and Cancel call `props.onCancel`.

- [ ] **Step 5: Wire the defaults Drawer on both pages**

RoutingPage and LibraryPage use:

```tsx
onSave={(defaults) => {
  draftActions.setProjectDefaults(defaults);
  setDefaultsSection(null);
}}
onCancel={() => setDefaultsSection(null)}
```

No changes are needed to `setProjectDefaults`; it remains one project mutation and existing auto-save then writes the complete config.

- [ ] **Step 6: Add page-level integration tests**

Add to `apps/web/tests/routingPage.test.tsx`:

```ts
it("commits project defaults only after Save", () => {
  const setProjectDefaults = vi.fn();
  render(
    <AppProviders>
      <RoutingPage
        config={config}
        selectedRuleSetId="geosite-gfw"
        draftActions={makeDraftActions({ setProjectDefaults })}
        fetcher={vi.fn()}
      />
    </AppProviders>,
  );
  fireEvent.click(screen.getByLabelText("项目默认值"));
  fireEvent.change(screen.getByLabelText("项目测速超时（秒）"), { target: { value: "5" } });
  expect(setProjectDefaults).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(setProjectDefaults).toHaveBeenCalledWith({
    proxyGroups: { healthCheck: { timeout: 5 } },
    ruleSets: { geoipNoResolve: true },
  });
});
```

Add to `apps/web/tests/libraryPage.test.tsx`:

```ts
it("cancels local rule-default edits without committing", async () => {
  const setProjectDefaults = vi.fn();
  const actions = new Proxy({ setProjectDefaults }, {
    get(target, key) {
      return Reflect.has(target, key) ? Reflect.get(target, key) : vi.fn();
    },
  }) as ReturnType<typeof useProjectDraftActions>;
  render(
    <AppProviders>
      <LibraryPage
        config={config}
        draftActions={actions}
        onRefreshConfig={() => {}}
        fetcher={makeFetcher()}
      />
    </AppProviders>,
  );
  await waitFor(() => expect(screen.getByText("ACL4SSR")).toBeTruthy());
  fireEvent.click(screen.getByLabelText("规则默认值"));
  fireEvent.change(screen.getByLabelText("Rule Provider 刷新间隔（秒）"), {
    target: { value: "600" },
  });
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(setProjectDefaults).not.toHaveBeenCalled();
});
```

- [ ] **Step 7: Run focused tests and typecheck**

Run:

```powershell
pnpm exec vitest run apps/web/tests/projectDefaultsDrawer.test.tsx apps/web/tests/routingPage.test.tsx apps/web/tests/libraryPage.test.tsx
pnpm --filter @clash-route-kit/web typecheck
```

Expected: PASS.

- [ ] **Step 8: Review the scoped diff**

Run:

```powershell
git diff -- apps/web/src/components/ProjectDefaultsDrawer.tsx apps/web/tests/projectDefaultsDrawer.test.tsx apps/web/src/components/RoutingPage.tsx apps/web/tests/routingPage.test.tsx apps/web/src/components/LibraryPage.tsx apps/web/tests/libraryPage.test.tsx
git diff --check -- apps/web/src/components/ProjectDefaultsDrawer.tsx apps/web/tests/projectDefaultsDrawer.test.tsx apps/web/src/components/RoutingPage.tsx apps/web/tests/routingPage.test.tsx apps/web/src/components/LibraryPage.tsx apps/web/tests/libraryPage.test.tsx
```

Expected: both defaults entry points share the same explicit-save behavior.

---

### Task 6: Ignore the actual project config in Vite file watching

**Files:**

- Modify: `apps/web/vite.config.ts`
- Create: `apps/web/tests/viteConfig.test.ts`

**Interfaces:**

- Produces: `resolveProjectConfigPath(projectRoot, configFile): string`.
- Produces: `createConfigWatchIgnore(projectRoot, configFile): (watchedPath: string) => boolean`.
- `server.watch.ignored` receives the matcher returned by `createConfigWatchIgnore`.

- [ ] **Step 1: Write failing path and matcher tests**

Create `apps/web/tests/viteConfig.test.ts`:

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createConfigWatchIgnore,
  resolveProjectConfigPath,
} from "../vite.config.js";

describe("Vite project config watch ignore", () => {
  it("resolves relative config files against the configured project root", () => {
    const projectRoot = path.resolve("fixture-project");
    expect(resolveProjectConfigPath(projectRoot, "config/routes.yaml")).toBe(
      path.resolve(projectRoot, "config/routes.yaml"),
    );
  });

  it("ignores only the resolved project config file", () => {
    const projectRoot = path.resolve("fixture-project");
    const ignore = createConfigWatchIgnore(projectRoot, "config/routes.yaml");
    expect(ignore(path.resolve(projectRoot, "config/routes.yaml"))).toBe(true);
    expect(ignore(path.resolve(projectRoot, "config/modules.yaml"))).toBe(false);
    expect(ignore(path.resolve(projectRoot, "apps/web/src/App.tsx"))).toBe(false);
  });

  it("honors an absolute CLASH_ROUTE_KIT_CONFIG path", () => {
    const absolute = path.resolve("fixture-config/routes.yaml");
    expect(resolveProjectConfigPath(path.resolve("other-root"), absolute)).toBe(absolute);
  });
});
```

- [ ] **Step 2: Run the Vite config test and verify RED**

Run:

```powershell
pnpm exec vitest run apps/web/tests/viteConfig.test.ts
```

Expected: FAIL because the path helpers are not exported and no watcher ignore exists.

- [ ] **Step 3: Implement the exact matcher**

In `apps/web/vite.config.ts`:

```ts
export function resolveProjectConfigPath(projectRoot: string, configuredFile: string): string {
  return path.resolve(projectRoot, configuredFile);
}

export function createConfigWatchIgnore(projectRoot: string, configuredFile: string) {
  const configPath = resolveProjectConfigPath(projectRoot, configuredFile);
  return (watchedPath: string): boolean => path.resolve(watchedPath) === configPath;
}
```

Use one resolved project root for API base and watcher configuration:

```ts
const projectRoot = path.resolve(process.env.CLASH_ROUTE_KIT_ROOT ?? root);
const configFile = process.env.CLASH_ROUTE_KIT_CONFIG ?? "config/routes.yaml";
```

Then configure:

```ts
server: {
  fs: { allow: [root] },
  watch: {
    ignored: createConfigWatchIgnore(projectRoot, configFile),
  },
},
```

The local API plugin must use `{ root: projectRoot, configFile }` so both components refer to the same physical file.

- [ ] **Step 4: Run focused tests and build**

Run:

```powershell
pnpm exec vitest run apps/web/tests/viteConfig.test.ts
pnpm --filter @clash-route-kit/web typecheck
pnpm --filter @clash-route-kit/web build
```

Expected: PASS. If Vite's watcher type requires a two-argument matcher, use `(watchedPath: string) => boolean` unchanged because functions with fewer parameters are assignable; do not broaden the ignore to the whole `config/` directory.

- [ ] **Step 5: Review the scoped diff**

Run:

```powershell
git diff -- apps/web/vite.config.ts apps/web/tests/viteConfig.test.ts
git diff --check -- apps/web/vite.config.ts apps/web/tests/viteConfig.test.ts
```

Expected: only the single actual config file is ignored.

---

### Task 7: Run regression verification and browser smoke test

**Files:**

- Modify: `.agents/active.md`
- Modify: `.agents/progress.md`

**Interfaces:**

- Consumes: all previous tasks.
- Produces: evidence that drawer edits are transactional, other actions still auto-save, and configuration writes no longer reload the page.

- [ ] **Step 1: Run all focused Web tests**

Run:

```powershell
pnpm exec vitest run apps/web/tests/drawerDrafts.test.ts apps/web/tests/configMutations.test.ts apps/web/tests/inheritedSettingField.test.tsx apps/web/tests/groupDrawer.test.tsx apps/web/tests/ruleDrawer.test.tsx apps/web/tests/projectDefaultsDrawer.test.tsx apps/web/tests/routingPage.test.tsx apps/web/tests/libraryPage.test.tsx apps/web/tests/viteConfig.test.ts
```

Expected: PASS with no new React state-update or Ant Design errors.

- [ ] **Step 2: Run the full repository gates**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm check
pnpm generate
```

Expected: every command PASS. Existing documented Ant Design deprecation warnings may remain non-blocking; no new warnings are accepted.

- [ ] **Step 3: Start a dev server against a temporary config copy**

Create a task-specific temporary directory with PowerShell `New-Item`, copy `config/routes.yaml` into it, and record the exact resolved path. Start `pnpm dev` with:

```powershell
$env:CLASH_ROUTE_KIT_CONFIG = '<absolute temporary routes.yaml path>'
pnpm dev
```

When launched through `Start-Process`, use `-WindowStyle Hidden`. Record the listener PID so cleanup targets only this process tree.

- [ ] **Step 4: Verify the original failure path in a real browser**

Perform these exact checks:

1. Open the routing page and edit the HK strategy group.
2. Change type from `url-test` to `fallback`.
3. Wait at least one second.
4. Confirm the Drawer remains open, the route page remains selected, and the temporary YAML hash has not changed.
5. Click Cancel and reopen; confirm type is still `url-test`.
6. Change type again and click Save.
7. Wait for the global auto-save status to return to saved.
8. Confirm the temporary YAML now contains `type: fallback`.
9. Confirm the application remains on the routing page and does not reload to the rule-library homepage.

Then perform these additional checks:

1. Open `geosite-gfw`, change its policy, wait one second, and confirm the Drawer remains open and the temporary YAML hash is unchanged.
2. Click Cancel, reopen it, and confirm the original policy remains selected.
3. Open project defaults, change Rule Provider interval, click Cancel, reopen, and confirm the original value remains.
4. In the strategy-group Drawer, confirm `节点过滤正则` is a multiline textbox.
5. Open timeout and tolerance mode selectors and confirm neither contains “明确留空”.
6. Open project rule defaults and confirm GEOIP has only “开启” and “关闭”.
7. Open an individual GEOIP RuleSet and confirm it still has “继承项目默认值 / 开启 / 关闭”.
8. For each of the three Drawers, make one local change and close it with the top-right close button; reopen and confirm the change was discarded and the temporary YAML hash did not change.

- [ ] **Step 5: Verify an existing non-drawer operation still auto-saves**

Toggle an ordinary RuleSet enabled switch outside the Drawer, wait for the debounce, and confirm the temporary YAML changes without requiring a Save button. Restore the toggle through the same UI action.

- [ ] **Step 6: Clean up the temporary server and files safely**

Stop only the recorded process tree, then validate and remove the exact temporary directory:

```powershell
taskkill /F /T /PID $devPid
$resolvedTaskTempDir = (Resolve-Path -LiteralPath $taskTempDir).Path
$resolvedRepository = (Resolve-Path -LiteralPath 'E:\Developer\Solutions\ClashRouteKit').Path
if ($resolvedTaskTempDir -eq $resolvedRepository) { throw 'Temporary directory resolved to repository root' }
if ($resolvedTaskTempDir.StartsWith($resolvedRepository + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Temporary directory unexpectedly resides inside repository'
}
if ($resolvedTaskTempDir -ne [IO.Path]::GetFullPath($taskTempDir)) {
  throw 'Temporary directory path changed before cleanup'
}
Remove-Item -LiteralPath $resolvedTaskTempDir -Recurse
```

- [ ] **Step 7: Audit the final diff**

Run:

```powershell
git status --short
git diff --check
git diff -- apps/web/src apps/web/tests apps/web/vite.config.ts .agents/active.md .agents/progress.md
```

Expected: every new hunk maps to this plan; unrelated pre-existing changes remain preserved; no production config was changed by browser verification.

- [ ] **Step 8: Update project memory**

Update `.agents/active.md` with the specification link, plan link, focused/full test results and browser result. Append one dated milestone to `.agents/progress.md` covering:

- three transactional drawers;
- multiline node-filter regex editing;
- two-state project GEOIP default and nullable custom blanks;
- Vite config-file watch ignore;
- exact verification commands.

- [ ] **Step 9: Create an implementation commit only if isolation is safe**

Inspect the complete staged patch before committing. Because most target files already contain pre-existing user changes, do not stage whole files if that would absorb unrelated work. If all task-owned hunks can be isolated safely, use:

```powershell
git commit -m "fix(web): save route drawers explicitly"
```

Otherwise leave implementation changes unstaged and report the verified file list. Never reset, checkout, or discard the user's existing modifications.
