# Schema v2 与 Core 实施计划（Phase B）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依据 `docs/superpowers/specs/2026-08-10-web-console-workflow-redesign-design.md` 第 5 节，在 Core 实现 Schema v2 的 parser、规范化、稳定 ID、memberSets、显式 v1→v2 迁移与统一诊断；保持 v1 只读兼容，不迁移用户的 `config/routes.yaml`（仍为 v1）。

**Architecture:** Core 新增 `config/schemaV2/`（类型 + 严格 parser + 规范化 + 校验 + 迁移分析），全部为纯函数、无 Node IO；渲染侧通过"NormalizedProject → 现有 RouteKitConfig"桥接复用既有 INI/provider 生成器，渲染器不感知 v2。`parseAuthorProjectConfig` 按 `schemaVersion` 分发：缺省走现有严格 v1 parser，`2` 走 v2 parser，其余值报 error。迁移是"只读分析 → 调用方确认 → 原子写入"三段，Core 只提供分析结果与序列化，不做 IO。

**Tech Stack:** pnpm 12 workspace、Node.js 22、TypeScript strict ESM/NodeNext、YAML、Vitest 5。

## Global Constraints

- Core 不得导入 `node:*`、React、Vite、HTTP 或 Git。
- 统一诊断结构沿用 `{ code, severity, path?, message, related? }`（`config/diagnostics.ts`）。
- v1 现有行为零回归：`parseRouteKitConfig`、`validateLegacyProjectConfig`、`renderIni`、provider 生成语义不变。
- 稳定 ID 规则：非空、匹配 `/^[a-z0-9][a-z0-9_-]*$/i`、在同一实体集合内唯一；ID 创建后不随 `name` 变化。
- `memberSets[].members` 为判别联合 `{ group: id } | { builtin: "DIRECT" | "REJECT" } | { preset: setId }`；展开时递归并检测 preset 环。
- `routes[].policy` 为 `{ group: id } | { builtin: "DIRECT" | "REJECT" }`；rule-provider 路由 source 用 `{ type: "rule-provider", provider: id }`。
- `nodeFilters` 为 `{ match: string }[]`，禁止 HTTP/HTTPS URL（error）。
- `enabled: true` 的 provider 至少一个有效数据源；输出只允许 `.yaml`；`.mrs` 为 error。
- 迁移不自动写盘：Core 产出来 `MigrationPlan`（v2 YAML 文本 + 问题清单 + 摘要），写盘由 CLI/Web 调用方在用户确认后执行。
- 本地运行设置（`.clashroutekit/local.yaml`）属于 Phase C，不在本计划实现。
- 所有源文件使用两个空格、双引号、多行尾随逗号、显式 `.js` ESM 导入；测试放 `packages/core/tests/`。
- 用户工作区的 `config/routes.yaml` 保持 v1 不动；`.claude/settings.json` 的本地改动不属于任务范围，不提交。

---

## File Structure

### v2 类型与 parser

- Create: `packages/core/src/config/schemaV2/types.ts` — `AuthorProjectConfigV2`、`ProxyGroupV2`、`RouteV2`、`MemberSet`、`PolicyTarget`、`TypedMember`、`RuleProviderV2` 等。
- Create: `packages/core/src/config/schemaV2/parser.ts` — 严格解析：顶层 known keys、`schemaVersion === 2`、project.template/defaults、memberSets、proxyGroups（id/name/type/members/nodeFilters/健康检查覆盖）、routes（policy 判别联合 + source 判别联合）、ruleProviders、vendorRepos。
- Create: `packages/core/tests/schemaV2Parser.test.ts` — 合法/非法夹具：未知顶层键、数字类型策略组、缺 id、坏 ID 格式、policy 混用字符串、URL nodeFilter、`.mrs` 输出、启用空 provider（parser 层只管结构与枚举，语义校验在 validate）。

### 规范化与校验

