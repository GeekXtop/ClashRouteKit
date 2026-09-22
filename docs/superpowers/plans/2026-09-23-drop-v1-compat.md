# 移除 v1 兼容轨（v2-only 化）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 v1 磁盘格式兼容轨与迁移层，仓库只认 Schema v2；INI 导入直出 v2；修复三个 v2-only 坏点。

**Architecture:** v2 经 `toRouteKitConfig` 桥投影为渲染 DTO（`RouteKitProjectConfig`，保留）复用 renderIni/generate/UI；删除的是 v1 磁盘格式的解析、保存、校验、迁移、编辑会话与 INI 导入中间态。

**Tech Stack:** pnpm workspace、strict TypeScript（NodeNext、ESM、显式 `.js` 后缀）、Vitest。

**Spec:** `docs/superpowers/specs/2026-09-23-drop-v1-compat-design.md`（本计划从 spec 论证，执行者两份都读）

## Global Constraints

- 磁盘配置只认 `schemaVersion: 2`；无版本键报错且信息含"不支持 v1"。
- 渲染 DTO（`RouteKitProjectConfig` 等）**保留类型名与 `packages/core/src/types.ts` 位置**，仅改头注释收编（spec §2，不做机械重命名）。
- `.mrs` 关联键归一为同 stem `.yaml` + warning（commit 485d6ca 行为不回退）。
- 每任务红绿 TDD（删除类以 typecheck+测试绿验证）；显式路径 `git add`，禁 `git add -A`；每任务绿即提交。
- 工作区：主工作树（降级理由见 spec §10）；提交前复核 `git status --short`，`.claude/settings.json` 属他人改动不得带入。
- Windows / Git Bash 环境；vitest 运行从仓库根起。

---

### Task 1: hostingHandler 走 v2 桥（批次①a）

**Files:**
- Modify: `packages/local-server/src/http/hostingHandler.ts:4,37-48`
- Test: `packages/local-server/tests/hostingHandler.test.ts`

**Interfaces:**
- Consumes: `readConfig(options)`（configRepository，v2→桥→渲染 DTO）、`renderIni(config)`。
- Produces: `/templates/*.ini` 对 v2 配置返回 200 + 模板 INI（现状 500）。

- [ ] **Step 1: 写失败测试** — 在 `hostingHandler.test.ts` 增加：写入 v2 配置文本（`schemaVersion: 2` + 最小 routes/ruleProviders），`GET /templates/Custom_Clash.ini` 断言 200 且 body 含 `# PROXY` 或 ruleset 行（对齐现有 v1 用例的断言风格）；同用例断言 `publishBaseUrl` 以 options.publicBase 注入。

- [ ] **Step 2: 跑红** — `pnpm exec vitest run packages/local-server/tests/hostingHandler.test.ts`，期望新用例 FAIL（v2 文本被 v1 解析拒绝）。

- [ ] **Step 3: 实现** — `hostingHandler.ts`：删 `parseRouteKitConfig` import；`/templates/` 分支改 `const config = await readConfig(options); const ini = renderIni({ ...config, publishBaseUrl: options.publicBase });`（`readText` 读取逻辑保留，`readConfig` 内部自行读文件时则直接调用之——以 configRepository 实际签名为准，保持 readText 注入能力：若 readConfig 不接受 readText，则 readText 读出文本后改用 `parseAuthorProjectConfig` + `normalizeAuthorProjectConfig` + `toRouteKitConfig` 组装）。

- [ ] **Step 4: 跑绿 + 相邻** — 该文件测试全绿；`pnpm exec vitest run apps/cli/tests/serveHosting.test.ts` 全绿。

- [ ] **Step 5: 提交** — `fix: serve /templates/*.ini through the v2 config bridge`

### Task 2: createBlankProject 产 v2（批次①b）

**Files:**
- Modify: `apps/web/src/features/project/projectMeta.ts`、`apps/web/src/App.tsx:47-48,149-157`
- Test: `apps/web/tests/projectMeta.test.ts`

**Interfaces:**
- Produces: `createBlankProjectConfigV2(): AuthorProjectConfigV2`（schemaVersion:2 + project.template.output + routes:[final→DIRECT 占位形状：`{ id: "final", policy: { builtin: "DIRECT" }, source: { type: "final" } }`] + proxyGroups:[] + ruleProviders:[]）。
- 消费方：App.tsx 空项目初始化与 createBlankProject，保存改走 `saveV2Project(yaml)`（`YAML.stringify` 后传）。

