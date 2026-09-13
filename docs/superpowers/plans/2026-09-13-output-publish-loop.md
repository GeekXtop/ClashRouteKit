# 输出与 GitHub 发布闭环实施计划（Phase E）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依据 `docs/superpowers/specs/2026-08-10-web-console-workflow-redesign-design.md` 第 7.4、8.3、11.3、13.E 节，完成输出页闭环：设备配置默认本地模板并可切换远程模板；GitHub 发布使用真实分支流向（只允许 main）、展示 Actions 运行状态、publish 分支仅在 Actions 成功后标记最新；发布工作流配置 concurrency。

**Architecture:** local-server 新增 workflow 查询用例（经 `git remote` 解析 GitHub 仓库，调用 GitHub API 查 publish workflow 最新运行，凭据只用环境变量/本机 git 凭据，不落盘）；`TemplateSourceStatus` 统一计算本地/远程模板可用状态供设备配置与 GitHub 发布两个标签共用；发布按钮绑定真实动作序列（校验 → git add/commit → push main）。

**Tech Stack:** 同仓库现状（React 19、AntD v5、Vitest 5、Node 22）。

## Global Constraints

- 订阅 URL 与 Token 只存在会话内存；Actions 查询凭据不写盘、不进日志。
- GitHub 发布主按钮名称为真实动作"提交并推送 main"；当前分支非 main 时停止并提示，不静默推送其它分支。
- `publish` 分支与远程 Raw URL 仅在 Actions 运行 success 后标记为最新；排队/进行中显示对应状态。
- 发布工作流配置 `concurrency`（group 按发布目标，cancel-in-progress: true）。
- 失败的每一步（校验/提交/推送/Actions）分别报告，不合并为模糊"发布失败"。
- 设备配置生成失败保留全部表单内容，并指明模板不可达 / SubConverter 不可达 / 输入缺失。
- 高级转换选项默认折叠，展开后保留现有参数能力。
- v1/v2 双通路不回归；全仓测试基线 84 文件 670 用例只增不减。

---

## Tasks

### Task 1：发布工作流 concurrency + 发布标签真实流向

- Modify `.github/workflows/publish.yml`：加 `concurrency: { group: publish-${{ github.ref_name }}, cancel-in-progress: true }`。
- local-server `src/git/`：新增 `getGitBranch(root)`（当前分支）与 `getWorkflowRunStatus(root, options)`（remote → GitHub API `actions/workflows/publish.yml/runs?per_page=1`，返回 status/conclusion/createdAt/htmlUrl；无 remote 或非 GitHub 时返回 unsupported，不报错）。
- apiHandler：新增只读端点（GET `/api/git/publish-status` 或按现有风格）聚合当前分支 + 最近一次 workflow 运行。
- Web GitHub 发布标签：显示 origin、当前分支、非 main 时禁用主按钮并提示；主按钮文案改"提交并推送 main"（动作序列不变：统一校验 → add → commit → push）；推送后轮询 publish-status 展示 排队/运行中/成功/失败 与时间、链接；成功后才把远程模板 URL 标记为最新。
- 测试：local-server 用例（分支读取、API mock 三态）、Web 组件用例（非 main 阻止、按钮文案、状态轮询 mock、成功标记）。

### Task 2：设备配置标签完善 + TemplateSourceStatus 统一 + 收尾

- 新建 `TemplateSourceStatus`（apps/web 共享模块）：统一计算本地实时模板 URL 可达性（HEAD/GET 探测，防抖）与远程模板 URL 可用性（由 publish-status 推导），设备配置与 GitHub 发布标签共用。
- 设备配置标签：模板来源单选默认"本地实时模板"，远程可用时可切换"GitHub 远程模板"；生成失败按三类原因提示并保留表单；高级转换选项收进默认折叠的 Collapse（保留现有参数与测试兼容）。
- 全量验收：四页走查复查、`pnpm test`/`typecheck`/`build`/`check`/`generate` 全绿、计划勾选、`.agents` 记录、push。

## Verification（整体验收）

- [x] `pnpm test` 全绿（≥670）。
- [x] `pnpm typecheck`、`pnpm build`、`pnpm check`、`pnpm generate` 通过。
- [x] publish.yml 含 concurrency；非 main 分支发布被阻止（组件测试覆盖）。
- [x] `pnpm dev` 走查输出页：设备配置默认标签、模板来源切换、发布按钮真实文案与状态展示。
- [x] 记录与推送完成。
