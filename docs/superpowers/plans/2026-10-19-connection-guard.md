# 连接校验中间件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给本地编辑服务加三层冗余连接防御：Host 白名单（全路径）、Origin/Sec-Fetch-Site（/api 写路径）、启动期 token（全部 /api），并补 /api/git 方法校验。

**Architecture:** 守卫作为 `createLocalServerContext` 新产物最先挂载（serve.ts 收编回 context 组装）；token 每次启动随机生成，经 hostingHandler HTML 改写与 vite `transformIndexHtml` 双路径注入 `<meta>`，前端 `authorizedFetch` 对 `/api/` 相对路径统一加头。

**Tech Stack:** node:http 中间件、`node:crypto`、Vite transformIndexHtml、Vitest。

**Spec:** `docs/superpowers/specs/2026-10-19-connection-guard-design.md`

## Global Constraints

- 三层冗余缺一不可；守卫、双宿主注入、前端加头**同一提交**（端到端自洽，防「守卫上线、前端无头」破损态）。
- `/templates`、`/rules` 仅受 Host 检查；`subscriptions.ts` 外部探活不加头。
- strict TS、`.js` 后缀、两空格、双引号；注释简体中文只写代码讲不出的约束。
- 每提交前受影响测试 + `pnpm typecheck`；推送前全量。

## Review Focus

1. **IPv6/端口形态**：`Host: [::1]:8787`、裸 `[::1]`、大写、带端口 v4——归一化必须全覆盖（Task 1 测试 pin）。
2. **`Origin: null` 字符串**：部分浏览器跨源无凭据请求发字符串 `null`——必须拒绝进 token 关（Task 1 pin）。
3. **`/api/` 前缀边界**：`/apifoo` 不得误判为 api 路径；`/api`（无尾斜杠）同样非 api 段（Task 1 pin）。
4. **绝对 URL fetch**：前端探活 subconverter 的绝对 URL 不得加头（Task 1 apiClient 测试 pin）。
5. **wildcard 不可入白名单**：`serve.host=0.0.0.0` 时守卫静默忽略该条目且启动被拒（Task 1 双 pin）。

---

### Task 1: connectionGuard + 双宿主注入 + apiClient（commit 1）

**Files:**
- Create: `packages/local-server/src/http/connectionGuard.ts`（守卫 + `normalizeHostHeader` + `isWildcardHost` + `assertBindableHost`）
- Create: `packages/local-server/tests/connectionGuard.test.ts`
- Modify: `packages/local-server/src/http/localServer.ts`（context 返回 `connectionGuard` + `token`；`LocalServerContextOptions.serveHost?`；token 传 hosting）
- Modify: `packages/local-server/src/http/hostingHandler.ts`（`htmlToken?`；html 静态与 fallback 注入 meta；utf8 读取路径）
- Modify: `packages/local-server/src/index.ts`（导出新符号）
- Modify: `apps/cli/src/serve.ts`（改用 `createLocalServerContext`；`startServe` 前置 `assertBindableHost(options.host)`；挂载 guard）
- Modify: `apps/web/vite.config.ts`（plugin 增加 `transformIndexHtml` 注入 tags）
- Create: `apps/web/src/apiClient.ts`（`authorizedFetch`）
- Modify: 前端默认 fetcher 替换（`v2Project.ts`×2、`actions.ts`、`ruleFiles.ts`×4、`catalog.ts`、`publishWorkflow.ts`×2、`SourcePickerModal.tsx`、`LibraryPage.tsx`、`ConfigYamlSection.tsx`、`GithubPublishPanel.tsx`、`ListFileEditor.tsx`）
- Test: `apps/web/tests/apiClient.test.ts`（jsdom）；`packages/local-server/tests/localServer.test.ts` 增集成用例；既有受影响测试修正

**Interfaces:**
- Produces: `createConnectionGuard({token, serveHost?, publicBaseUrl?})`、`createLocalServerContext()` 多返回 `connectionGuard`/`token`、`assertBindableHost(host): void`（wildcard 抛错）、`HostingOptions.htmlToken?`、web `authorizedFetch`。
- Consumes: 既有 `ResolvedLocalSettings.serve.host`（serve.ts 的 `options.host` 即绑定地址）。

- [ ] **Step 1: 写失败测试（connectionGuard 矩阵 + apiClient + 注入 + 集成）**——用例清单按 spec §4.1-4.5 与 Review Focus 五条逐条落。
- [ ] **Step 2: 跑红**。
- [ ] **Step 3: 实现**（守卫 → context/serve 接线 → 注入 → apiClient → 默认 fetcher 替换）。
- [ ] **Step 4: 跑绿 + 全量 + 提交**：`git add` 显式路径；`fix: 本地服务加连接校验（Host/Origin/token）`。

### Task 2: /api/git 方法校验（commit 2）

**Files:** `packages/local-server/src/http/apiHandler.ts`（两个 git 端点 GET-only 405）；`packages/local-server/tests/apiHandler.test.ts` 追加用例。

- [ ] Step 1: 失败测试（POST → 405）；Step 2: 红；Step 3: 实现；Step 4: 绿 + 提交 `fix: /api/git 端点补方法校验`。

### Task 3: 全量验证与发布层核验

- `pnpm test`（全量）+ `pnpm typecheck` + `pnpm build`；推送；CI 绿；手工冒烟项（dev/serve 双路径、curl 403/200、SubConverter 拉 /templates）记入台账。

## Rulings

- 计划中 localServer.test.ts 既有集成用例若因守卫新增而 403，属预期破坏——修用例（带 token 或直调 apiHandler），不放宽守卫。