- [ ] **Step 1: 写失败测试** — `projectMeta.test.ts` 新用例：`createBlankProjectConfigV2().schemaVersion === 2`；`routes` 恰一条 final→builtin DIRECT；`detectSchemaVersion(YAML.stringify(cfg)) === 2`。

- [ ] **Step 2: 跑红** — `pnpm exec vitest run apps/web/tests/projectMeta.test.ts`。

- [ ] **Step 3: 实现** — projectMeta.ts 增 v2 工厂；App.tsx 两处调用点改 v2（初始化：`createV2ProjectController(yaml, …)` 路径；createBlankProject：`saveV2Project(yaml)` 替换 `saveLocalProjectConfig`）。删除旧 `createBlankProjectConfig`（v1）。
- [ ] **Step 4: 跑绿** — projectMeta + projectPage + v2/webEditing 测试绿。
- [ ] **Step 5: 提交** — `fix: create blank projects in schema v2`

### Task 3: parseIniToConfig 直出 v2（批次②核心）

**Files:**
- Modify: `packages/core/src/import.ts`（重写）、`packages/core/src/types.ts`（`ImportedConfig` 改形状）
- Create: `packages/core/src/config/schemaV2/importConstruction.ts`（构造原语：`slugifyName`、`createGlobalIdAllocator`、`extractMemberSets`、`toTypedMembers`，自 migrate.ts 迁入）
- Test: `packages/core/tests/importIni.test.ts`（重写断言）

**Interfaces:**
- Produces: `interface ImportedConfig { proxyGroups: ProxyGroupV2[]; routes: RouteV2[]; memberSets: Record<string, MemberSet>; placeholderProviders: RuleProviderV2[]; warnings: string[] }`；`parseIniToConfig(ini: string): ImportedConfig`。
- 语义（对齐原 v1 中转行为）：custom_proxy_group 行 → ProxyGroupV2（显示名成员 slug→ID、`[]DIRECT/REJECT`→builtin、其余入 nodeFilters；url-test/fallback/load-balance 行尾健康检查三段解析不变）；ruleset 行 → RouteV2（policy 显示名→组 ID，GEOSITE/GEOIP/FINAL 直映射，`clash-*:`→占位 provider 引用）；重复成员组提取 memberSets（`set-N`，全局 ID 分配器跨 proxyGroups/memberSets/ruleProviders/routes 去重）；`.mrs` basename→同 stem `.yaml` + warning；占位 provider：`{ id: slug(file 去扩展名), name: file 去扩展名, output: file, behavior, enabled: false, sources: [] }`。

- [ ] **Step 1: 重写失败测试** — importIni.test.ts 断言 v2 形状：组 `{ id, name, type, members: [{ builtin: "DIRECT" }, { group: "<他组 id>" }], nodeFilters, url, interval }`；路由 `{ id, policy: { group | builtin }, source }`；占位 provider `enabled: false`；mrs 用例断言 `file` 无存、provider output 为 `X.yaml` 且 route 引用其 id、warning 含 `.mrs`。
- [ ] **Step 2: 跑红** — `pnpm exec vitest run packages/core/tests/importIni.test.ts`。
- [ ] **Step 3: 实现** — 按 Interfaces 重写 import.ts；migrate.ts 改为从 importConstruction.ts 导入原语（过渡期保持可编译，Task 6 删 migrate.ts）。
- [ ] **Step 4: 跑绿 + 相邻** — importIni 全绿；`schemaV2Normalize/Render`、`schemaV2Migrate`（过渡期仍存在）绿。
- [ ] **Step 5: 提交** — `feat: parse ini templates directly into schema v2 shapes`

### Task 4: importToV2 重写 + Web 接线（批次②web）

**Files:**
- Modify: `apps/web/src/features/project/importToV2.ts`、`apps/web/src/App.tsx`（handleImport）
- Test: `apps/web/tests/importToV2.test.ts`（重写）

**Interfaces:**
- Consumes: Task 3 `ImportedConfig`；base 改为 `AuthorProjectConfigV2`（`v2State.config`）。
- Produces: `importTemplateAsV2(iniText: string, base: AuthorProjectConfigV2): { ok: true; yaml: string; warningCount: number } | { ok: false; error: string }` 签名不变、base 类型变更。组装：`{ schemaVersion: 2, project: base.project, memberSets: imported.memberSets（与 base 的合并：导入覆盖同名）, proxyGroups/routes: imported.*, ruleProviders: [...base.ruleProviders（output 未被导入占位覆盖者）, ...imported.placeholderProviders], vendorRepos: base.vendorRepos }`；`YAML.stringify` + `lineWidth: 0`。错误路径保留（组装异常）。

