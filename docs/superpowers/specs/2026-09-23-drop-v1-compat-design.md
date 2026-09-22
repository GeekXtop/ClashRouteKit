# Spec：移除 v1 磁盘格式兼容轨，仓库全面 Schema v2 化

日期：2026-09-23
状态：已确认（用户 2026-09-23 会话拍板"迁移层全删、INI 导入直出 v2、直接干完"）
前置调研：本会话 Explore 报告（v1/v2 双轨现状、v1 代码面清单、三个 v2-only 坏点）

## 1. 背景与动机

仓库作者配置有两代 schema：

- **v1**：无 `schemaVersion` 键，顶层 `defaults` / `customProxyGroups` / `ruleSets` / `ruleProviders`，实体靠显示名与 output 文件名关联。
- **v2（目标）**：`schemaVersion: 2`，顶层 `project` / `memberSets` / `proxyGroups` / `routes` / `ruleProviders`，策略组用稳定 ID + 类型化成员。

`config/routes.yaml` 已是 v2。v2 运行时管线（解析/校验/保存/生成）完整，但实现方式是"v2 → 投影桥 `toRouteKitConfig` → 复用 v1 形状渲染管线"。代码里残留的 v1 **磁盘格式轨**（解析/保存/校验/迁移/INI 导入中间态/v1 编辑会话）与 v2 双轨并存，是维护负担，且已产生实际缺陷（见 §5 坏点）。

**用户决策**：不保留历史兼容。迁移工具全删；INI 导入重写为直出 v2。

## 2. 关键边界：删的是"v1 磁盘格式轨"，不是"v1 形状渲染 DTO"

代码里 "v1" 承担两个角色：

- **v1 磁盘格式轨（删）**：v1 严格解析器、v1 序列化/保存/校验、v1→v2 迁移器、v1 编辑会话与 mutation 层、以 v1 为中间态的 INI 导入链。
- **v1 形状渲染 DTO（留）**：`RouteKitProjectConfig` 等类型是 `renderIni`、generate、check、全部 UI 页面的函数签名；v2 经桥 `toRouteKitConfig` 投影为该形状复用渲染管线（33 个生产文件引用）。删它等于重写渲染管线 + 全部 UI（约百个测试），工程量放大一个数量级。

**收编方式**：类型保留现名与 `types.ts` 位置，文件头注释明确"渲染 DTO（v2 桥输出形状），非磁盘格式"。**不做机械重命名**——33 文件纯 churn、无行为收益（对已确认设计"改名/移位（如 RenderModel）"的收敛：名字本身不含 v1，重命名仅是风格 churn；此处按更小 diff 执行，特此记录）。

## 3. 砍除清单

### packages/core
- `config/legacyParser.ts`（`parseLegacyProjectConfig`）— 删。
- `config/schemaV2/migrate.ts` — 删；其中**非 v1 专属**的 v2 构造原语（`slugifyName`、`createGlobalIdAllocator`、`extractMemberSets`、typed member 识别）迁往新的 v2 导入构造模块（§4）。
- `configDocument.ts` — 收敛为 v2-only：`parseAuthorProjectConfig` 仅认 `schemaVersion: 2`，无版本键/其他值报结构化错误（信息明确"不支持 v1 格式"）；删 `parseRouteKitConfig` / `serializeRouteKitConfig` 的 v1 格式职责。
- `validateLegacy.ts` — 删（check 链改走 v2 校验）。
- `types.ts` 中 v1 磁盘格式专属类型（`ImportedConfig` 改形状随 §4；其余渲染 DTO 保留）。
- `index.ts` 导出面同步清理。

### packages/local-server
- `config/migration.ts`（analyze/apply）— 删。
- `http/apiHandler.ts`：`/api/project/migrate[/apply]` 路由、PUT `/api/project/config` 的 v1 分支 — 删。
- `config/configRepository.ts`：`readConfig` 的 v1 解析分支删（v2 分支保留并成为唯一路径）；`readProjectConfigFile` / `writeProjectConfigFile`（v1 读写+校验）— 删。
- `check/checkConfig.ts`：`validateLegacyProjectConfig` 调用改走 v2 校验链。
- `http/hostingHandler.ts`：v1-only 解析改走 readConfig 桥（§5-1）。

### apps/cli
- `migrate` 命令与 `migrateConfig` — 删。
- `import` 命令重写为 v2 输出（§4）。
- `serveApi.ts` 的 v1 兼容 re-export — 清理。

### apps/web
- `configMutations.ts`（v1 编辑 mutation 层，含 `replaceImportedConfig`）— 删（vendor 增删改等被 v2 复用的部分先确认归属：core 侧 `configMutations` 保留，web 侧纯 v1 的删）。
- `useProjectDraftActions.ts`、`localProject.ts` v1 保存路径、`App.tsx` v1 保存分支 — 删。
- `features/project/MigrationWizard.tsx` + `migrateApi.ts` — 删；`ProjectPage` 引用清理。
- `features/project/importToV2.ts` — 重写（§4）。

## 4. INI 导入直出 v2

