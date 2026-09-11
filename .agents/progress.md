# 进展记录

本文件只记录阶段性进展摘要，不记录聊天流水。

## 2026-06-22 - 项目初始化

- 已完成：初始化 agent memory 结构和中立项目规则。
- 已修复：将旧版 `obinit` 生成的英文 `.agents`/docs README 改为简体中文；恢复被短指针覆盖的 `AGENTS.md` 与 `CLAUDE.md`。
- 已验证：读取相关文档确认入口文件保留原有指南，`.agents` 和 docs README 使用中文。
- 下一步：后续任务按阶段更新 `.agents/active.md`，有明确里程碑时追加本文件。

## 2026-06-22 - 成熟项目索引化

- 已完成：将 `.agents/instructions.md` 从厚摘要改为索引型规则文件。
- 已变更：保留 `AGENTS.md` / `CLAUDE.md` 作为长指南事实源，`.agents/instructions.md` 只记录 memory 协议、Obsidian 路径和写入边界。
- 已验证：扫描旧英文模板短语和长摘要标题，确认不再重复生成旧版英文结构。
- 下一步：后续 `$obinit` 重复运行只补缺失文件和链接，不覆盖已有入口文件。

## 2026-06-22 - Obsidian 项目笔记同步

- 已完成：按 `obinit` 0.1.8 重跑检查后，将 `Agent/Projects/ClashRouteKit.md` 更新为中文索引型项目笔记。
- 已变更：移除旧笔记中英文说明、命令清单和“入口文件是短重定向”的过期表述。
- 已验证：`obsidian read path="Agent/Projects/ClashRouteKit.md"` 读回成功；旧过期短语搜索无命中。
- 下一步：后续项目状态变化时，同步更新 `.agents/active.md`；只有跨会话关键状态才写回 Obsidian 项目笔记。

## 2026-06-23 - 6-19 Web 控制台计划审计

- 已完成：为 6-19 五份计划补充状态总览，标明已落地功能、设计调整和未追溯历史步骤。
- 已变更：明确顶栏“导出”按钮不是待办，导出能力由发布页 `config.yaml` 下载/二维码承担。
- 已新增：`docs/superpowers/plans/2026-06-23-web-console-followups.md`，集中追踪导入双模式、来源选择器增强、规则行内操作、发布页 git 状态/diff。
- 已验证：本次审计前已通过 `pnpm typecheck`、`pnpm test`、`pnpm check`、`pnpm --filter @clash-route-kit/core build`。
- 下一步：按 follow-up 计划执行四个任务，并补跑对应测试。

## 2026-06-23 - 两个 6-23 计划 Inline Execution

- 已完成：执行 `2026-06-23-web-console-followups.md` 四个任务：导入合并/替换、来源选择器跨仓库搜索与 GEOIP、路由行内策略/删除、发布页 Git 状态刷新。
- 已完成：执行 `2026-06-23-import-template-placeholder-rule-source.md` 五个任务：core/CLI provider behavior 泛化、导入模板补空 rule-provider 占位、校验 errors/warnings 分级、warning-only 保存放行、规则库「待补全」标签。
- 已验证：目标回归、`pnpm --filter @clash-route-kit/core build`、`pnpm typecheck`、`pnpm test`、`pnpm check` 均通过。
- 备注：`pnpm test` 仍输出既有 AntD `Input addonBefore` deprecated warning；本次未处理该非阻断警告。

## 2026-06-23 - Web 控制台反馈修正

- 已修正：路由规则行不再允许选择归属策略组；策略组修改入口保留在规则抽屉；行内删除入口后续已移除。
- 已修正：来源选择器移除无效的「全部 / GEOSITE / GEOIP / 规则源」分类和内置 GEOIP；添加规则预览区、INI 预览区均增加滚动。
- 已修正：发布页不再展示全仓 Git 状态，改为展示当前模板 INI 相对原始配置的变更预览。
- 已修正：导入 parser 的 section 注释只作用于紧随其后的规则；清理当前 `config/routes.yaml` 中已污染的 Emby/测速/社交 section。
- 已补齐：`GoogleCN_Domain.yaml`、`GameDownload_Domain.yaml`、`ProxyGFWlist_Domain.yaml` provider 来源；路由页对引用空 sources 的 provider 显示「规则源待补全」。
- 已标记：两个 6-23 plan 顶部已补 `Execution Status`，其中 Web plan 按反馈后的修订行为记录，不再声称实现旧的错误交互。
- 已验证：目标回归 10 个文件 20 个测试通过；`pnpm --filter @clash-route-kit/core build`、`pnpm typecheck`、`pnpm test`（45 文件 232 测试）、`pnpm check`、`pnpm generate` 均通过。

## 2026-06-23 - Web 控制台二次反馈修正

