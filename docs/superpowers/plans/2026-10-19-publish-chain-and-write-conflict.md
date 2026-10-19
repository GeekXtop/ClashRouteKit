# 修发布链 + 写冲突防护 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复断四周的发布链（routes.yaml 入库 + example 升 v2 + freshness 门禁），并给配置写入加 baseMtime 冲突检测与 `.list` 原子写。

**Architecture:** 数据流不变（web 编辑 → git-commit/push main → CI generate → publish 分支），只把"真实配置缺席"的断点逐个接上；写冲突用 mtime 乐观锁（GET 已返回 mtime，PUT 回传比对），失败 409 + 服务端当前全文，前端弹覆盖/重载。

**Tech Stack:** TypeScript strict / NodeNext ESM、Vitest、React + antd、`yaml@2.8`、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-10-19-publish-chain-and-write-conflict-design.md`

## Global Constraints

- strict TS、NodeNext ESM：本地 ESM 导入带显式 `.js` 后缀；两空格缩进、双引号、多行调用尾随逗号。
- 注释用简体中文，只写代码本身讲不出的约束（如 mtime 粒度限制）。
- 测试放对应包/应用旁 `tests/*.test.ts`，命名面向行为。
- **不修改** `.github/workflows/publish.yml`（兜底逻辑保留）；**不新增** npm 依赖。
- 工作树有他人在途改动（`package.json`、`pnpm-lock.yaml`、`.claude/settings.json`）：一律 `git add <显式路径>`，禁 `git add -A`，不触碰上述文件。workspace：主工作树（spec §6 已记录理由）。
- mtime 语义：文件不存在时 `statMtime` 返回 0（既有 `.catch(() => 0)` 模式）；`baseMtime: 0` 与之匹配即正常写入。
- TDD：每任务先写失败测试再实现；红→绿证据留在步骤里。

## Review Focus

按最可能咬人排序；每条已 pin 到对应任务的测试：

1. **fresh clone 下 GET→PUT**：文件不存在 → GET `mtime: 0`，PUT `baseMtime: 0` 应匹配并写入，不得误报冲突（Task 2 测试 pin）。
2. **example 被未来 schema 改动破坏**：freshness 测试必须红（Task 1 pin）。
3. **覆盖后二次冲突**：覆盖重试若再遇外部写入，须以最新 mtime 再次进冲突路径而非静默覆盖（Task 2/3 测试 pin）。
4. **`.list` 写入中断**：原子替换保证目录里只留下完整旧/新文件，无临时文件残留（Task 4 测试 pin，对齐 `atomic.test.ts` 既有模式）。
5. **双标签页后写**：后写者必须收到 409 + 服务端当前全文，前端呈现"覆盖/重载"而不是静默覆盖（Task 3 测试 pin）。

---

### Task 1: 发布链修复（commit 1）

**Files:**
- Create: `apps/cli/tests/configExamples.test.ts`
- Modify: `config/routes.yaml.example`（整文件重写）
- Modify: `.gitignore`（删 `config/routes.yaml` 行）
- Modify: `packages/local-server/src/git/gitActions.ts:141`（stage 清单）
- Modify: `packages/local-server/tests/gitActions.test.ts`（断言 add 参数）
- Modify: `README.md`（第 13 行步骤 3、第 64 行、第 280 行）

**Interfaces:**
- Produces: freshness 测试 `apps/cli/tests/configExamples.test.ts`（后续任何 example 改动都被它钉住）；`git-commit` 动作 stage `config/routes.yaml config/rules`。

- [ ] **Step 1: 写失败测试（freshness）**

```ts
// apps/cli/tests/configExamples.test.ts
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAuthorProjectConfig } from "@clash-route-kit/core";

const configDir = fileURLToPath(new URL("../../../config/", import.meta.url));

describe("config examples freshness", () => {
  it("所有 *.yaml.example 均可解析为 Schema v2", async () => {
    const files = (await readdir(configDir)).filter((name) => name.endsWith(".yaml.example"));
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const text = await readFile(path.join(configDir, name), "utf8");
      const parsed = parseAuthorProjectConfig(text);
      expect(parsed.v2.schemaVersion).toBe(2);
    }
  });
});
```

- [ ] **Step 2: 跑测试确认红**

Run: `pnpm --filter @clash-route-kit/cli exec vitest run tests/configExamples.test.ts`
Expected: FAIL——现 example 是 v1，`parseAuthorProjectConfig` 抛 `schema.version.unsupported`。

- [ ] **Step 3: 重写 `config/routes.yaml.example` 为 v2 模板（内容按下文逐字写入）**

```yaml
# ClashRouteKit 项目作者配置模板（Schema v2）。
# 从零开始时复制为 config/routes.yaml 再修改；本文件必须始终能通过 pnpm check。
schemaVersion: 2

# 工程字段：产物文件名与全局默认值。字段说明见 packages/core/src/config/schemaV2/types.ts
project:
  template:
    output: Custom_Clash.ini
  defaults:
    proxyGroups:
      # select 组未显式声明健康检查时回落到这里：改一处，全部 select 组生效
      healthCheck:
        url: https://cp.cloudflare.com/generate_204
        interval: 300
        timeout: 5

# 策略组：引用一律用稳定 id（group: <id>），不用显示名；插入新组不会漂移既有引用
proxyGroups:
  - id: manual
    name: 🚀 手动选择
    type: select
    members:
      - group: auto
    nodeFilters:
      - match: .*
  - id: auto
    name: ♻️ 自动选择
    type: url-test
    members: []
    nodeFilters:
      - match: .*
    url: https://cp.cloudflare.com/generate_204
    interval: 300
  - id: direct
    name: 🎯 全球直连
    type: select
    members:
      - builtin: DIRECT

# 路由：自上而下首条命中生效；source 支持 geosite / geoip / rule-provider / final；
# section 决定 INI 里的分组注释，建议每条都显式声明（不写会继承上一条）
routes:
  - id: custom-direct
    policy:
      group: direct
    source:
      type: rule-provider
      provider: custom-direct
    section: 本项目收录的直连规则
  - id: final
    policy:
      group: manual
    source:
      type: final

# 规则提供者：sources 引用本地 .list 或上游仓库；产物写到 output/<output>
ruleProviders:
  - id: custom-direct
    name: Custom_Direct
    output: Custom_Direct_Domain.yaml
    behavior: domain
    sources:
      - id: localdirect
        name: LocalDirect
        type: clash-list
        path: config/rules/Custom_Direct_Domain.list

# 上游规则仓库（可选）：pnpm sync:vendor 会 clone 到 vendor/（不入库）。示例：
# vendorRepos:
#   - id: acl4ssr
#     name: ACL4SSR
#     url: https://github.com/ACL4SSR/ACL4SSR.git
#     path: vendor/ACL4SSR
#     catalog:
#       dir: vendor/ACL4SSR/Clash
#       kind: list-dir

# 成员集（可选）：把一组 members 起个名字供多处 preset 引用，形状见 types.ts 的 MemberSet
```

- [ ] **Step 4: example 通过完整链路**

Run: `pnpm --filter @clash-route-kit/cli exec vitest run tests/configExamples.test.ts`（绿）
Run: `CLASH_ROUTE_KIT_CONFIG=config/routes.yaml.example pnpm check && CLASH_ROUTE_KIT_CONFIG=config/routes.yaml.example pnpm generate`（exit 0，`output/` 为模板产物，属 gitignored 可重建物）
若 generate 对模板报缺字段：按诊断以真实配置（`config/routes.yaml`）的对应形状补齐模板后重跑，不得放宽校验。

- [ ] **Step 5: 修 gitActions stage 清单并更新断言**

`gitActions.ts` 中 `await runCommand("git", ["add", "config/modules.yaml", "config/rules"], options.root)` 改为 `await runCommand("git", ["add", "config/routes.yaml", "config/rules"], options.root)`。
在 `gitActions.test.ts` 既有 "commits config changes through injected command runner" 用例中追加断言：

```ts
expect(commands.some((c) => c === "git add config/routes.yaml config/rules")).toBe(true);
expect(commands.some((c) => c.includes("config/modules.yaml"))).toBe(false);
```

- [ ] **Step 6: README 三处更新（第 13 / 64 / 280 行，按 spec §3.1 语义）**

- 第 13 行（快速开始步骤 3）改为：`3. 直接修改仓库内的 config/routes.yaml（已入库）；从零开始可复制 config/routes.yaml.example 作模板。`
- 第 64 行改为：`不提交到 main：订阅链接、最终 config.yaml、output/、vendor/、dist/、provider 缓存、.mrs、本地环境文件（.clashroutekit/）。config/routes.yaml 已入库，是单一事实源。`
- 第 280 行改为：`config/routes.yaml 已入库，CI 直接用它生成发布产物；routes.yaml.example 仅在该文件缺失时兜底（正常情况不触发）。`

- [ ] **Step 7: 全量受影响验证 + 提交**

Run: `pnpm typecheck && pnpm --filter @clash-route-kit/local-server exec vitest run tests/gitActions.test.ts && pnpm --filter @clash-route-kit/cli exec vitest run tests/configExamples.test.ts`
Expected: 全绿。

```bash
git add .gitignore config/routes.yaml config/routes.yaml.example packages/local-server/src/git/gitActions.ts packages/local-server/tests/gitActions.test.ts apps/cli/tests/configExamples.test.ts README.md
git commit -m "fix(publish): routes.yaml 入库并修复发布链"
```

注意：本提交把 1180 行真实配置入库，CI 产物内容随之从 example 切换为真实配置——这是修复目的，提交说明里注明。

### Task 2: 服务端 baseMtime 契约（commit 2 前半，随 Task 3 提交）

**Files:**
- Modify: `packages/local-server/src/config/configRepository.ts`（类型 + `saveAuthorProject`）
- Modify: `packages/local-server/src/http/apiHandler.ts`（PUT `/api/project/config` 段，约 119-160 行）
- Test: `packages/local-server/tests/configRepository.test.ts`、`packages/local-server/tests/apiHandler.test.ts`（扩展 + 修正既有用例）

**Interfaces:**
- Produces: `SaveAuthorProjectOptions.baseMtime: number`（必带）；结果联合新增 `SaveAuthorProjectConflict { ok: false; conflict: true; code: "config.conflict"; currentYaml: string; mtime: number }`。Task 3 的 `saveV2Project` 消费该 409 响应形状。
- Consumes: 既有 `statMtime` 注入点（GET 与 PUT 同口径）、`writeFileAtomic`。

- [ ] **Step 1: 写失败测试（configRepository.test.ts 追加）**

```ts
it("baseMtime 匹配时写入并返回新 mtime", async () => {
  let written = "";
  const result = await saveAuthorProject({
    ...baseOptions, yaml: validV2Yaml, baseMtime: 1000,
    statMtime: async () => 1000,
    writeText: async (_p, text) => { written = text; },
  });
  expect(result.ok).toBe(true);
  expect(written).toContain("schemaVersion: 2");
});

it("baseMtime 不匹配返回 conflict 且不落盘", async () => {
  const writeText = vi.fn(async () => {});
  const result = await saveAuthorProject({
    ...baseOptions, yaml: validV2Yaml, baseMtime: 999,
    statMtime: async () => 1000,
    readText: async () => "server current yaml",
    writeText,
  });
  expect(result).toMatchObject({ ok: false, conflict: true, code: "config.conflict", currentYaml: "server current yaml", mtime: 1000 });
  expect(writeText).not.toHaveBeenCalled();
});

it("文件不存在时 mtime 0 语义成立", async () => {
  const miss = await saveAuthorProject({ ...baseOptions, yaml: validV2Yaml, baseMtime: 5, statMtime: async () => 0, readText: async () => { throw new Error("ENOENT"); }, writeText: async () => {} });
  expect(miss).toMatchObject({ ok: false, conflict: true, currentYaml: "", mtime: 0 });
  const hit = await saveAuthorProject({ ...baseOptions, yaml: validV2Yaml, baseMtime: 0, statMtime: async () => 0, writeText: async () => {} });
  expect(hit.ok).toBe(true);
});
```

`validV2Yaml`：复用测试文件内既有的 v2 样例常量；若无，取真实 `config/routes.yaml` 截取的 `schemaVersion: 2` + 最小自派示例。

- [ ] **Step 2: 跑测试确认红**（`baseMtime` 字段不存在 → 类型错误/断言失败）

Run: `pnpm --filter @clash-route-kit/local-server exec vitest run tests/configRepository.test.ts`

- [ ] **Step 3: 实现**

`configRepository.ts`：
- `SaveAuthorProjectOptions` 加 `baseMtime: number` 与 `readText?: ReadText`。
- 新增 `SaveAuthorProjectConflict`（形状见 Interfaces），`SaveAuthorProjectResult` 三变体联合。
- `saveAuthorProject` 在 serialize 后、`writeText` 前比对：

```ts
const currentMtime = await statMtime(configPath);
if (currentMtime !== options.baseMtime) {
  const currentYaml = await readText(configPath).catch(() => "");
  return { ok: false, conflict: true, code: "config.conflict", currentYaml, mtime: currentMtime };
}
```

并在函数注释补一句已知限制：文件系统 mtime 粒度较粗（部分 FS 秒级），极短间隔连续外部写可能漏检，单用户本地工具可接受。
- `apiHandler.ts` PUT 段：payload 类型加 `baseMtime?: unknown`；`typeof payload.baseMtime !== "number"` → `writeJson(response, 400, { ok: false, output: "Missing baseMtime" })`；调用 `saveAuthorProject({ ...options, yaml: payload.yaml, baseMtime: payload.baseMtime })`；分发改为 `result.ok ? 200 : "conflict" in result ? 409 : 422`。

- [ ] **Step 4: 修正既有用例 + apiHandler 测试**

`configRepository.test.ts` 与 `apiHandler.test.ts` 中所有既有 `saveAuthorProject` / PUT `/api/project/config` 调用补 `baseMtime`（与各用例 `statMtime` stub 匹配的值），否则因 400/409 全红。
`apiHandler.test.ts` 追加两条：PUT 缺 `baseMtime` → 400 `Missing baseMtime`；`statMtime` stub 与 `baseMtime` 不符 → 409 且响应含 `currentYaml`、`mtime`、`code: "config.conflict"`。

- [ ] **Step 5: 跑绿（不提交）**

Run: `pnpm --filter @clash-route-kit/local-server exec vitest run && pnpm typecheck`
Expected: 绿。**此处不提交**：严格模式下服务端收紧而 web 未跟上，会让 main 在两提交之间处于"web 保存必 400"的破损态——服务端与本任务文件随 Task 3 同一提交（spec 提交切分 ②）。

### Task 3: web baseMtime 集成与冲突对话框（commit 2，与 Task 2 同提交）

**Files:**
- Modify: `apps/web/src/v2/v2Project.ts`（`ProjectDocument` + `saveV2Project`）
- Modify: `apps/web/src/projectController.ts`（控制器携带 `baseMtime`）
- Create: `apps/web/src/components/ConfigConflictDialog.tsx`
- Modify: `apps/web/src/App.tsx`（三个保存调用点 + 冲突状态 + 挂对话框）
- Test: `apps/web/tests/v2/v2Project.test.ts`、`apps/web/tests/v2/projectControllerV2.test.ts`、`apps/web/tests/components/configConflictDialog.test.tsx`（新建目录若无）

**Interfaces:**
- Consumes: Task 2 的 409 响应形状 `{ ok:false, code:"config.conflict", currentYaml, mtime }`。
- Produces:
  - `fetchProjectDocument(): Promise<ProjectDocument>`，`ProjectDocument { schemaVersion: 2; yaml: string; runtimeUrls: RuntimeUrls; mtime: number }`（`mtime` 缺失或非 number 视为无效响应抛错，与既有风格一致）。
  - `saveV2Project(yaml: string, baseMtime: number, fetcher?): Promise<SaveV2ProjectResult>`，结果联合新增 `{ ok: false; conflict: true; currentYaml: string; mtime: number }`。
  - `createV2ProjectController(yaml, runtimeUrls?, baseMtime?)` 状态新增 `baseMtime?: number`；`markV2ProjectSaved(state, yaml, mtime)` 同步更新。

- [ ] **Step 1: 写失败测试**

`v2Project.test.ts` 追加：
- GET 响应含 `mtime: 1710` → `fetchProjectDocument` 返回 `mtime: 1710`；缺 `mtime` → 抛 "Invalid local project response"。
- `saveV2Project("yaml", 1000, fetcher)` 请求体含 `"baseMtime":1000`。
- 409 响应 `{ ok:false, code:"config.conflict", currentYaml:"server", mtime: 2000 }` → 返回 `{ ok:false, conflict:true, currentYaml:"server", mtime:2000 }`；400/422 分支不受影响。

`projectControllerV2.test.ts` 追加：`createV2ProjectController(yaml, urls, 1234)` 状态 `baseMtime === 1234`；`markV2ProjectSaved(state, newYaml, 5678)` 后 `baseMtime === 5678`。

`configConflictDialog.test.tsx`（@testing-library/react，参照 `appShell.test.tsx` 模式）：渲染两个动作「覆盖 / 重载」，点击各触发一次对应回调。

- [ ] **Step 2: 跑红**

Run: `pnpm --filter @clash-route-kit/web exec vitest run tests/v2 tests/components`（类型/断言失败）

- [ ] **Step 3: 实现**

- `v2Project.ts`：按 Interfaces 改 `ProjectDocument` 校验、`saveV2Project` 签名与 409 分支（`response.status === 409` 且 payload 有 `currentYaml` → conflict 变体）。
- `projectController.ts`：状态加 `baseMtime?: number`，工厂第三参透传，`markV2ProjectSaved` 第三参更新。
- `ConfigConflictDialog.tsx`：antd `Modal`，props `{ open, serverMtime, onOverwrite, onReload, onCancel }`，文案「配置文件已被外部修改」+ 说明服务端 mtime 时间（`new Date(serverMtime)` 本地格式），两按钮 + 取消。
- `App.tsx`：
  - `const [conflict, setConflict] = useState<{ currentYaml: string; mtime: number } | null>(null);`
  - 自动保存（181 行）：`saveV2Project(serializeV2Project(project.v2.config), project.baseMtime ?? 0)`；`result.conflict` → `setProject(setProjectStatus(..., "error", "配置文件已被外部修改"))` + `setConflict({ currentYaml: result.currentYaml, mtime: result.mtime })`；成功分支 `markV2ProjectSaved(current, result.yaml, result.mtime)`。
  - 覆盖回调：`saveV2Project(serializeV2Project(project.v2.config), conflict.mtime)`，成功走 `markV2ProjectSaved`，再遇 conflict → 刷新 `setConflict`（以最新 mtime 重开，Review Focus #3）。
  - 重载回调：`fetchProjectDocument()` → `setProject(createV2ProjectController(document.yaml, document.runtimeUrls, document.mtime))` + 关闭对话框。
  - 导入路径（81 行）与空白项目（133 行）：传 `project.baseMtime ?? 0`；conflict → `notifyError("配置文件已被外部修改，请重载后重试")` + `refreshConfig()`，不弹对话框（这两个路径的草稿语义与自动保存不同，避免误覆盖导入内容）。
  - App.tsx **所有** `createV2ProjectController` 调用点补第三参（约 86 行用 `save.mtime`、108 行 refreshConfig 与 152-154 行初始装载用 `document.mtime`、140 行空白项目用保存结果的 `mtime`），否则控制器缺 baseMtime 会以 `?? 0` 兜底、文件已存在时首存必冲突。

- [ ] **Step 4: 跑绿 + 提交（含 Task 2 服务端文件，spec 提交 ②）**

Run: `pnpm --filter @clash-route-kit/web exec vitest run && pnpm --filter @clash-route-kit/local-server exec vitest run && pnpm typecheck`
Expected: 绿。

```bash
git add apps/web/src/v2/v2Project.ts apps/web/src/projectController.ts apps/web/src/components/ConfigConflictDialog.tsx apps/web/src/App.tsx apps/web/tests/v2/v2Project.test.ts apps/web/tests/v2/projectControllerV2.test.ts apps/web/tests/components/configConflictDialog.test.tsx packages/local-server/src/config/configRepository.ts packages/local-server/src/http/apiHandler.ts packages/local-server/tests/configRepository.test.ts packages/local-server/tests/apiHandler.test.ts
git commit -m "feat: 配置写入加 baseMtime 冲突检测"
```

### Task 4: `.list` 原子写（commit 3）

**Files:**
- Modify: `packages/local-server/src/rules/ruleFiles.ts:74`
- Test: `packages/local-server/tests/ruleFiles.test.ts`

**Interfaces:** Consumes `writeFileAtomic`（`../config/atomic.js`）。

- [ ] **Step 1: 写失败测试（ruleFiles.test.ts 追加）**

```ts
it("默认写入口走原子替换且不残留临时文件", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "rulefiles-atomic-"));
  const target = path.join(dir, "Demo_Domain.list");
  await writeFile(target, "old-content", "utf8");
  await saveProjectRuleFile({ root: dir, configFile: "config/routes.yaml", file: "Demo_Domain.list", text: "new-content" });
  expect(await readFile(target, "utf8")).toBe("new-content");
  const leftovers = (await readdir(dir)).filter((name) => name !== "Demo_Domain.list");
  expect(leftovers).toEqual([]);
});
```

函数名以 `ruleFiles.ts` 实际导出为准（读文件确认 `saveProjectRuleFile` 签名后照实写测试；仅默认路径——不注入 `writeText`）。

- [ ] **Step 2: 跑红** — `pnpm --filter @clash-route-kit/local-server exec vitest run tests/ruleFiles.test.ts`（现实现直接 writeFile，无临时文件清理语义，测试按实际缺口调整断言后仍须红）

- [ ] **Step 3: 实现** — `ruleFiles.ts` 默认 `writeText` 改 `writeFileAtomic`（import 自 `../config/atomic.js`）。

- [ ] **Step 4: 跑绿 + 提交** — `pnpm --filter @clash-route-kit/local-server exec vitest run` 绿；

```bash
git add packages/local-server/src/rules/ruleFiles.ts packages/local-server/tests/ruleFiles.test.ts
git commit -m "fix: .list 写入改原子替换"
```

### Task 5: 文档修正（commit 4）

**Files:**
- Modify: `AGENTS.md:20`、`README.md`（86 / 229 / 243 行）、`CLAUDE.md`（34 / 66 / 85 行附近）

**Interfaces:** 无代码接口；验收是 grep 零残留。

- [ ] **Step 1: 修改** — `pnpm serve:output` → `pnpm serve`（AGENTS.md 一处、README 三处，描述保留）；CLAUDE.md 第 34 行「三个包」→「四个包（core、local-server、apps/cli、apps/web）」；第 66 行托管层描述改为 `packages/local-server/src/http/`（hostingHandler/apiHandler）实际位置；第 85 行「三个上游仓库」→「四个上游仓库」。
- [ ] **Step 2: 验证** — `grep -rn "serve:output" AGENTS.md README.md CLAUDE.md` 零命中；`grep -n "三个包" CLAUDE.md` 零命中。
- [ ] **Step 3: 提交**

```bash
git add AGENTS.md README.md CLAUDE.md
git commit -m "docs: 修正 serve 脚本名与包数描述"
```

### Task 6: 全量验证与发布层核验

- [ ] **Step 1:** `pnpm test`（全量，715+ 测试不降）+ `pnpm typecheck` + `pnpm build` 全绿。
- [ ] **Step 2:** `git push origin main`。
- [ ] **Step 3:** `gh run watch`（或 `gh run list --workflow=publish.yml`）等 Actions 绿；`git fetch origin publish && git log origin/publish -1` 确认 publish 分支出现新提交、产物反映真实配置。
- [ ] **Step 4:** 更新 handoff 文件状态、按 AGENTS.md「验证与审查」核对实际 diff 与定级行，写批次记录（workspace、时段、执行方式）。
