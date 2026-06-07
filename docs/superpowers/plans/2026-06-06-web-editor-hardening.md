# Web 编辑器稳定性与可用性强化实施计划

> 状态：本计划被 `2026-06-07-routes-first-editor.md` 吸收并改序。样式回归、规则文件 dirty 状态和发布门禁仍要做，但先执行 Routes 原语模型大改；涉及 `config/modules.yaml` 的步骤后续按 `config/routes.yaml` 重写。

> **给 agentic worker 的说明：** 必须按任务逐项执行本计划，并使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans。步骤使用 checkbox（`- [ ]`）语法追踪进度。

**目标：** 在完整配置编辑器已可用的基础上，修补容易回归的 UI 和保存流程，让本地 Web 编辑器更适合日常反复维护配置。

**架构：** 继续保持 local-first，不引入 Docker、托管后端、GitHub OAuth 或浏览器 token。新增状态逻辑优先放入纯 TypeScript helper，React 组件只负责呈现和调用；UI 回归先用静态 CSS 测试和浏览器 QA 覆盖，避免一开始引入重量级 e2e 依赖。

**技术栈：** React 19、TypeScript、Vite、Vitest、`@clash-route-kit/core`、本地 Vite middleware、全局 CSS、Playwright MCP 手动 QA。

---

## 阶段边界

本阶段继续服务本地项目工作流：

- 用户在本地 clone 中运行 `pnpm dev`。
- Web UI 写入 `config/modules.yaml` 和 `config/rules/*.list`。
- 发布仍走本机 Git 凭据和 GitHub Actions `publish` 分支。
- Docker、devcontainer 和 SubConverter compose 仍不是默认路径。

本阶段重点解决：

- 表单/列表/Provider source 的样式回归可被测试发现。
- 实体列表行中的名称和详情不会互相挤压，长输出文件名不能把名称遮挡到只剩首字母。
- 规则文件编辑器拥有独立 dirty 状态，切换文件时不会静默丢失编辑。
- Publish 工作流明确阻止脏草稿、未检查、未生成时的危险动作。
- Provider source 编辑更可读，补齐 `basePath` 这个已经存在于类型和校验中的字段。
- 浏览器 QA 有固定清单，不再只凭构建通过判断 UI 正常。

## 文件结构

- 创建 `apps/web/tests/stylesRegression.test.ts`
  用 Vitest 静态扫描 CSS，锁定主题变量、`.form-grid`、`.entity-row` 和 `.source-row` 的关键约束。
- 创建 `apps/web/src/ruleFileController.ts`
  管理规则文件列表、当前文件、原始文本、dirty 状态和保存就绪状态。
- 创建 `apps/web/tests/ruleFileController.test.ts`
  覆盖规则文件加载、编辑、保存和切换保护。
- 修改 `apps/web/src/components/RuleFileWorkspace.tsx`
  从 controller 导入 `RuleFileState`，显示 dirty 状态并禁用无效保存。
- 修改 `apps/web/src/App.tsx`
  使用 `ruleFileController` 更新规则文件状态，切换文件前确认未保存修改。
- 修改 `apps/web/src/components/RuleProviderEditor.tsx`
  为 source 行增加字段标签、placeholder 和 `basePath` 输入。
- 修改 `apps/web/src/styles.css`
  将 source 行调整为更清晰的两行网格，保留窄容器下不溢出的约束。
- 修改 `apps/web/src/publishWorkflow.ts`
  增加 `getPublishActionBlockReason`，把警告升级为按钮禁用原因。
- 修改 `apps/web/tests/publishWorkflow.test.ts`
  覆盖脏草稿、未 check、未 generate、无 git 变更时的动作门禁。
- 修改 `apps/web/src/components/PublishPanel.tsx`
  根据门禁状态禁用 action 按钮，并显示原因。
- 修改 `docs/superpowers/plans/2026-06-06-web-full-config-editor.md`
  在最终 QA 记录中补充本次 CSS 回归和下一阶段衔接。

## 任务 1：补 UI 样式回归测试