- `parseIniToConfig`（core/import.ts）保持"INI 文本 → 结构化结果"职责，**产出改为 v2 形状**：proxyGroups（稳定 ID、类型化成员 `{group}`/`{builtin}`、nodeFilters、健康检查 url/interval/timeout/tolerance）、routes（policy 显示名 → 组 ID / builtin / provider 引用、section 保留）、占位 ruleProviders（v2 形状）、warnings。
- 从 migrate.ts 迁入构造原语：slug/全局 ID 分配/重复成员提取（memberSets）；**`.mrs` 关联键归一 + warning 逻辑随迁保留**（2026-09 提交 485d6ca 的行为不回退）。
- `apps/web/src/features/project/importToV2.ts`：删除 `replaceImportedConfig` + `planLegacyMigration` 中转，INI → v2 YAML 一步完成；工程字段（template/vendorRepos/defaults）沿用现状语义在 v2 上保留。
- CLI `import` 命令同链路，输出 v2 YAML。

## 5. 顺手修复的三个现存坏点（v2-only 的必要条件）

1. **hostingHandler `/templates/*.ini` 已 500**：只认 v1 解析（`parseRouteKitConfig`），当前 v2 仓库下 subconvert 模板托管断裂。改为 readConfig → 桥 → 渲染。
2. **`createBlankProject` 把配置降级写回 v1**：改产 v2 空白模板，保存走 `saveV2Project`。
3. **generate 死分支**：`globalRemove` 等 v1 独有输入的分支随轨删除（当前 v2 配置无此数据，无行为损失）。

## 6. 用户可见的行为变化

- 磁盘配置只认 `schemaVersion: 2`；无版本键的旧文件解析即报错，不再隐式兼容。
- CLI：`migrate` 移除；`import` 以 v2 语义回归。
- Web：迁移向导与迁移 API 移除；INI 模板导入语义不变（产出 v2）。
- v1 独有能力（`globalRemove`、`template.enableRuleGenerator/overwriteOriginalRules/clashRuleBase`、per-route `interval`、路由 `enabled`）随轨消亡——当前 v2 配置不含这些，无实际损失。

## 7. 测试策略

- **整删**（锁 v1 格式/迁移）：`configDocument.test.ts`、`legacyValidation.test.ts`、`schemaV2Migrate.test.ts`、`apps/cli` migrate 用例、`apps/web` 的 `configMutations.test.ts`、`localProject.test.ts`、`migrationWizard.test.tsx`、`local-server` `migration.test.ts` 及 v1 PUT/读写用例。
- **重写**：`importIni.test.ts`（断言 v2 形状 + mrs 归一保留）、`importToV2.test.ts`、`cli.test.ts` v1 fixture → v2 fixture、hosting/serve/vendorSync/catalog/projectMeta/projectController 中 v1 半边。
- **保留**：`renderIni.test.ts`、`defaults/ruleProvider/rules/dependencyGraph`、`schemaV2Parser/Normalize/Render`、`apps/web/tests/v2/`、UI 组件测试（props 是渲染 DTO，不变）。

## 8. 批次划分与验证门

范围动作：预估 ≥10 文件、跨 ≥3 顶层目录 → 每批先列改动文件清单、分批提交、分批验证；每批结束跑针对性测试 + `pnpm typecheck`，绿即提交（显式路径 `git add`）。

1. **批次①修坏点**：hostingHandler 走桥（先红：v2 配置喂 hosting 返回 500 → 绿：产出模板 INI）；createBlankProject v2 化（先红：空白项目落盘含 `schemaVersion: 2` → 绿）。
2. **批次②导入直出 v2**：v2 构造模块 + parseIniToConfig v2 产出（先红：断言 v2 形状）→ importToV2 重写 → CLI import 重写。
3. **批次③删迁移层**：migrate.ts / migration API / 向导 / CLI migrate；构造原语已于②迁出。
4. **批次④删 v1 解析/保存轨**：legacyParser / configDocument 收敛 / validateLegacy / configRepository / apiHandler v1 分支 / web v1 编辑会话 / DTO 头注释收编。
5. **批次⑤清理与文档**：core/local-server index 导出面、`AGENTS.md`（"v1 单一事实源"描述更正为 v2-only）、README 相关段落；全量 `pnpm test` + `pnpm typecheck` 终验。

## 9. 风险与对策

- **subconvert 闭环**：批次①先行修复 hostingHandler，避免批次④删除 v1 解析后彻底断链。
- **删除引发雪崩**：每批只删一批，typecheck 驱动收敛引用面；跨批引用（如 web configMutations 被 importToV2 依赖）在批次顺序上先解除依赖（②先于③④）。
- **web UI 大面积 props 类型**：渲染 DTO 保留原名原位，UI 组件不改签名，改动面收敛在数据层。
- **验证基准**：`schemaV2Render.test.ts` 锁定"v2 经桥渲染与手写等价"逐字节一致，是砍轨全程的等价性护栏。

## 10. 执行方式与工作区留痕

- 执行方式：inline（executing-plans）。理由：批次间高度耦合（共享类型/fixture，②③④互为依赖前置），subagent 隔离上下文反而增加传递成本与漂移风险。
- 工作区：主工作树（降级出口）。理由：建 worktree 需重装依赖 + `sync:vendor` 克隆上游 + 基线，成本明显高于隔离收益；当前唯一在途改动 `.claude/settings.json` 与本任务文件集不重叠。提交一律显式路径，提交前复核 `git status --short` 无越界。