- [ ] **Step 1: 重写失败测试** — v2 base（含 1 个既有 provider）+ 含既有 output 引用与新规则的 INI → 断言 yaml 解析回 v2：既有 provider 保留、占位 provider enabled:false、routes 正确引用组 ID/builtin/provider id、project/vendorRepos 透传。
- [ ] **Step 2: 跑红** — `pnpm exec vitest run apps/web/tests/importToV2.test.ts`。
- [ ] **Step 3: 实现** — 重写 importToV2.ts；App.tsx `handleImport` 调用改 `importTemplateAsV2(text, v2State.config)`；删 `pageConfig` 依赖与 `replaceImportedConfig` import。
- [ ] **Step 4: 跑绿** — importToV2 + webEditing 绿。
- [ ] **Step 5: 提交** — `feat: import ini templates straight to schema v2`

### Task 5: CLI import 输出 v2（批次②cli）

**Files:**
- Modify: `apps/cli/src/program.ts:93-113`（importIni）、`apps/cli/src/index.ts`
- Test: `apps/cli/tests/importIni.test.ts`

**Interfaces:**
- Produces: `importIni` 写 `output/imported-routes-v2.yaml`（v2 YAML，Task 3 产物组装最小 project：`{ schemaVersion: 2, project: { template: { output: "Custom_Clash.ini" } }, ...imported }`）；`ImportResult` 改 `{ warnings, outputPath, written: true }` 形状（去除 v1 scaffold 字段）。

- [ ] **Step 1: 重写失败测试** — 断言写盘文件首行 `schemaVersion: 2`、可被 `parseAuthorProjectConfig` 以 v2 解析。
- [ ] **Step 2: 跑红 → Step 3: 实现 → Step 4: 跑绿**（含 cli.test.ts import 相关用例同步改）。
- [ ] **Step 5: 提交** — `feat: cli import writes schema v2 draft`

### Task 6: 删迁移层（批次③）

**Files:**
- Delete: `packages/core/src/config/schemaV2/migrate.ts`、`packages/local-server/src/config/migration.ts`、`apps/web/src/features/project/MigrationWizard.tsx`、`apps/web/src/features/project/migrateApi.ts`（路径以 rg 为准）
- Modify: `packages/core/src/index.ts`（删 `planLegacyMigration`/`MigrationPlan` 等导出）、`packages/core/src/config/schemaV2/index.ts`（如有）、`packages/local-server/src/http/apiHandler.ts`（删 `/api/project/migrate[/apply]`，约 191-229）、`apps/cli/src/program.ts`（删 `migrateConfig` 与 `MIGRATE_OUTPUT_PATH`）、`apps/cli/src/index.ts`（删 migrate 子命令）、`apps/web/src/features/project/ProjectPage.tsx`（删向导挂载与 already-v2 空态）、`apps/web/src/App.tsx`（如有 import）
- Test: 删 `packages/core/tests/schemaV2Migrate.test.ts`、`packages/local-server/tests/migration.test.ts`、`apps/web/tests/migrationWizard.test.tsx`；cli.test.ts 删 migrate 用例（992-1043 附近）。

- [ ] **Step 1: 删文件与引用**（上述清单；`rg -n "planLegacyMigration|migrateConfig|MigrationWizard|migrateApi|/api/project/migrate" packages apps` 驱动收敛）。
- [ ] **Step 2: 验证** — `pnpm typecheck` 零残留引用；`pnpm exec vitest run packages/core packages/local-server apps/cli` 绿。
- [ ] **Step 3: 提交** — `feat: remove v1-to-v2 migration tooling`

### Task 7: 删 core v1 解析/校验/序列化（批次④a）

**Files:**
- Delete: `packages/core/src/config/legacyParser.ts`、`packages/core/src/config/validateLegacy.ts`（文件名以实际为准）
- Modify: `packages/core/src/configDocument.ts`（v2-only：`parseAuthorProjectConfig` 认 `schemaVersion: 2`，无键报 `{ code: "config.schema-version.missing", message: "不支持 v1 格式：缺少 schemaVersion: 2" }` 类诊断；删 `parseRouteKitConfig`/`serializeRouteKitConfig`）、`packages/core/src/types.ts` 头注释（渲染 DTO 收编声明）、`packages/core/src/index.ts`
- Test: 删 `configDocument.test.ts` v1 半边、`legacyValidation.test.ts`；`configDocument.test.ts` 保留/新增 v2-only 分发用例。