**文件：**
- 创建：`apps/web/tests/stylesRegression.test.ts`
- 修改：`apps/web/src/styles.css`

- [ ] **步骤 1：编写 CSS 回归测试**

创建 `apps/web/tests/stylesRegression.test.ts`：

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "apps/web/src/styles.css"), "utf8");

function declaredThemeVariables(text: string): Set<string> {
  return new Set([...text.matchAll(/--([a-z0-9-]+)\s*:/gi)].map((match) => match[1]!));
}

function usedThemeVariables(text: string): Set<string> {
  return new Set([...text.matchAll(/var\(--([a-z0-9-]+)/gi)].map((match) => match[1]!));
}

function cssRule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...css.matchAll(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, "g"))];
  const match = matches.at(-1);
  if (!match) throw new Error(`Missing CSS rule: ${selector}`);
  return match[1]!;
}

describe("web editor CSS regression checks", () => {
  it("does not reference undefined theme variables", () => {
    const declared = declaredThemeVariables(css);
    const missing = [...usedThemeVariables(css)].filter((name) => !declared.has(name));

    expect(missing).toEqual([]);
  });

  it("keeps editor form controls on the styled grid", () => {
    expect(css).toContain(".form-grid {");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(css).toContain(".form-grid input,");
    expect(css).toContain(".form-grid textarea");
  });

  it("keeps entity list labels readable instead of squeezing them behind details", () => {
    const entityRow = cssRule(".entity-row");

    expect(entityRow).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(entityRow).not.toContain("auto");
  });

  it("keeps provider source rows shrinkable inside narrow editor columns", () => {
    expect(css).toContain(".source-row {");
    expect(css).toContain("grid-template-columns: minmax(0, 0.8fr) minmax(0, 0.8fr) minmax(0, 1.4fr) 36px;");
    expect(css).not.toContain("minmax(130px, 0.8fr) minmax(120px, 0.8fr) minmax(180px, 1.4fr)");
  });

  it("collapses form and source rows on mobile", () => {
    expect(css).toMatch(/@media \(max-width: 600px\)[\s\S]*\.form-grid[\s\S]*grid-template-columns: 1fr;/);
    expect(css).toMatch(/@media \(max-width: 600px\)[\s\S]*\.source-row[\s\S]*grid-template-columns: 1fr;/);
  });
});
```

- [ ] **步骤 2：运行测试并确认通过**

运行：

```powershell
pnpm test -- apps/web/tests/stylesRegression.test.ts
```

预期：测试通过。如果失败，只修 `apps/web/src/styles.css` 中被测试指出的缺口，不改业务逻辑。

- [ ] **步骤 3：运行 CSS 相关构建验证**

运行：

```powershell
pnpm typecheck
pnpm build
```

预期：TypeScript 和 Vite build 通过。

## 任务 2：规则文件 dirty 状态和切换保护

**文件：**
- 创建：`apps/web/src/ruleFileController.ts`
- 创建：`apps/web/tests/ruleFileController.test.ts`
- 修改：`apps/web/src/components/RuleFileWorkspace.tsx`
- 修改：`apps/web/src/App.tsx`

- [ ] **步骤 1：编写失败测试**

创建 `apps/web/tests/ruleFileController.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import {
  createRuleFileState,
  editRuleFileText,
  markRuleFileListLoaded,
  markRuleFileLoaded,
  markRuleFileSaved,
  canLeaveRuleFile,
} from "../src/ruleFileController.js";

