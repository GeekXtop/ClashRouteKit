# Local Server 边界与本地运行设置实施计划（Phase C）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依据 `docs/superpowers/specs/2026-08-10-web-console-workflow-redesign-design.md` 第 5.3、8.2、13.C 节，把 `apps/cli/src/serveApi.ts`（1182 行）与 `serveHosting.ts` 的领域逻辑拆入新包 `packages/local-server`；CLI 退为参数解析与终端输出；新增 ignored 本地设置 `.clashroutekit/local.yaml`；配置与设置写入统一原子化。

**Architecture:** `packages/local-server` 依赖 Core，承担全部 Node IO：`src/config/`（配置仓库 + 本地设置 + 原子写）、`src/catalog/`（vendor catalog 与搜索）、`src/vendor/`（上游同步）、`src/git/`（状态/提交/推送/workflow 查询）、`src/http/`（API 与静态托管装配）。对外只经 `src/index.ts` 公开入口。`apps/web/vite.config.ts` 改用 `@clash-route-kit/local-server` 开发条件导出，不再相对导入 `apps/cli/src`。CLI 的 serve 类命令只组合 local-server 的 use case。

**Tech Stack:** pnpm 12 workspace、Node.js 22、TypeScript strict ESM/NodeNext、YAML、Vitest 5。

## Global Constraints

- `local-server` 只依赖 `@clash-route-kit/core` 与 `yaml`、`@types/node`；不得导入 React、Vite 或 `apps/*` 源码。
- Core 边界不变：仍不导入 `node:*` 与任何 IO。
- 本地设置优先级固定：CLI 显式参数 > 环境变量 > `.clashroutekit/local.yaml` > 默认值。
- 本地设置文件 ignored，不进入 Git；订阅 URL 与 Token 不允许写入该文件或项目配置。
- 配置与本地设置写入一律"临时文件 + rename"原子替换，失败不留半份文件。
- 迁移以"函数搬家 + 测试搬家"为主，不重写逻辑语义；`pnpm test` 前后用例数不下降（搬家不算删除）。
- 迁移期间保持现有 HTTP API 路径、方法与响应形状不变（Web 端零改动为目标）。
- 两个空格缩进、双引号、多行尾随逗号、显式 `.js` ESM 导入。
- 用户工作区 `.claude/settings.json` 不提交；`.agents/*` 文档更新由主 agent 收尾时处理。

---

## File Structure

### 包骨架与配置模块（Task 1）

- Create: `packages/local-server/package.json`（仿 core：`development` 条件导出 `./src/index.ts`，`import` → `./dist/index.js`；依赖 `@clash-route-kit/core` workspace:\*、yaml）。
- Create: `packages/local-server/tsconfig.json`、`src/index.ts`。
- Create: `packages/local-server/src/config/atomic.ts` — `writeFileAtomic(file, content)`（program.ts 内同名逻辑上移）。
- Create: `packages/local-server/src/config/configRepository.ts` — 从 serveApi 抽出配置读/写/序列化与保存门禁装配（保留函数行为，路径解析规则不变）。
- Create: `packages/local-server/src/config/localSettings.ts` — `LocalSettings`（serve.host/port/publicBaseUrl、subconverterUrl）、`loadLocalSettings(root, overrides?)`、优先级合并、Zod 不引入（手写读取器即可）。
- Create: `packages/local-server/tests/atomic.test.ts`、`configRepository.test.ts`、`localSettings.test.ts`。
- Modify: 根 `pnpm-workspace.yaml`（若按 glob 已含 packages/* 则无需改）、`.gitignore`（加 `.clashroutekit/`）。
- Modify: `apps/cli/package.json`（依赖 `@clash-route-kit/local-server: workspace:*`）。

### git / catalog / vendor 模块迁移（Task 2）

- Create: `packages/local-server/src/git/gitActions.ts` — 从 serveApi 抽出 git-status / git-commit / git-push / workflow 查询与 `runCommand`。
- Create: `packages/local-server/src/catalog/*`、`src/vendor/vendorSync.ts` — 从 serveApi 抽出 catalog 索引/搜索与 sync-vendor 用例。
- Create: `packages/local-server/tests/gitActions.test.ts`、`vendorSync.test.ts`（从 `apps/cli/tests/serveApi.test.ts` 拆出对应用例）。
- Modify: `apps/cli/src/serveApi.ts` — 删除已上移函数，改为从 local-server 导入。

### HTTP 装配与 CLI 薄化（Task 3）

- Create: `packages/local-server/src/http/apiHandler.ts` — `createRouteKitApiHandler`（路由装配，聚合 config/catalog/vendor/git use case）。
- Create: `packages/local-server/src/http/hostingHandler.ts` — `createHostingHandler`（静态托管 output/）。
- Create: `packages/local-server/src/http/localServer.ts` — 组合入口（如 `createLocalServerContext`）。
- Create: `packages/local-server/tests/apiHandler.test.ts`、`hostingHandler.test.ts`（从 serveApi/serveHosting 测试迁移并保持用例等价）。
- Modify: `apps/cli/src/serveApi.ts` — 缩减为薄 re-export 或删除（保留 `pnpm` 脚本兼容入口）。
- Modify: `apps/cli/src/index.ts` — serve 命令组装 local-server context。
- Modify: `apps/web/vite.config.ts` — 导入改为 `@clash-route-kit/local-server`（vite resolve.alias 指到 src/index.ts，同 core 模式）。
- Modify: `apps/web/tests/viteConfig.test.ts` — 若导入路径断言存在则同步。

### 本地设置接线（Task 4）

- Modify: `packages/local-server/src/http/hostingHandler.ts` — publicBase 来自本地设置解析结果（env/CLI 覆盖仍优先）。
- Modify: `apps/cli/src/index.ts` — serve/serve:output/subconvert-url 读本地设置默认值。
- Modify: `README.md` — `.clashroutekit/local.yaml` 示例与优先级说明。
- Create: `packages/local-server/tests/localSettingsPriority.test.ts` — CLI 参数 > 环境变量 > 文件 > 默认值。

## Tasks

1. [x] 包骨架 + 原子写 + configRepository + localSettings（含优先级与 ignored）+ 测试。
2. [x] git / catalog / vendor 模块与测试迁移。
3. [x] HTTP 装配迁移、serveApi 薄化、vite 改公开入口。
4. [x] 本地设置接线到 hosting/CLI + README + 全量门禁。

## Verification（整体验收）

- [x] `pnpm test` 全绿且用例总数 ≥ Phase B 收尾（404）。
- [x] `pnpm typecheck`、`pnpm build` 通过。
- [x] `pnpm check`、`pnpm generate`、`pnpm migrate` 冒烟通过。
- [x] `grep -r "apps/cli/src" apps/web/vite.config.ts` 无相对导入残留。
- [x] `git status` 干净（除 `.claude/settings.json` 与 ignored 文件）。
- [x] `pnpm dev` 启动后 Web 控制台可加载项目配置（浏览器或 HTTP 冒烟）。
