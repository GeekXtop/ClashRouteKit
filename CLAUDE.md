# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

ClashRouteKit 是模块化维护 OpenClash / Clash Meta 路由规则、SubConverter INI 和 rule-provider 的本地工具。设计目标是**自己声明规则模块和策略组**，不继承 Aethersailor、ACL4SSR 或 dler 的 INI 主模板；第三方规则（如 GEOSITE 标签、community 域名列表）只作为数据源引用。

## 常用命令

包管理器是 pnpm（`packageManager: pnpm@9.1.4`），在仓库根目录运行：

- `pnpm test` — 运行全部测试（vitest run）
- `pnpm typecheck` — 全工作区类型检查（`pnpm -r typecheck`，各包用 `tsc --noEmit`）
- `pnpm build` — 全工作区构建（`pnpm -r build`，core/cli 用 `tsc`，web 用 `vite build`）
- `pnpm dev` — 启动 web 控制台（`vite --host 127.0.0.1`）
- `pnpm serve:output` — 以 `http://127.0.0.1:8787` 暴露 `output/`，用于本地 SubConverter 拉取 INI/provider
- `pnpm generate` — 从 `config/modules.yaml` 生成 INI 模板和 rule-provider YAML 到 `output/`
- `pnpm preview` — 打印「来源 → 策略」的规则顺序，不写文件
- `pnpm check` — 校验所有模块/FINAL 引用的策略组都存在，缺失则退出码 1

运行单个测试：

- 按文件：`pnpm test packages/core/tests/renderIni.test.ts`
- 按用例名：`pnpm exec vitest run -t "renders module rules"`

无 lint 工具（未配置 ESLint/Prettier）；代码质量门禁靠 `typecheck` 和 `test`。

## 架构

pnpm workspace monorepo，三个包通过 `workspace:*` 互相引用：

- `packages/core`（`@clash-route-kit/core`）— **纯函数**核心库，无任何文件 IO，是所有渲染/转换逻辑的唯一所在。
- `apps/cli`（`@clash-route-kit/cli`）— 命令行入口，负责读写文件并调用 core。
- `apps/web`（`@clash-route-kit/web`）— React 19 控制台，只读可视化 + 实时 INI 预览（**不写回配置**）。

### 单一数据源

`config/modules.yaml`（类型 `RouteKitProjectConfig`，定义在 `packages/core/src/types.ts`）是整个系统的唯一配置源，被三方各自读取：

- CLI：`node:fs` + `yaml` 包解析（`apps/cli/src/program.ts: readConfig`）
- Web：Vite 的 `?raw` import（`apps/web/src/config.ts`），构建期内联
- 测试：内联 sample 字符串或 `mkdtemp` 临时目录

修改配置的 schema 时，这三处消费方和 `types.ts` 都要同步考虑。

`publishBaseUrl` 是写入 INI 的 provider URL 根地址。当前本地默认值是 `http://127.0.0.1:8787`，脚本会生成 `<publishBaseUrl>/rules/<file>.yaml`。如果 SubConverter 或 OpenClash 不在同一台机器运行，需要改成可被它访问的 LAN IP 或公开 URL。

### core 的三个核心函数

- `renderIni(config)`（`ini.ts`）→ SubConverter `[custom]` INI 字符串。**规则顺序即优先级**：按 `modules` 数组顺序展开，每个模块内部依次输出 providers → geosite → geoip，最后追加 `FINAL`。`enabled: false` 的模块整体跳过。策略组渲染时 `options` 加 `[]` 前缀、`nodeFilters` 不加，字段用反引号 `` ` `` 分隔。
- `convertDomainListCommunity(content, options)`（`rules.ts`）→ 把 v2ray/community 域名列表转成 Clash 规则数组，递归展开 `include:`（用 `seenIncludes` 防环），输出去重。
- `generateDomainProvider(input)`（`rules.ts`）→ rule-provider domain payload YAML。**只保留** `DOMAIN-SUFFIX`（→ `'+.x'`）和 `DOMAIN`（→ `'x'`），其余规则类型（keyword、IP-CIDR 等）被丢弃，结果排序去重。

### CLI 命令的数据流

`apps/cli/src/index.ts` 是入口（读 `process.argv[2]` 分发），`program.ts` 是实现：

- `generate` → 读 config + 各 provider source → 写 `output/templates/<template.output>` 和 `output/rules/<provider.output>`
- `preview` / `check` → 只读 config，分别打印规则顺序、校验策略组引用完整性

项目根的定位：`resolveProjectRoot` 从 cwd 向上查找含 `config/modules.yaml` 的目录。可用环境变量覆盖：`CLASH_ROUTE_KIT_CONFIG`（默认 `config/modules.yaml`）、`CLASH_ROUTE_KIT_ROOT`。

### rule-provider source 类型

`ruleProviders[].sources` 支持三种公开规则来源：

- `clash-list`：读取本地 `.list`，例如 `DOMAIN-SUFFIX,example.com`。
- `clash-provider`：读取 Clash provider YAML 的 `payload` 数组。
- `domain-list-community`：读取本地 domain-list-community data 文件，递归展开 `include:`。

当前默认配置引用相对路径的本地上游仓库：`../../Github-GeekXtop/domain-list-community/data`、`../../Github-GeekXtop/ACL4SSR/...`、`../../Github-GeekXtop/Rules/...`。不要把绝对机器路径写进提交。

## 关键约定

- **ESM / NodeNext**：所有相对 import 必须带 `.js` 扩展名，即使源文件是 `.ts`（例如 `from "./ini.js"`、`from "./program.js"`、`from "./config.js"`）。这是 `tsconfig` 用 `module: NodeNext` 的硬性要求。
- **monorepo 内免构建开发**：`packages/core/package.json` 的 `exports` 提供了 `development` condition 指向 `src/index.ts`。CLI 用 `tsx --conditions development` 直接跑 TS 源；web 的 `vite.config.ts` 和根 `vitest.config.ts` 都用 alias 把 `@clash-route-kit/core` 指向 `packages/core/src/index.ts`。因此改 core 源码后**无需先 build** 即可在 cli/web/测试中生效。
- **新增 core 的导出**要在 `packages/core/src/index.ts` 显式 re-export（含类型），否则其他包引用不到。
- `output/`、`dist/`、`vendor/` 均被 gitignore，是生成产物，不要手工编辑。

## 测试约定

vitest，测试文件位置由 `vitest.config.ts` 的 `include` 限定为 `packages/*/tests/**/*.test.ts` 和 `apps/*/tests/**/*.test.ts`。

- core 的测试针对纯函数直接断言输出（如 `renderIni.test.ts` 校验 INI 行内容与顺序）。
- cli 的测试是集成式：用 `mkdtemp` 建临时目录、写入 sample config 和 `.list` 文件，跑 `generateOutputs` 后读回产物断言。新增 CLI 行为时沿用这一模式，不要依赖仓库里的真实 `config/`。