describe("rule file controller", () => {
  it("loads file lists and selects the first file when current selection disappeared", () => {
    const state = markRuleFileListLoaded(createRuleFileState(), ["AI.list", "Direct.list"]);

    expect(state.selectedFile).toBe("AI.list");
    expect(state.files).toEqual(["AI.list", "Direct.list"]);
    expect(state.message).toBe("已读取规则文件列表");
  });

  it("tracks dirty text against the loaded baseline", () => {
    const loaded = markRuleFileLoaded(createRuleFileState(), "AI.list", "DOMAIN,example.com\n");
    const edited = editRuleFileText(loaded, "DOMAIN,example.com\nDOMAIN,openai.com\n");

    expect(loaded.dirty).toBe(false);
    expect(edited.dirty).toBe(true);
    expect(canLeaveRuleFile(edited)).toEqual({
      ok: false,
      reason: "规则文件 AI.list 有未保存修改",
    });
  });

  it("marks a saved rule file clean", () => {
    const edited = editRuleFileText(
      markRuleFileLoaded(createRuleFileState(), "AI.list", "DOMAIN,example.com\n"),
      "DOMAIN,openai.com\n",
    );
    const saved = markRuleFileSaved(edited, "AI.list", "DOMAIN,openai.com\n");

    expect(saved.dirty).toBe(false);
    expect(saved.originalText).toBe("DOMAIN,openai.com\n");
    expect(saved.message).toBe("已保存 config/rules/AI.list");
  });
});
```

- [ ] **步骤 2：运行测试并确认失败**

运行：

```powershell
pnpm test -- apps/web/tests/ruleFileController.test.ts
```

预期：失败，因为 `ruleFileController.ts` 尚不存在。

- [ ] **步骤 3：实现 controller**

创建 `apps/web/src/ruleFileController.ts`：

```ts
export type RuleFileStatus = "idle" | "loading" | "saving" | "error";

export interface RuleFileState {
  files: string[];
  selectedFile: string;
  originalText: string;
  text: string;
  dirty: boolean;
  status: RuleFileStatus;
  message: string;
}

export type RuleFileLeaveReadiness =
  | { ok: true }
  | { ok: false; reason: string };

export function createRuleFileState(): RuleFileState {
  return {
    files: [],
    selectedFile: "",
    originalText: "",
    text: "",
    dirty: false,
    status: "idle",
    message: "尚未读取规则文件",
  };
}

export function setRuleFileStatus(
  state: RuleFileState,
  status: RuleFileStatus,
  message: string,
): RuleFileState {
  return {
    ...state,
    status,
    message,
  };
}

export function markRuleFileListLoaded(state: RuleFileState, files: string[]): RuleFileState {
  const selectedFile = state.selectedFile && files.includes(state.selectedFile)
    ? state.selectedFile
    : files[0] ?? "";

  return {
    ...state,
    files,
    selectedFile,
    status: "idle",
    message: files.length > 0 ? "已读取规则文件列表" : "config/rules 下暂无 .list 文件",
  };
}

export function markRuleFileLoaded(
  state: RuleFileState,
  file: string,
  text: string,
): RuleFileState {
  return {
    ...state,
    selectedFile: file,
    originalText: text,
    text,
    dirty: false,
    status: "idle",
    message: `已读取 config/rules/${file}`,
  };
}

export function editRuleFileText(state: RuleFileState, text: string): RuleFileState {
  return {
    ...state,
    text,
    dirty: text !== state.originalText,
  };
}

export function markRuleFileSaved(
  state: RuleFileState,
  file: string,
  text: string,
): RuleFileState {
  return {
    ...state,
    selectedFile: file,
    originalText: text,
    text,
    dirty: false,
    status: "idle",
    message: `已保存 config/rules/${file}`,
  };
}

export function canLeaveRuleFile(state: RuleFileState): RuleFileLeaveReadiness {
  if (!state.dirty) return { ok: true };
  return {
    ok: false,
    reason: `规则文件 ${state.selectedFile} 有未保存修改`,
  };
}
```

- [ ] **步骤 4：接入组件和 App**

修改 `apps/web/src/components/RuleFileWorkspace.tsx`，移除本地 `RuleFileState` interface，改为：

```ts
import type { RuleFileState } from "../ruleFileController.js";
```

保存按钮禁用条件改为：

```tsx
disabled={!ruleFileState.selectedFile || !ruleFileState.dirty || ruleFileState.status === "saving"}
```

标题右侧增加状态：

```tsx
<span className={`run-state ${ruleFileState.dirty ? "running" : "success"}`}>
  {ruleFileState.dirty ? "dirty" : "clean"}
