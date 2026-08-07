# 当前状态

## 当前任务

- 目标：将策略组、RuleSet、项目默认值三个 Drawer 改为事务式显式保存，简化 nullable 覆盖与 GEOIP 默认值交互，并修复配置写盘触发 Vite 整页重载。
- 状态：已完成并整体提交到 `main`；`redesign/web-console` 已删除，工作树已清洁，尚未 push。
- 最后更新：2026-08-07

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

1. 如需同步远端，由用户决定何时 push `main`。
2. 本次只创建本地提交，未 push、未创建 PR。

## 当前 ADR

- `docs/adr/0001-use-yaml-for-route-config.md`：继续使用 YAML 作为中心路由声明格式。
- 本次“标准 INI 不承载 role、策略组按真实引用关系展示、统一默认值解析层”的长期边界尚未单独记录 ADR，建议需要时运行 `$obadr`。

## 已使用知识

- 无。

## 已提取知识

- 无新增公共知识；本次增量验证 `.agents/lessons.md` 中“执行计划收尾要处理正文 checklist”，并同步显式保存计划的全部 checkbox 与 Closure Notes。

## Obsidian

- 项目笔记：`Agent/Projects/ClashRouteKit.md`
