# 经验记录

本文件只记录项目内可复用经验。

## 2026-06-22 - 初始化不能覆盖已有入口指南

- 背景：旧版 `obinit` 在已有 `AGENTS.md` 和 `CLAUDE.md` 的仓库里，把长指南替换成了短英文指针。
- 经验：已有非空入口文件只能追加 `.agents/instructions.md` 的中文入口提示，不能整体替换。
- 适用场景：在已有项目里初始化或更新 agent memory。
- 下次检查：执行 `$obinit` 后查看 `git diff -- AGENTS.md CLAUDE.md .agents docs/adr/README.md docs/superpowers`，确认没有丢失原有规则。

## 2026-06-22 - 成熟项目 instructions 应保持索引型

- 背景：成熟项目已有 `AGENTS.md` / `CLAUDE.md` 长指南时，如果 `.agents/instructions.md` 再复制项目结构、命令、架构和测试清单，会造成重复读取和未来规则漂移。
- 经验：成熟项目的 `.agents/instructions.md` 只记录 memory 协议、Obsidian 项目笔记、源文件链接和写入边界。
- 适用场景：fork 项目、已有成熟项目、已经有工具入口文件的项目。
- 下次检查：`.agents/instructions.md` 不应包含从 `AGENTS.md` / `CLAUDE.md` 复制来的长章节；需要细节时链接源文件。

## 2026-06-23 - 导入模板注释不能跨规则继承

- 背景：SubConverter 模板里的 `; section` 注释被 parser 保存在 `currentSection` 后没有清空，导致后续多个 ruleSet 都显示同一条分节说明，例如 Emby 说明串到 Spotify、游戏、媒体和 GEOIP。
- 经验：解析规则注释时，注释只应作用于紧随其后的规则；push 一个 ruleSet 后必须清空临时 section 状态。
- 适用场景：修改 `packages/core/src/import.ts`、导入模板、路由页分节展示或 `config/routes.yaml` 的 `section` 数据。
- 下次检查：除修 parser 外，还要清理已经持久化到 `config/routes.yaml` 的污染 section，否则 UI 仍会展示旧错误数据。

## 2026-06-23 - 列表行只读不等于详情抽屉只读

- 背景：路由规则行的“归属策略组”应从行内编辑改回只读展示，但详情抽屉里的“归属策略组”仍是唯一合理的修改入口；误把抽屉也改成只读会让用户无处修改策略归属。
- 经验：在“列表行 + 详情抽屉”交互里，列表行通常负责概览和快速状态切换，详情抽屉负责完整编辑；把行内控件降级为只读时，必须确认详情编辑入口仍保留。
- 适用场景：修改 `apps/web/src/components/RuleRow.tsx`、`RuleDrawer.tsx`，或任何包含表格/列表行与详情编辑面板的前端页面。
- 下次检查：实现“恢复之前样式”前先查历史实现和现有设计系统组件；测试同时覆盖列表行无编辑控件/无删除入口，以及抽屉字段仍可编辑并触发更新。

## 2026-06-23 - 执行计划收尾要处理正文 checklist

- 背景：两个 Superpowers plan 顶部 `Execution Status` 已标记完成，但正文原始执行步骤仍保留大量 `- [ ]`，其中 Web follow-up 计划还有被后续反馈废弃的旧步骤，导致计划状态看起来未完成且容易误导下一个 agent。
- 经验：完成 plan 后不能只补顶部摘要；必须扫描整份 plan 的 checkbox。真实完成的步骤打勾，已被反馈替代的步骤改成历史记录或明确标注 superseded，避免把废弃方案伪装成已完成。
- 适用场景：执行 `docs/superpowers/plans/` 下的实现计划，尤其是执行中被用户反馈改变范围或交互方案的任务。
- 验证方式：收尾前运行 `rg -n "\\- \\[ \\]" docs/superpowers/plans/<plan>.md`；若仍有未勾选项，逐项判断是未完成、已完成还是 superseded，并更新 `Execution Status` 和 `Closure Notes`。
- 最后验证：2026-08-07 已扫描并同步 `2026-08-07-project-defaults-and-proxy-group-routing.md` 与 `2026-08-07-explicit-drawer-save.md` 的正文 checklist、Execution Status 和 Closure Notes；两份计划均无未处理 checkbox。

## 2026-06-25 - 公共知识写入后要同步 catalog

- 背景：按 `oblearn` 0.1.18 复核此前生成的公共知识时，发现 `前端设计避坑`、`Agent 工作流经验`、`配置格式选型` 笔记本身可复用，但未登记到 `Agent/Knowledge/_catalog.md`，后续 agent 先读 catalog 时可能漏掉这些知识。
- 经验：公共知识写入完成后，如果主题和关键词明确，应同步更新 `_catalog.md` 的 `terms` / `aliases` / `notes`；历史知识默认保留原位，不因模板升级而批量移动或重写。
- 适用场景：使用 `oblearn` 追加或新建公共知识、复核旧公共知识、升级 Obsidian agent skills 后检查可发现性。
- 下次检查：先读 `_catalog.md`；确认新知识有明确 term、常用中英文关键词在 aliases、notes 指向真实存在的笔记；不确定分类时不要登记。

## 2026-08-07 - 混合 dirty worktree 合并前要验证可恢复性

- 背景：特性分支包含大量已提交历史，同时工作树还有 70+ 个无法安全整体提交的混合修改；直接切换分支会遗漏未提交实现或产生覆盖风险。
- 经验：先记录 `git status --porcelain=v1 --untracked-files=all` 的条目数和 SHA-256，再用带唯一说明的 `git stash push --include-untracked` 清空工作树；合并到共同基线后应用 stash，只有状态指纹一致且完整测试通过，才删除 stash 和已合并分支。
- 适用场景：普通仓库内需要本地合并，但当前分支存在必须保留且不能混合提交的 tracked/untracked 修改。
- 验证方式：合并前后分别计算完整 porcelain 状态的条目数和 SHA-256；执行 `git merge-base --is-ancestor <feature> <base>`；恢复工作树后运行完整测试。
- 最后验证：2026-08-07 `redesign/web-console` 合并到 `main` 时，恢复前后均为 96 条状态且 SHA-256 为 `3F1D17BA65895E17FE1E1AD159C3553D0E75675978109DBDE0E46F29AB0CF6CB`，合并后 298 个测试通过。