</span>
```

修改 `apps/web/src/App.tsx`：

```ts
import {
  canLeaveRuleFile,
  createRuleFileState,
  editRuleFileText,
  markRuleFileListLoaded,
  markRuleFileLoaded,
  markRuleFileSaved,
  setRuleFileStatus,
} from "./ruleFileController.js";
```

初始化 state：

```ts
const [ruleFileState, setRuleFileState] = useState(createRuleFileState);
```

在 `refreshRuleFiles` 中替换成功状态更新：

```ts
setRuleFileState((current) => markRuleFileListLoaded(current, files));
```

在错误分支使用：

```ts
setRuleFileState((current) =>
  setRuleFileStatus(current, "error", error instanceof Error ? error.message : String(error)),
);
```

在 `loadSelectedRuleFile` 开头添加：

```ts
const leaveReadiness = canLeaveRuleFile(ruleFileState);
if (!leaveReadiness.ok && !window.confirm(`${leaveReadiness.reason}，仍要切换文件吗？`)) return;
```

读取成功后：

```ts
setRuleFileState((current) => markRuleFileLoaded(current, result.file, result.text));
```

保存成功后：

```ts
setRuleFileState((current) => markRuleFileSaved(current, result.file, result.text));
```

传给 `WorkspaceRouter` 的文本变更改为：

```tsx
onRuleFileTextChange={(text) => setRuleFileState((current) => editRuleFileText(current, text))}
```

- [ ] **步骤 5：验证**

运行：

```powershell
pnpm test -- apps/web/tests/ruleFileController.test.ts
pnpm typecheck
pnpm build
```

浏览器验证：

- 打开 Rules。
- 选择一个 `.list` 文件。
- 修改文本，确认状态变成 dirty，保存按钮可用。
- 不保存切换另一个文件，确认出现浏览器确认框。
- 点击取消后仍停留在原文件。
- 保存后状态恢复 clean。

## 任务 3：强化 Provider Source 编辑器

**文件：**
- 修改：`apps/web/src/components/RuleProviderEditor.tsx`
- 修改：`apps/web/src/styles.css`

- [ ] **步骤 1：改造 source 行结构**

将 `apps/web/src/components/RuleProviderEditor.tsx` 中 `provider.sources.map` 内的 `.source-row` 内容替换为带标签的字段：

```tsx
<div className="source-row" key={`${source.name}-${index}`}>
  <label>
    <span>类型</span>
    <select
      value={source.type}
      onChange={(event) =>
        onSetProviderSources(
          provider.name,
          provider.sources.map((item, itemIndex) =>
            itemIndex === index ? createSource(event.target.value as RuleProviderSource["type"]) : item,
          ),
        )
      }
    >
      {sourceTypes.map((type) => (
        <option key={type} value={type}>{type}</option>
      ))}
    </select>
  </label>
  <label>
    <span>名称</span>
    <input
      placeholder="Source"
      value={source.name}
      onChange={(event) =>
        onSetProviderSources(
          provider.name,
          provider.sources.map((item, itemIndex) =>
            itemIndex === index ? updateSource(item, { name: event.target.value }) : item,
          ),
        )
      }
    />
  </label>
  <label className="source-path-field">
    <span>{"path" in source ? "路径" : "Entry"}</span>
    {"path" in source ? (
      <input
        placeholder="config/rules/Source.list"
        value={source.path}
        onChange={(event) =>
          onSetProviderSources(
            provider.name,
            provider.sources.map((item, itemIndex) =>
              itemIndex === index ? updateSource(item, { path: event.target.value }) : item,
            ),
          )
        }
      />
    ) : (
      <input
        placeholder="geosite category"
        value={source.entry}
        onChange={(event) =>
          onSetProviderSources(
            provider.name,
            provider.sources.map((item, itemIndex) =>
              itemIndex === index ? updateSource(item, { entry: event.target.value }) : item,
            ),
          )
        }
      />
    )}
  </label>
  <label>
    <span>Base Path</span>
    <input
      placeholder="vendor/domain-list-community/data"
      value={source.basePath ?? ""}
      onChange={(event) =>
        onSetProviderSources(
          provider.name,
          provider.sources.map((item, itemIndex) =>
            itemIndex === index ? updateSource(item, { basePath: event.target.value || undefined }) : item,
          ),
        )
      }
    />
  </label>
  <button
    className="icon-button source-remove-button"
    type="button"
    aria-label="remove source"
    onClick={() =>
      onSetProviderSources(provider.name, provider.sources.filter((_, itemIndex) => itemIndex !== index))
    }
  >
    x
  </button>