- 已修正：路由行的归属策略组保持只读，并恢复为历史 AntD Tag 样式；规则抽屉里的归属策略组保留可编辑 Select。
- 已修正：路由行内删除入口已移除；删除仍保留在规则抽屉确认动作中。
- 已修正：点击策略组筛选后仍显示分节标题。
- 已修正：添加规则来源预览和 INI 预览在原布局内铺满并滚动。
- 已修正：发布页 INI 变更预览改为完整 INI diff，上下文行保留，新增行使用 `+`，删除行使用 `-`，并显示增删数量。
- 已验证：目标回归 6 个文件 12 个测试通过；`pnpm typecheck` 通过。浏览器插件连接因当前 `node_repl` sandbox 元数据缺失失败，未做渲染截图验证。

## 2026-06-24 - ADR：中心配置格式选型

- ADR：新增 `docs/adr/0001-use-yaml-for-route-config.md`，记录继续使用 YAML 作为 `config/routes.yaml` 中心路由声明配置格式的决定。
- 背景：对比 JSON、TOML 与 YAML 后，确认当前大量有序规则、策略组和 provider 源组合更适合 YAML；外部工具原生格式不影响本项目中心声明层选型。

## 2026-06-25 - Obsidian 公共知识整理

- 已完成：按 `oblearn` 0.1.18 复核已有公共知识，确认 `列表与详情编辑入口`、`Agent 工作流经验`、`配置格式选型` 均保留为稳定主题。
- 已整理：按 `obcurate` 将旧标题 `前端设计避坑` 重命名为 `列表与详情编辑入口`，旧标题不再保留为 alias。
- 已更新：`Agent/Knowledge/_catalog.md` 中对应 term 改为 `list-detail-editing`，并更新项目笔记与相关 wikilink。

## 2026-06-26 - 上游列表条目统计补齐

- 已完成：`CatalogBrowser` 普通列表模式在点击 `list-dir` / `provider-yaml` 等非 `domain-list-community` 上游条目后，也会在选中条目名称右侧显示规则数量。
- 已变更：列表模式复用已存在的 `counts` 缓存，数量来自点击后加载的 `/api/catalog/domains` 结果长度，和 `domain-list` 树节点统计口径一致。
- 已验证：先用新增测试确认红灯失败；实现后 `pnpm exec vitest run apps/web/tests/catalogBrowser.test.tsx` 通过，1 个测试文件、5 个测试；`pnpm --filter @clash-route-kit/web typecheck` 通过。
- 备注：本轮只修改 `apps/web/src/components/CatalogBrowser.tsx` 与 `apps/web/tests/catalogBrowser.test.tsx` 的相关行为；工作树此前已有大量未提交改动，未整理无关文件。

## 2026-06-26 - 本地 .list 删除能力

- 已完成：规则库本地 `.list` 文件从“只能新建/编辑”补齐为可删除。
- 已变更：`apps/cli/src/serveApi.ts` 新增 `deleteProjectRuleFile` 和 `DELETE /api/project/rules/:file`，复用 `config/rules/*.list` 路径校验；`apps/web/src/ruleFiles.ts` 新增 `deleteRuleFile`；`ListFileEditor` 顶部新增确认删除按钮；`LibraryPage` 删除后移除侧边栏项、清空详情并触发刷新。
- 已验证：先用新增测试确认红灯失败；实现后 `pnpm exec vitest run apps/cli/tests/serveApi.test.ts apps/web/tests/ruleFiles.test.ts apps/web/tests/libraryPage.test.tsx apps/web/tests/listFileEditor.test.tsx` 通过，4 个文件、47 个测试；`pnpm --filter @clash-route-kit/cli typecheck` 和 `pnpm --filter @clash-route-kit/web typecheck` 均通过。
- 本地服务：已启动 `http://127.0.0.1:5174/` 供人工验收。
- 备注：工作树此前已有大量未提交改动，本轮只围绕本地 `.list` 删除链路补齐；未整理无关文件。

## 2026-08-07 - 项目默认值与策略组关系重构

- 已完成：新增项目级健康检查与 RuleSet 默认值，统一 Core / CLI / Web 的继承解析和校验；补齐 SubConverter `timeout` 的四种紧凑尾段导入与渲染。
- 已完成：移除“服务组 / 地区组”分类，策略组按 `customProxyGroups` 原顺序展示，并补充直接 RuleSet、父策略组引用、成员、节点来源和有效健康检查信息。
- 已完成：新增统一“项目默认值” Drawer，以及策略组和 RuleSet 的继承、自定义、明确留空或布尔三态编辑；迁移 `config/routes.yaml` 的重复默认值。
- 已验证：`pnpm test` 通过 49 个文件、276 个测试；`pnpm typecheck`、`pnpm build`、`pnpm check`、`pnpm generate` 均通过。
- 已验证：浏览器 INI 预览和生成文件均包含 7 处 `300,5,50`、0 处 `300,,50`；归一化 timeout 槽位后与迁移前 INI 快照逐字一致。
- 已变更：核心范围集中在 `packages/core/src/defaults.ts`、INI 导入/渲染、路由关系摘要、默认值/组/规则 Drawer、`config/routes.yaml` 及对应测试。
- 下一步：人工审阅并隔离当前混合 dirty worktree 中的任务 hunks，再决定本地合并、推送 PR 或保留分支。
- 备注：目标文件与任务开始前已有改动重叠，因此未自动暂存或提交实现；保留既有 Ant Design 弃用警告和 Vite chunk-size 提示。

