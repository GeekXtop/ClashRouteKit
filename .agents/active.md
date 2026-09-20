# 当前状态

> 本文件是派生视图：可从 `.agents/handoffs/`、`docs/adr/` 和 Obsidian 项目笔记重建，不保存孤本信息。

## 当前任务

- 目标：总路线图（Phase A–E）已全部完成并推送；仓库当前无进行中阶段。
- 状态：已闭环；全部工作在 `origin/main`，本地无未推送提交。
- 最后更新：2026-09-20

## 当前状态

- 路线图 Phase A（配置健康门禁）、B（Schema v2 与 Core）、C（local-server 边界与本地设置）、D（Web 四页与 v2 编辑）、E（输出与发布闭环）全部落地：`pnpm test` 86 文件 715 测试、typecheck、build、check、generate、migrate 全绿，CI 绿。逐条证据见 `.agents/progress.md` 2026-09-13 / 2026-09-18 条目。
- 最近一次收尾（2026-09-18，`791fc0e` + 响应式提交）：运行时 URL 透传（`publishBaseUrl` / `subconverterUrl`，env > 本地设置 > 默认值）、v1 保存失败与其它端点一致携带结构化 `diagnostics`、规格第 10 节 ≤640px 响应式与抽屉焦点走查。
- 控制台当前形态与配置边界以规格为准：`docs/superpowers/specs/2026-08-07-explicit-drawer-save-design.md`。阶段级细节（`Diagnostic` / 依赖环检测 / `validateLegacyProjectConfig`、Drawer 事务语义、`nodeFilters` / `no-resolve` 取值、用户配置分支修复）已归档到 `.agents/progress.md` 2026-09-20 补录条目。
- 已知偏离规格：规格 4.1 假设 `config/routes.yaml` 为可提交事实源，现改为本地文件——CI 缺失时从 example 生成发布产物，`apps/web` 构建经 `virtual:routes-config-yaml` 内联本地配置；四层模型本身不受影响。
- 阻塞：无。

## 验证

- 全量：`pnpm test` 86 文件 715 测试、`pnpm typecheck`、`pnpm build`、`pnpm check`、`pnpm generate`、`pnpm migrate` 全绿；CI 对 main 推送真实运行成功。命令与输出摘要见 `.agents/progress.md` 2026-09-18 条目。
- 测试并行度：默认并行度下 Vitest worker 曾因系统空闲内存不足 OOM，改 `--maxWorkers=2` 通过（与代码无关）。
- 既有非阻断提示：Ant Design `Input addonBefore` 弃用警告、AntD v5 与 React 19 兼容提示、Vite 大 chunk 提示。

## 关键文件

- `apps/web/src/drawerDrafts.ts` / `configMutations.ts` / `useProjectDraftActions.ts`：草稿规范化、完整实体替换与保存 action。
- `apps/web/src/components/{GroupDrawer,RuleDrawer,ProjectDefaultsDrawer,InheritedSettingField,RoutingPage,LibraryPage}.tsx`：事务式编辑与页面 wiring。
- `apps/web/vite.config.ts`：`virtual:routes-config-yaml` 内联与配置 watcher ignore。
- 规格 `docs/superpowers/specs/2026-08-07-explicit-drawer-save-design.md`（`725bac4`）；计划 `docs/superpowers/plans/2026-08-07-explicit-drawer-save.md`（`8e7a528`）。

## 下一步

1. 无进行中阶段。唯一待用户决策项：`config/routes.yaml.example` 是否裁剪为中性模板（当前为完整个人配置蓝本）。
2. 开新阶段时先立规格（`docs/superpowers/specs/`）再实施。

## 当前 ADR

- `docs/adr/0001-use-yaml-for-route-config.md`：继续使用 YAML 作为中心路由声明格式。
- 「标准 INI 不承载 role、策略组按真实引用关系展示、统一默认值解析层」的长期边界尚未单独记录 ADR，需要时运行 `$obadr`。

## 已使用知识

- 无。

## 已提取知识

- 无新增公共知识。

## Obsidian

- 项目笔记：`Agent/Projects/ClashRouteKit.md`