</div>
```

- [ ] **步骤 2：更新 source 行样式**

修改 `apps/web/src/styles.css`：

```css
.source-row {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 0.85fr) 36px;
  gap: 8px;
  min-width: 0;
}

.source-row label {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.source-row span {
  color: var(--muted);
  font-size: 12px;
}

.source-path-field {
  grid-column: 1 / -2;
}

.source-remove-button {
  grid-column: 3;
  grid-row: 1;
  align-self: end;
}
```

在 `@media (max-width: 600px)` 中保留：

```css
.source-row {
  grid-template-columns: 1fr;
  align-items: stretch;
}

.source-path-field,
.source-remove-button {
  grid-column: auto;
  grid-row: auto;
}
```

- [ ] **步骤 3：验证**

运行：

```powershell
pnpm typecheck
pnpm build
```

浏览器验证：

- 打开 Providers。
- Provider source 行显示字段标签，路径字段不挤出第二列。
- 填写 `basePath` 后 dirty 状态出现。
- 保存后 `config/modules.yaml` 中对应 source 包含 `basePath`。
- 在 1280px 和 390px 视口都没有横向溢出。

## 任务 4：发布工作流门禁

**文件：**
- 修改：`apps/web/src/publishWorkflow.ts`
- 修改：`apps/web/tests/publishWorkflow.test.ts`
- 修改：`apps/web/src/components/PublishPanel.tsx`

- [ ] **步骤 1：编写失败测试**

在 `apps/web/tests/publishWorkflow.test.ts` 追加：

```ts
import { getPublishActionBlockReason } from "../src/publishWorkflow.js";

it("blocks publish actions while the project draft is dirty", () => {
  const states = createInitialActionStates();

  expect(getPublishActionBlockReason("check", states, { dirty: true })).toBe("请先保存 config/modules.yaml");
  expect(getPublishActionBlockReason("generate", states, { dirty: true })).toBe("请先保存 config/modules.yaml");
  expect(getPublishActionBlockReason("git-commit", states, { dirty: true })).toBe("请先保存 config/modules.yaml");
});

it("requires check and generate before commit", () => {
  let states = createInitialActionStates();

  expect(getPublishActionBlockReason("git-commit", states, { dirty: false })).toBe("提交前必须先通过检查");

  states = updateActionState(states, "check", { status: "success", output: "ok" });
  expect(getPublishActionBlockReason("git-commit", states, { dirty: false })).toBe("提交前必须先生成输出");

  states = updateActionState(states, "generate", { status: "success", output: "generated" });
  expect(getPublishActionBlockReason("git-commit", states, { dirty: false })).toBeUndefined();
});

it("requires commit before push", () => {
  let states = createInitialActionStates();
  states = updateActionState(states, "check", { status: "success", output: "ok" });
  states = updateActionState(states, "generate", { status: "success", output: "generated" });

  expect(getPublishActionBlockReason("git-push", states, { dirty: false })).toBe("推送前必须先提交配置");

  states = updateActionState(states, "git-commit", { status: "success", output: "[git] committed route config" });
  expect(getPublishActionBlockReason("git-push", states, { dirty: false })).toBeUndefined();
});
```

- [ ] **步骤 2：实现门禁 helper**

在 `apps/web/src/publishWorkflow.ts` 添加：

```ts
export interface PublishActionContext {
  dirty: boolean;
}

export function getPublishActionBlockReason(
  action: LocalRouteKitAction,
  states: LocalActionStates,
  context: PublishActionContext,
): string | undefined {
  if (context.dirty && action !== "git-status") return "请先保存 config/modules.yaml";
  if (action === "git-commit") {
    if (states.check.status !== "success") return "提交前必须先通过检查";
    if (states.generate.status !== "success") return "提交前必须先生成输出";
  }
  if (action === "git-push" && states["git-commit"].status !== "success") {
    return "推送前必须先提交配置";
  }
  return undefined;
}
```

- [ ] **步骤 3：接入 PublishPanel**

在 `apps/web/src/components/PublishPanel.tsx` import 中加入：

```ts
getPublishActionBlockReason,
```

在 `publishActions.map` 内计算：

```ts
const blockReason = getPublishActionBlockReason(action, actionStates, { dirty });
```

按钮改为：

```tsx
<button
  className="command-button"
  disabled={running || Boolean(blockReason)}
  type="button"
  onClick={() => onRun(action)}
>
```

在 warning 下面显示 block reason：

```tsx
{blockReason ? <p className="action-warning">{blockReason}</p> : null}
```

- [ ] **步骤 4：验证**

运行：

```powershell
pnpm test -- apps/web/tests/publishWorkflow.test.ts
pnpm typecheck
pnpm build
```

浏览器验证：

- 草稿 dirty 时，check/generate/commit/push 禁用并提示先保存。
- 保存后 check 可运行。
- check 成功前 commit 禁用。
- generate 成功前 commit 禁用。
- commit 成功前 push 禁用。

## 任务 5：最终浏览器 QA 与文档衔接

**文件：**
- 修改：`docs/superpowers/plans/2026-06-06-web-full-config-editor.md`

- [ ] **步骤 1：运行完整验证**

运行：

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm check
pnpm generate
git diff --check
```

预期：

- Vitest 全部通过。
- TypeScript workspace typecheck 通过。
- Vite production build 通过。
- `pnpm check` 无诊断。
- `pnpm generate` 成功写入 `output/`。
- `git diff --check` 没有空白错误；Windows 换行 warning 可以接受。

- [ ] **步骤 2：浏览器 QA**

运行：

```powershell
pnpm dev
```

打开本地 Vite URL，验证：

- 1280x864：Policies 表单字段使用主题样式，无标签重叠。
- 1280x864：Providers source 行在第二列内，无面板溢出。
- 390x844：Policies、Providers、Rules 不产生横向滚动。
- Rules：dirty、切换确认、保存后 clean 全部正确。
- Publish：门禁提示符合任务 4。
- 浏览器 console 无 error/warning。

在浏览器控制台或 Playwright MCP 中执行：

```js
document.documentElement.scrollWidth <= window.innerWidth
```

桌面和移动端预期都为 `true`。

- [ ] **步骤 3：更新上一阶段计划记录**

在 `docs/superpowers/plans/2026-06-06-web-full-config-editor.md` 的最终 QA 之后追加：

```md
## 后续稳定性阶段衔接

本阶段实现后发现一次 UI 样式回归：新增编辑器字段使用 `.form-grid`，但样式表缺少对应定义；Provider source 行也因为硬编码最小列宽在窄桌面下溢出。已在本阶段后修复，并将下一阶段定义为 Web 编辑器稳定性与可用性强化，重点加入样式回归测试、规则文件 dirty 状态、Provider source 可读性和发布门禁。
```

## 自检

- 范围覆盖：计划覆盖这次暴露的样式回归、第二列溢出、规则文件保存风险和发布顺序风险。
- Docker 决策：仍明确不做默认 Docker 部署；local-first 是主路径。
- 类型一致性：复用现有 `RuleProviderSource`、`LocalRouteKitAction`、`RuleFileState` 概念，只把规则文件状态从组件内迁出为纯 helper。
- 验证路径：每个状态变更都有 Vitest；视觉回归用 CSS 静态测试加桌面/移动浏览器 QA。
