# 仓库指南

## 项目结构与模块组织

本仓库是一个 pnpm TypeScript workspace，用于维护 OpenClash / Clash Meta 路由配置。

- `packages/core/`：共享类型、INI 渲染、rule-provider 生成逻辑和包级测试。
- `apps/cli/`：提供 `generate`、`preview`、`check` 命令，入口位于 `src/index.ts` 和 `src/program.ts`。
- `apps/web/`：React/Vite 本地控制台；界面源码在 `src/`，静态资源在 `public/`。
- `config/modules.yaml`：策略组、模块顺序、GEOSITE/GEOIP 条目和 provider 声明。
- `config/rules/`：手工维护的规则列表。
- `output/`：生成的 INI 和 provider YAML；本地 ignored，不提交到 `main`，由 GitHub Actions 发布到 `publish` 分支。

## 构建、测试与开发命令

- `pnpm install`：根据 `pnpm-lock.yaml` 安装依赖。
- `pnpm dev`：通过 Vite 启动 Web 控制台。
- `pnpm serve:output`：把 `output/` 以 `http://127.0.0.1:8787` 暴露给本地 SubConverter。
- `pnpm sync:vendor`：同步上游公开规则仓库到 ignored `vendor/`。
- `pnpm test`：运行全部 Vitest 测试。
- `pnpm typecheck`：检查所有包和应用的 TypeScript 类型。
- `pnpm build`：递归构建整个 workspace。
- `pnpm generate`：将模板和 rule-provider 写入 `output/`。
- `pnpm preview`：打印解析后的路由顺序。
- `pnpm check`：校验策略引用是否有效。

## 编码风格与命名约定

使用 strict TypeScript、ES modules 和 NodeNext 解析。保持两个空格缩进、双引号、多行调用尾随逗号，并为本地 ESM 导入保留显式 `.js` 后缀。函数和变量使用 `camelCase`，React 组件和导出类型/接口使用 `PascalCase`，路由模块 ID 使用简短小写名称。路由数据应保持在 YAML 或 `.list` 文件中声明，避免在应用代码中重复配置逻辑。

## 测试指南

测试使用 Vitest，并放在对应包或应用附近的 `tests/*.test.ts` 中。测试文件名应面向行为，例如 `renderIni.test.ts` 或 `cli.test.ts`。修改 INI 渲染、规则解析、CLI 校验、路由摘要或配置驱动行为时，应补充测试。提交前运行 `pnpm test` 和 `pnpm typecheck`；修改配置或规则源时，额外运行 `pnpm generate` 与 `pnpm check`。

## 提交与 Pull Request 规范

提交信息使用简洁的祈使句，例如 `feat: add route summary filter`、`fix: validate final policy` 或 `docs: update contributor guide`。PR 应说明路由或界面影响，列出已运行的验证命令，关联相关 issue；涉及 Web 控制台可见变化时附截图。

## 安全与 Agent 专用说明

不要提交密钥、订阅 URL、私有代理端点或最终 `config.yaml`。上游公开规则仓库应通过 `pnpm sync:vendor` 同步到当前项目 ignored `vendor/`，不要依赖机器旁边的 clone，也不要写入绝对路径。确保 `output/` 文件可由 `config/` 重新生成，并由 `publish` 分支公开。Agent 工作时默认使用简体中文回复，假定系统为 Windows 11；修改文件内容时使用 `apply_patch`，避免编码漂移。