- [ ] **Step 1: 失败测试** — 无 schemaVersion 文本 → `parseAuthorProjectConfig` 抛 `ConfigDiagnosticError` 且 message 含 "不支持 v1"。
- [ ] **Step 2: 红 → Step 3: 实现 → Step 4: 绿**（typecheck 暴露下游引用，暂以最小改法保编译：local-server/cli/web 的 v1 引用留待 Task 8/9；若 typecheck 不允许中间态，则将 Task 7 与 8 合并执行——以实际依赖方向为准，允许合并提交但保持两段逻辑）。
- [ ] **Step 5: 提交** — `feat!: parse only schemaVersion 2 author configs`

### Task 8: 删 local-server 与 web 的 v1 轨（批次④b）

**Files:**
- local-server：`config/configRepository.ts`（readConfig 仅 v2 分支；删 `readProjectConfigFile`/`writeProjectConfigFile`）、`http/apiHandler.ts`（PUT v1 分支）、`check/checkConfig.ts`（`projectDiagnostics` 改 v2 校验：`validateAuthorProjectConfigV2(normalize(config))` 于 readConfig 后已在入口执行——此处改为对桥后 DTO 跑 `validateLegacyWorkspace` + provider/output 一致性检查，具体以 checkConfig 现有诊断为迁移目标，保证 `pnpm check` 对 v2 配置输出等价诊断）
- web：删 `configMutations.ts`、`useProjectDraftActions.ts`、`localProject.ts` v1 保存、`projectController.ts` v1 分支、`App.tsx` v1 分支（draftActions/project.draftConfig 消费点收敛为 v2-only）
- cli：`serveApi.ts` 兼容 re-export 清理
- Test: 改 `checkConfig` 相关用例为 v2 fixture；删 `apiHandler.test.ts`/`configRepository.test.ts` v1 用例、`apps/web/tests/configMutations.test.ts`、`localProject.test.ts`；`projectController.test.ts` 删 v1 半边。

- [ ] **Step 1: 逐文件删除/收敛**（`rg -n "writeProjectConfigFile|readProjectConfigFile|saveLocalProjectConfig|useProjectDraftActions|draftConfig" packages apps` 驱动）。
- [ ] **Step 2: 验证** — `pnpm typecheck`；`pnpm exec vitest run packages/local-server apps/web` 绿。
- [ ] **Step 3: 提交** — `feat!: drop v1 author-config read/write and edit sessions`

### Task 9: 导出面清理 + 文档 + 终验（批次⑤）

**Files:**
- Modify: `packages/core/src/index.ts`、`packages/local-server/src/index.ts`（删 v1 导出残留）、`AGENTS.md`（项目结构：routes.yaml 描述改"Schema v2"；命令段删 `migrate`/更新 `import`；无 v1 兼容表述）、`README.md`（如有 v1/迁移描述）
- Test: 全量。

- [ ] **Step 1: 导出面与文档清理**（`rg -n "parseRouteKitConfig|serializeRouteKitConfig|parseLegacyProjectConfig|legacyParser|ImportedConfig" packages apps --glob '!node_modules'` 收敛到 0 或仅渲染 DTO 注释）。
- [ ] **Step 2: 全量终验** — `pnpm test`（全绿，web 测试环境已修复）+ `pnpm typecheck` + `pnpm generate` + `pnpm check`（v2 配置可完整产出 output/）。
- [ ] **Step 3: 提交** — `docs: point guides at schema v2-only config`

## Self-Review

1. **Spec coverage**：§3 砍除清单→Task 3/6/7/8；§4 导入直出→Task 3/4/5；§5 坏点→Task 1/2 + Task 8（globalRemove 死分支随 generate 侧收敛，在 Task 8 checkConfig/generate 改造中确认删除）；§6 行为变化→Task 7 报错信息 + Task 5 CLI + Task 6 web；§7 测试→各任务 Test 行；§8 批次→Task 1-9 映射批次①②③④⑤；§2 DTO 收编→Task 7 types.ts 头注释。无缺口。
2. **Placeholder scan**：Task 1 Step 3 与 Task 7 Step 4 含"以实际签名为准"的条件分支——均为对现有代码事实的显式依赖声明并给出了两个确定分支，非 TBD。
3. **Type consistency**：`ImportedConfig` 新形状在 Task 3 定义、Task 4/5 消费一致；`importTemplateAsV2` 签名不变仅 base 类型变更，App.tsx 接线点唯一（handleImport）。