- Create: `packages/core/src/config/schemaV2/normalize.ts` — 展开 memberSets（递归 + preset 环检测）、解析 typed members、构建 id→实体映射、产出 `NormalizedProject`（组顺序、成员展开结果、路由引用解析）。
- Create: `packages/core/src/config/schemaV2/validate.ts` — `validateAuthorProjectConfigV2`（引用完整性、重复 ID、provider 数据源、behavior 一致性）与 `validateNormalizedProject`（组循环、preset 循环、空成员组、FINAL 数量）；复用 `routing/dependencyGraph.ts`。
- Create: `packages/core/tests/schemaV2Normalize.test.ts` — memberSets 展开、嵌套 preset、preset 循环、重命名 name 不影响引用。
- Create: `packages/core/tests/schemaV2Validate.test.ts` — 缺失引用、循环、空成员组、启用空 provider、FINAL 多条。

### 迁移

- Create: `packages/core/src/config/schemaV2/migrate.ts` — `planLegacyMigration(config: RouteKitProjectConfig): MigrationPlan`；确定性 slug 生成（name 去 emoji/空白 → kebab，冲突追加 `-2` 序号）、重复成员列表提取为 memberSets、`ruleSets.policy` 名称引用转 ID、provider 文件引用转 ID、无效项生成 `MigrationIssue[]`（沿用 Diagnostic 结构，`code` 以 `migrate.` 前缀）。
- Create: `packages/core/tests/schemaV2Migrate.test.ts` — 当前 `config/routes.yaml.example` 的 v1 快照迁移（重复成员列表提取数量断言）、google@cn 等 geosite 原样保留、`.mrs` 引用生成 issue、INI 语义等价（迁移前后 renderIni 输出一致）。

### 渲染桥与公共入口

- Create: `packages/core/src/config/schemaV2/toRouteKitConfig.ts` — `NormalizedProject` → `RouteKitConfig`（现有渲染 DTO）。
- Create: `packages/core/tests/schemaV2Render.test.ts` — v1 配置与迁移后 v2 在 `renderIni` 与 provider 生成上的等价测试；URL nodeFilter 回归夹具。
- Modify: `packages/core/src/configDocument.ts` — 新增 `parseAuthorProjectConfig(text): { schemaVersion: 1 | 2; v1?: RouteKitProjectConfig; v2?: AuthorProjectConfigV2 }` 分发入口；现有 `parseRouteKitConfig` 保持不变。
- Modify: `packages/core/src/index.ts` — 导出 v2 公共 API（types、parse、normalize、validate、planLegacyMigration、toRouteKitConfig）。

### CLI 最小接线

- Modify: `apps/cli/src/program.ts` — 新增 `migrate` 命令：默认只读打印迁移摘要与 issue；`--write` 时备份原文件并原子写入（临时文件 + rename），失败保留原文件。
- Modify: `apps/cli/tests/cli.test.ts` — migrate 只读与 `--write` 行为测试。

## Tasks

1. [ ] v2 类型 + 严格 parser + parser 测试（含上述非法夹具回归）。
2. [ ] normalize + memberSets 展开 + preset 环检测 + 测试。
3. [ ] validate 两层校验 + 测试。
4. [ ] migrate 分析（slug、memberSets 提取、issue）+ INI 等价测试。
5. [ ] toRouteKitConfig 渲染桥 + 等价/回归测试。
6. [ ] `parseAuthorProjectConfig` 分发入口与 index 导出。
7. [ ] CLI `migrate` 命令与测试；README 补充 v2 说明。

每个任务完成后运行 `pnpm --filter @clash-route-kit/core test` 与 `pnpm --filter @clash-route-kit/core typecheck`；任务 6、7 后追加 `pnpm test`、`pnpm typecheck`、`pnpm check`、`pnpm build`。

## Verification（整体验收）

- [x] `pnpm test` 全绿（≥55 文件）。
- [x] `pnpm typecheck`、`pnpm build` 通过。
- [x] `pnpm check` 对当前 v1 `config/routes.yaml` 行为不变（gfw warning 保持非阻断）。
- [x] `pnpm exec --filter @clash-route-kit/cli start migrate`（只读）对当前配置产出合法 `MigrationPlan` 且不写盘。
- [x] v1 与迁移 v2 的 `renderIni` 输出逐字一致（等价测试覆盖）。
