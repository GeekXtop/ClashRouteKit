# Agent 工作约定

Obsidian 项目笔记：`Agent/Projects/ClashRouteKit.md`。

## 规则入口

- 修改代码前先读本文件，确认 memory 位置、Obsidian 项目笔记和当前工作范围。
- 仓库通用指南：`AGENTS.md`。
- Claude Code 专用指南：`CLAUDE.md`。
- Superpowers 设计规格书：`docs/superpowers/specs/`。
- Superpowers 实现计划：`docs/superpowers/plans/`。
- 架构决策记录：`docs/adr/`。
- 如果需要项目结构、命令、测试、架构、提交规范或安全细节，读取上述源文件，不要依赖本文件的二次摘要。
- 不要把 `AGENTS.md` / `CLAUDE.md` / README / docs 的长内容完整复制进本文件。

## 初始化范围

项目初始化阶段，agent 只能创建或更新：

- `AGENTS.md`
- `CLAUDE.md`
- `.agents/`
- `docs/adr/`
- `docs/superpowers/specs/`
- `docs/superpowers/plans/`

其他路径必须等待用户明确要求。

## 日常工作

- 只修改用户任务范围内的代码和文档。
- 批量移动、删除、重命名、改生成文件、改依赖或重组文档前先问用户。
- 构建、测试、部署和运行时不能依赖私人笔记、本地 vault 或个人工具。
- Agent 默认使用简体中文回复。
- 假定系统是 Windows 11。
- 修改文件内容时使用 `apply_patch`，避免编码漂移。

## 记忆库

- 任务开始、阶段完成、会话收尾时更新 `.agents/active.md`。
- 有明确里程碑时更新 `.agents/progress.md`。
- 只有可复用经验才更新 `.agents/lessons.md`。
- 长期项目决策写入 `docs/adr/`。
- `docs/superpowers/` 保存 spec 和 plan；在 `.agents/active.md` 链接当前文件，不复制全文。

## 重复运行

- 如果入口提示已经存在，不要重复追加。
- 如果 `.agents/` 文件已经存在，保留现有内容，只补缺失段落或缺失文件。
- 如果现有规则之间冲突，停止修改冲突文件并向用户列出待确认项。
