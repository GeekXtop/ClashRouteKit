# ClashRouteKit 项目状态

更新时间：2026-06-05

## 当前结论

项目目前处于“基础设施可用，产品形态未完成”的阶段。

已经完成的是规则配置模型、核心生成逻辑、CLI、真实数据源接入、Git 初始化和 GitHub Actions 发布方案。前端目前只是一个只读控制台骨架，用来展示 `config/modules.yaml`、临时切换模块并预览 INI，不是可用的规则编辑器。

## 已完成

### 仓库与工程结构

- 已创建独立项目：`E:\Developer\Solutions\ClashRouteKit`
- 已初始化 Git 仓库，当前提交：
  - `96a1d93 feat: bootstrap clash route kit`
  - `c9612a1 ci: publish generated route files`
- pnpm workspace 已建立：
  - `packages/core`
  - `apps/cli`
  - `apps/web`
- `output/`、`dist/`、`vendor/`、`node_modules/` 已忽略，不提交到 `main`。

### 核心生成能力

- `packages/core` 已支持：
  - 渲染 SubConverter `[custom]` INI。
  - 将 `domain-list-community` data 转换为 Clash 规则。
  - 生成 Clash domain rule-provider YAML。
- 当前只生成 domain provider。
- 当前 domain provider 只保留：
  - `DOMAIN-SUFFIX`
  - `DOMAIN`
- 当前不会把 `DOMAIN-KEYWORD`、`IP-CIDR`、`PROCESS-NAME` 写入 domain provider。

### CLI

已实现：

- `pnpm check`
- `pnpm preview`
- `pnpm generate`

CLI 支持的规则来源：

- `clash-list`
- `clash-provider`
- `domain-list-community`

CLI 支持本地/CI 双路径：

- 本地通过 `pnpm sync:vendor` 同步上游到当前项目 `vendor/`。
- CI 也通过 `pnpm sync:vendor` 同步同一批上游。

发布时支持用 `CLASH_ROUTE_KIT_PUBLISH_BASE_URL` 覆盖 `publishBaseUrl`。

已实现：

- `pnpm sync:vendor`

### 配置模型

主配置文件：

```text
config/modules.yaml
```

当前默认规则方向：

```text
private -> Direct
custom-direct -> Direct
custom-proxy -> Proxy
ai -> AI
developer -> Tech
crypto -> Crypto
microsoft -> Microsoft
geolocation-!cn -> Proxy
geolocation-cn/cn/geoip-cn -> Direct
FINAL -> Proxy
```

INI 生成分成两块：

- `ruleset`：定义流量去哪个策略组。
- `custom_proxy_group`：定义策略组里有哪些节点、下级策略或节点过滤器。

当前节点分组能力还比较基础：可以声明静态策略组、下级选项和节点正则，但还没有“按地区自动生成节点组”或“订阅分组复用/双重分组”的完整建模。

当前已接入真实数据源：

- `v2fly/domain-list-community`
- `ACL4SSR/ACL4SSR`
- `dler-io/Rules`

### GitHub publish 发布方案

已新增：

```text
.github/workflows/publish.yml
```

设计目标：

- `main` 只提交源码、配置和手写规则。
- CI 生成 `output/`。
- CI 将 `output/` 发布到 `publish` 分支。

发布后预期 URL：

```text
https://raw.githubusercontent.com/<owner>/<repo>/publish/templates/Custom_Clash.ini
https://raw.githubusercontent.com/<owner>/<repo>/publish/rules/Developer_Domain.yaml
```

注意：本地还没有配置 Git remote，也还没有实际 push 到 GitHub，所以 workflow 尚未在 GitHub 上跑过。

### Web 控制台

当前 Web 已能启动：

```powershell
pnpm dev
```

当前能力：

- 读取 `config/modules.yaml`。
- 展示模块列表。
- 在浏览器内临时切换模块启用状态。
- 展示规则顺序。
- 展示 INI 预览。
- 展示策略组和 provider 输出声明。

当前限制：

