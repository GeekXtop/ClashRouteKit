# 当前状态

## 当前任务

- 目标：重新梳理 Web 控制台的“项目 → 规则库 → 路由 → 输出”信息架构，消除策略组详情与编辑抽屉的重复信息，并让设备配置与 GitHub 发布符合本地优先的真实依赖。
- 状态：配置健康门禁阶段已在隔离分支完成并通过独立复审，尚未合并或 push；根工作区现有 `config/routes.yaml` 用户修改未被覆盖。
- 最后更新：2026-08-13

- 当前规格：`docs/superpowers/specs/2026-08-10-web-console-workflow-redesign-design.md`。
- 当前计划：`docs/superpowers/plans/2026-08-10-config-health-gates.md` 已完成；分支 `feat/workflow-redesign`，worktree `.worktrees/workflow-redesign`，HEAD `90bddc9`。
- 当前结论：一级导航为“项目 / 规则库 / 路由 / 输出”；输出页保留同页双标签“设备配置 / GitHub 发布”。配置层继续使用 YAML 和单一逻辑事实源，但升级为 schema v2，增加稳定 ID、memberSets、显式迁移、统一诊断和本地运行设置分层；工程层新增 `packages/local-server` 边界。
- 当前证据：策略组详情重复展示上游引用、下游成员与规则；导入入口固定在右上角；发布页本地按钮实际推送当前分支，而 `publish` 分支由 GitHub Actions 生成。

## 配置健康门禁阶段

- Core 已提供结构化 `Diagnostic`、严格 v1 parser、依赖环检测和统一 `validateLegacyProjectConfig`。
- Web 保存、CLI `check`/`generate`、服务端保存、独立 `git-commit`/`git-push` 均以 error 为阻断项，warning 保持可见但不阻断。
- 禁用 provider / RuleSet 可保留不完整草稿并以 warning 呈现；禁用项不参与生成和执行语义。
- feature 分支中的 `config/routes.yaml` 已修复 `google@cn` 与四个 classical provider source；根工作区的用户版配置需要后续冲突感知合并，不能整文件覆盖。
- 独立阶段复审与修复后 scoped re-review 均无 Critical/Important；仅保留低优先级事项：保存 API 的错误响应尚未携带结构化 `diagnostics` 字段。

- 规格：`docs/superpowers/specs/2026-08-07-explicit-drawer-save-design.md`（提交 `725bac4`）。
- 计划：`docs/superpowers/plans/2026-08-07-explicit-drawer-save.md`（提交 `8e7a528`）。

## 当前状态

- 三个 Drawer 均使用本地草稿；仅点击“保存”才原子写入完整策略组、RuleSet 或项目默认值，取消和右上关闭会丢弃草稿。
- `nodeFilters` 使用多行文本输入；timeout / tolerance 等 nullable 覆盖只保留“继承项目默认值 / 自定义”，自定义清空保存为 `null`。
- 项目 GEOIP `no-resolve` 只保留开启/关闭并默认明确写入 `true`；单条 GEOIP RuleSet 仍保留继承/开启/关闭。
- 普通规则启用开关等非 Drawer 操作继续自动保存；Vite watcher 仅忽略实际配置文件，配置写盘不再触发整页重载或跳回首页。
- 策略组仍按 `customProxyGroups` 原顺序展示，不引入 `role` / `categoryOverride`；统一项目默认值与 SubConverter timeout 支持保持有效。
- 阻塞：无。

## 验证

- `pnpm exec vitest run apps/web/tests/drawerDrafts.test.ts apps/web/tests/configMutations.test.ts apps/web/tests/inheritedSettingField.test.tsx apps/web/tests/groupDrawer.test.tsx apps/web/tests/ruleDrawer.test.tsx apps/web/tests/projectDefaultsDrawer.test.tsx apps/web/tests/routingPage.test.tsx apps/web/tests/libraryPage.test.tsx apps/web/tests/viteConfig.test.ts`：通过，9 个文件、67 个测试。
- `pnpm test`：通过，51 个测试文件、298 个测试。
- 本地合并验证：合并前和 `main` 合并后分别运行完整测试，均为 51 个文件、298 个测试通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过；保留 Vite 现有的大 chunk 非阻断提示。
- `pnpm check`：通过，输出 `[check] ok`。
- `pnpm generate`：通过。
- `git diff --check`：通过；只有 Git 的 LF→CRLF 提示，无空白错误。
- 浏览器：三个 Drawer 的保存、取消和右上关闭均符合事务语义；普通 RuleSet 开关继续即时保存；始终停留在路由页。临时服务、进程和配置副本均已清理。
- 既有非阻断提示：Ant Design `Input addonBefore` 弃用警告、Ant Design v5 与 React 19 兼容提示、Vite 大 chunk 提示。

## 关键文件

- `apps/web/src/drawerDrafts.ts`、`configMutations.ts`、`useProjectDraftActions.ts`：草稿规范化、完整实体替换与保存 action。
- `apps/web/src/components/GroupDrawer.tsx`、`RuleDrawer.tsx`、`ProjectDefaultsDrawer.tsx`、`InheritedSettingField.tsx`：事务式编辑与简化后的覆盖控件。
- `apps/web/src/components/RoutingPage.tsx`、`LibraryPage.tsx`：三个 Drawer 的保存 wiring 与非 Drawer 自动保存边界。
- `apps/web/vite.config.ts`、`apps/web/tests/viteConfig.test.ts`：实际配置文件 watcher ignore 与回归测试。
- `docs/superpowers/specs/2026-08-07-explicit-drawer-save-design.md`：设计规格，提交 `725bac4`。
- `docs/superpowers/plans/2026-08-07-explicit-drawer-save.md`：实施计划与收尾记录，提交 `8e7a528` 后含未提交闭环更新。

## 下一步

1. 由用户决定：将 `feat/workflow-redesign` 本地合并到 `main`、推送并建 PR，或保留 worktree 继续下一阶段。
2. 若合并到根工作区，先人工合并根目录现有 `config/routes.yaml` 修改，再在合并结果上重跑完整门禁。
3. 下一阶段可继续总路线图中的 Schema v2 / 信息架构实现；本阶段未引入 v2 字段。

## 当前 ADR

- `docs/adr/0001-use-yaml-for-route-config.md`：继续使用 YAML 作为中心路由声明格式。
- 本次“标准 INI 不承载 role、策略组按真实引用关系展示、统一默认值解析层”的长期边界尚未单独记录 ADR，建议需要时运行 `$obadr`。

## 已使用知识

- 无。

## 已提取知识

- 无新增公共知识；本次增量验证 `.agents/lessons.md` 中“执行计划收尾要处理正文 checklist”，并同步显式保存计划的全部 checkbox 与 Closure Notes。

## Obsidian

- 项目笔记：`Agent/Projects/ClashRouteKit.md`