## 2026-08-07 - Drawer 显式保存与 Vite 重载修复

- 已完成：策略组、RuleSet、项目默认值三个 Drawer 改为本地草稿与显式保存；取消和右上关闭均丢弃草稿，保存时一次原子提交完整实体。
- 已完成：`nodeFilters` 改为多行文本；nullable 覆盖移除“明确留空”，自定义空输入保存为 `null`；项目 GEOIP 默认值只保留开启/关闭并默认写入 `true`。
- 已完成：Vite 只忽略实际配置文件的 watcher 事件，配置写盘不再触发整页重载；普通 RuleSet 启用开关仍保持自动保存。
- 已验证：聚焦测试 9 个文件、67 个测试；`pnpm test` 51 个文件、298 个测试；`pnpm typecheck`、`pnpm build`、`pnpm check`、`pnpm generate` 和 `git diff --check` 均通过。
- 已验证：真实浏览器覆盖三个 Drawer 的保存/取消/右上关闭、项目与单条 GEOIP 选项、节点过滤文本框、普通规则开关即时保存及路由页不跳转；临时服务和文件已安全清理。
- 已变更：核心文件为 `drawerDrafts.ts`、`configMutations.ts`、三个 Drawer、两个页面 wiring、`vite.config.ts` 及对应测试；实现计划正文 checklist 与 Closure Notes 已同步。
- 下一步：由用户决定保留 `redesign/web-console`、本地合并或推送 PR；如需提交，先人工隔离混合工作树中的任务 hunks。
- 备注：当前工作树包含 70+ 个混合修改文件，因此未自动暂存或创建实现提交；既有 Ant Design 弃用/兼容警告和 Vite chunk-size 提示仍为非阻断项。

## 2026-08-07 - Web 控制台分支本地合并

- 已完成：将 `redesign/web-console` 从共同基线 `4602f92` 快进合并到 `main` 的 `8e7a528`，随后删除特性分支。
- 已完成：用唯一 stash 暂存全部未提交和未跟踪内容，合并后恢复到 `main`；恢复前后均为 96 条状态，SHA-256 指纹完全一致。
- 已验证：合并前和合并后的 `pnpm test` 均通过 51 个文件、298 个测试；特性分支提交已确认是 `main` 的祖先。
- 已清理：验证通过后删除临时 stash `7384b85`；用户随后明确授权整体提交，96 个文件已统一纳入 `feat: finalize route management console`。
- 已验证：整体提交前 `pnpm test`、`pnpm typecheck`、`pnpm build`、`pnpm check`、`pnpm generate` 和 staged `git diff --check` 均通过。
- 下一步：工作树已清洁；本次未 push，由用户决定何时同步 `main` 到远端。

## 2026-08-13 - v1 配置健康门禁阶段完成

- 已完成：Core 统一结构化诊断、严格 v1 parser、依赖图与循环检测；Web、CLI、local API 和 Git 提交/推送动作共享 error 门禁。
- 已完成：禁用 provider / RuleSet 草稿语义统一，禁用项不参与生成；当前 feature baseline 的 `config/routes.yaml` 补齐四个 classical provider source，并将 `google-cn` 数据源修正为 `google@cn`。
- 已复审：阶段整体独立复审发现 2 个 Important（独立 `git-commit` 绕过门禁、禁用 provider 半成品 source 被阻断），提交 `90bddc9` 修复后 scoped re-review 无 Critical/Important。
- 已验证：`pnpm test` 55 个文件、343 个测试通过；`pnpm typecheck`、`pnpm build`、`pnpm check`、`pnpm generate` 全部通过；仅保留既有 Ant Design 弃用与 Vite chunk-size 非阻断提示。
- 当前载体：分支 `feat/workflow-redesign`，worktree `.worktrees/workflow-redesign`，HEAD `90bddc9`；尚未 merge、push 或创建 PR。
- 下一步：由用户选择本地合并、推送 PR 或保留分支；根工作区用户修改的 `config/routes.yaml` 必须冲突感知合并，不能直接覆盖。