- 不会保存修改。
- 不会写回 `config/modules.yaml`。
- 不能编辑策略组。
- 不能编辑 GEOSITE/GEOIP。
- 不能新增/删除 provider source。
- 不能运行 `check` / `generate`。
- 不能查看真实 provider payload。
- 不能检查 geosite tag 是否存在。
- 不能展示规则来源、去重、冲突、覆盖关系。

因此现在前端只能算“可视化预览骨架”，还不是实际可用工具。

## 还没做

### 发布与仓库

- 没有添加 GitHub remote。
- 没有 push 到 GitHub。
- `publish` 分支还没有由 Actions 实际生成。
- 没有验证 GitHub raw URL 能被 SubConverter 拉取。
- 没有 actionlint；workflow 只做了结构检查和本地命令验证。

### 规则能力

- 没有 schema 校验，例如 Zod 或 JSON Schema。
- 没有 `remove` / `exclude` 机制，暂时不能系统性去掉 PT、影视细分、广告等不想要的规则。
- 没有 provider 级统计报告，例如每个 source 贡献多少条。
- 没有重复域名归属解释。
- 没有重合域名分析，例如 Developer 与 Microsoft、GitHub Copilot 与 AI 的交叉。
- 没有 classical provider。
- 没有 ipcidr provider。
- 没有 `DOMAIN-KEYWORD` 的合理输出策略。
- 没有地区节点组生成器。
- 没有订阅自带分组复用策略。
- 没有用途组到地区组的双重分组模板。
- 没有 geosite tag 索引或搜索。

### OpenClash/SubConverter 集成

- 还没有生成最终 `config.yaml`。
- 还没有和本地 SubConverter-Extended 做端到端调用。
- 还没有 OpenClash 导入测试。
- 还没有节点订阅输入管理。
- 还没有公开仓库 URL 固化后的完整使用说明。

### 前端

前端缺口最大。要变成真正可用，至少还需要：

- 本地后端 API 或 CLI bridge。
- `config/modules.yaml` 读写。
- 表单编辑模块、策略组、source。
- 保存前 diff 预览。
- 一键 `check`。
- 一键 `generate`。
- provider payload 查看。
- source 贡献统计。
- geosite tag 搜索与选择。
- rule order 拖拽排序。
- remove/exclude 编辑器。
- 错误展示和修复建议。

## 建议下一步

### 第一优先级：发布链路跑通

目标：确认 GitHub `publish` 分支真的能产出可用 URL。

任务：

1. 添加 GitHub remote。
2. push `main`。
3. 手动触发 `Publish Generated Files`。
4. 确认 `publish` 分支包含：
   - `templates/Custom_Clash.ini`
   - `rules/*.yaml`
5. 用 raw URL 拉取模板和 provider。
6. 用 SubConverter-Extended 生成最终 Clash 配置。

### 第二优先级：规则治理能力

目标：解决你最早提到的维护痛点。

任务：

1. 增加 `remove` / `exclude` 配置。
2. 增加 source 贡献统计。
3. 增加重复和重合规则报告。
4. 增加 geosite tag 存在性检查。
5. 增加 provider 输出 summary。

### 第三优先级：前端变成可用工具

目标：前端从“展示”变成“编辑器”。

任务：

1. 增加本地 API。
2. 让 Web 能读写 `config/modules.yaml`。
3. 增加模块编辑。
4. 增加策略组编辑。
5. 增加 source 编辑。
6. 增加 check/generate 按钮。
7. 增加生成结果和错误输出面板。

## 当前可用命令

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm check
pnpm preview
pnpm generate
pnpm serve:output
pnpm dev
```

本地使用已有 clone 生成：

```powershell
pnpm sync:vendor
pnpm generate
pnpm serve:output
```

## 当前判断

现在项目方向是对的：已经从“修补别人 INI”转成“自己声明模块，再消费第三方数据”。但它还不是完整产品。

CLI 已经具备最小可用闭环。发布链路已经写好，但还没在 GitHub 上跑过。前端目前只是观察面板，不能承担真实维护工作。
