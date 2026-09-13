# Web 工作流重构实施计划（Phase D）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依据 `docs/superpowers/specs/2026-08-10-web-console-workflow-redesign-design.md` 第 6、7、8.3、10、11.3、13.D 节，落地"项目 / 规则库 / 路由 / 输出"四页信息架构，接入 v1→v2 迁移复核、稳定 ID mutation、memberSet 编辑与统一诊断展示；v1 项目保持可编辑直至显式迁移。

**Architecture:** `App` 只负责启动、一级导航与跨页项目快照；新目录 `apps/web/src/features/{project,library,routing,output}/` 各自拥有页面、组件与测试（旧 `components/` 的页面级组件迁入对应 feature，共享组件留 `components/shared/` 或原位复用）。配置状态承载 v1|v2 联合：`projectState.ts` 以 `parseAuthorProjectConfig` 分发；v1 项目走既有 mutation 路径不变，v2 项目走新的稳定 ID mutation（`packages/core` 已导出 schemaV2 API）。迁移复核经 local-server 新端点完成"分析→复核→原子写入"。

**Tech Stack:** React 19、Vite 8、Vitest 5、Testing Library、Ant Design v5（沿用现有组件库与 AntD 弃用警告基线）。

## Global Constraints

- 现有 v1 编辑行为零回归：三个抽屉显式保存、普通 RuleSet 开关自动保存、路由页不跳转等既有测试全绿。
- UI 显示显示名，mutation 与内部状态用稳定 ID（v2 路径）；v1 路径维持名称引用。
- 迁移不在后台自动改写：复核向导必须展示 summary、issues（error/warning/info 分级）、INI 语义对比，用户确认后原子写入并备份原文件；失败不产生部分写入。
- 订阅 URL/Token 不写入项目文件、本地设置或持久存储（沿用现状）。
- 路由页与输出页不常驻完整 INI；仅保留显式"查看生成结果"次级入口。
- 空来源 provider 保存为 disabled 草稿；`.mrs` 显示为导入问题。
- 状态不只靠颜色：文字 + 图标 + 诊断 path。
- 键盘焦点在打开抽屉/切换标签/定位错误后移动到对应标题或错误项。
- 每任务完成跑 `pnpm exec vitest run apps/web/tests` 与 `pnpm typecheck`；收尾跑全量门禁。
- 测试总数不得低于上一任务基线。

---

## Tasks

### Task 1：四页导航 + 项目页 + 输出页骨架

- `App.tsx`/`AppShell.tsx`：一级导航固定"项目 / 规则库 / 路由 / 输出"；全局顶栏导入按钮移除（导入归项目页）。
- 新建 `features/project/ProjectPage.tsx`：空项目态（主动作"导入现有模板"复用 ImportModal 逻辑、次动作"创建空白项目"）；已有项目态（项目名、Schema 版本、最近校验结果、四个任务域状态摘要、"继续编辑"回最近访问域、"重新导入"次级动作、发现 v1 展示迁移说明与复核入口占位）。
- `PublishPage` 改造为 `features/output/OutputPage.tsx`：同页双标签"设备配置（默认）/ GitHub 发布（标记可选）"；现有发布能力迁入 GitHub 发布标签，现有设备配置下载/二维码能力迁入设备配置标签；顶部共享显示当前 Schema 与校验状态、本地实时模板 URL 状态。
- 测试：导航四页切换、项目页空/有态渲染、输出页双标签默认设备配置。

### Task 2：路由页重构（去重复）

- 删除路由页策略组只读预览（GroupContextPanel）与常驻 INI 预览（PreviewDock 在路由页的挂载）；策略组以紧凑列表/选择器存在，点击直接开抽屉。
- 新增次级入口"查看生成结果"（抽屉或模态展示 INI，按需加载）。
- 策略组条目显示"被 N 条路由使用"计数 + "在路由列表中筛选"动作；不再复制命中规则清单。
- 校验诊断：行内就近显示 + 页顶汇总条（调 `/api/actions/check` 或复用本地校验结果）；错误可点击定位。
- 测试更新：GroupContextPanel/PreviewDock 相关用例替换为新交互断言。

### Task 3：规则库页增强

- 页顶新增"待补全来源 / 失效来源 / 阻断生成"汇总卡与直接处理入口。
- 空来源 provider 保存时强制 `enabled: false`（草稿可留）；`.mrs` 条目显示为导入问题而非可生成 provider。
- RepoModal（上游仓库设置）收进"仓库设置"次级入口，不与规则浏览并列主区域。
- 测试：汇总卡渲染、强制禁用保存、仓库设置入口。

### Task 4：v2 通路——迁移复核 + 稳定 ID mutation

- local-server：`POST /api/project/migrate`（只读返回 MigrationPlan 摘要）与 `POST /api/project/migrate/apply`（复核确认后：备份原配置 → 原子写入 v2 YAML；失败保留原文件）；configRepository 读侧经 `parseAuthorProjectConfig` 分发 v1/v2。
- Web：`projectState` 支持 v1|v2 联合快照；项目页迁移复核向导（来源分析 → issues 复核 → INI 语义对比 → 确认应用）。
- v2 编辑路径：`features/`共享的 v2 mutation（组/路由/provider 增删改、启用开关）基于稳定 ID；策略组抽屉支持 memberSet 选择/编辑（memberSets 一处声明、组内引用）；RuleSet 抽屉 policy 改为组 ID 选择。
- v1 项目继续走既有编辑路径；两路径并存直至迁移。
- 测试：迁移向导流程（mock API）、v2 mutation 单测、memberSet 编辑、v1 回归全绿。

### Task 5：响应式 / 可访问性 / 收尾

- 桌面 1200px 与移动 360px 走查四页：抽屉近全屏、路由行与订阅行纵向排列、无横向滚动主操作、无重复主滚动区、无固定栏遮挡。
- 键盘焦点管理：开抽屉、切标签、错误定位后焦点移动。
- 浏览器验收：v1 项目导入→迁移→补规则→本地生成设备配置（不配 GitHub）。
- 全量门禁 + 文档（README 截图占位/说明）+ `.agents` 记录。

## Verification（整体验收）

- [x] `pnpm test` 全绿（≥ Phase C 收尾 504）。
- [x] `pnpm typecheck`、`pnpm build`、`pnpm check`、`pnpm generate` 通过。
- [x] `pnpm dev` 四页走查：导入在项目页、路由页无重复预览、输出页默认设备配置标签。
- [x] v1→v2 迁移复核全流程（含失败不写入）与 v1 编辑回归测试通过。
- [x] `git status` 干净（除 `.claude/settings.json` 与 ignored）。
