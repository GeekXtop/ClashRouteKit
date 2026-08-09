# ClashRouteKit 工作流与配置架构重设计

- 日期：2026-08-10
- 状态：待用户复审（配置架构回修版）
- 范围：Web 控制台信息架构、项目配置模型、统一校验、包边界与关键交互

## 1. 背景

当前控制台已经具备导入、规则维护、路由编排、本地模板、GitHub 发布和设备配置生成能力，但页面与配置模型都逐渐从“简单声明文件”演变成了多个子系统共享的中心对象，产生了以下问题：

1. 导入是新项目的第一步，却固定在右上角，默认首页仍进入规则库。
2. 策略组只读预览与编辑抽屉重复展示成员、引用关系和命中规则；主路由列表又重复展示同一批命中规则。
3. 路由页与发布页都展示大段 INI，信息密度高，但不能直接帮助当前任务。
4. 本地实时模板、GitHub 发布、设备配置被排成一条纵向流程，容易让用户误以为必须发布到 GitHub 后才能生成设备配置。
5. “构建并推送 publish 分支”的文案与真实行为不一致：本地动作提交并推送当前分支，真正的 `publish` 分支由 GitHub Actions 生成。
6. 当前工作副本的 `config/routes.yaml` 已增长到约 41.7 KB、1435 行；52 个策略组中，大量业务组重复三套近似成员列表，新增一个地区组会引发几十处修改。
7. 策略组显示名称同时承担 ID、引用键和展示文案；Emoji 或名称调整会产生大范围引用更新。
8. Core 只做浅层顶级字段检查，CLI、Web 又各自维护读取和校验路径，导致同一配置在 Web 中可保存、在 CLI 中可能失败。
9. 当前模型允许 URL 落入节点过滤器、零数据源 provider 被启用、`.mrs` 交给 YAML provider 生成器等语义不完整状态。
10. 顶层 workspace 划分合理，但实际领域逻辑分散在 Web 与 CLI；Web 的 Vite 配置还直接导入 CLI 源码，`serveApi.ts` 同时承担过多职责。

本次设计不再局限于“重排页面”。目标是同时整理用户工作流、项目作者配置、运行时设置、规范化领域模型和代码边界。

## 2. 设计目标

- 让新用户从导入开始，让已有项目直接恢复到当前状态。
- 每类信息只有一个主要归属，消除只读预览、编辑界面与上下文列表之间的重复。
- 以本地闭环为默认路径：不使用 GitHub 也能完成模板生成和设备配置导出。
- 将 GitHub 明确为可选发布方式，而不是设备配置的前置步骤。
- 继续使用 YAML，并保留一个逻辑项目事实源。
- 为作者配置增加显式 `schemaVersion`、稳定 ID、可复用成员集合和可迁移的版本边界。
- 区分“作者配置”“本地运行设置”“规范化领域模型”和“渲染输入”，不再让一个接口承担全部语义。
- 将解析、迁移、规范化、引用图、纯配置校验和 mutation 集中到 Core，CLI 与 Web 共享同一结果。
- 让按钮文案、状态反馈和分支流向与真实 Git/GitHub Actions 行为一致。
- 对高频基础选项直接展示，对低频仓库设置、转换参数和完整差异采用渐进披露。
- 保留显式保存抽屉和会话内订阅隐私边界。

## 3. 非目标

- 不更换 YAML 为 JSON、TOML 或数据库。
- 当前阶段不立即把项目作者配置物理拆成多个需要协同提交的文件。
- 不新增云端账号、设备同步或订阅托管服务。
- 不把机场订阅 URL、Token 或最终 `config.yaml` 写入项目文件、Git 或浏览器持久存储。
- 不改变最终 SubConverter INI 与 Clash rule-provider 的目标语义；变化发生在作者模型和规范化过程。
- 不在这一轮支持生成 Mihomo `.mrs`；没有专用生成器前，`.mrs` 不能成为可执行 provider 输出。
- 不把控制台改成只能按顺序前进的向导。
- 不在本规格中决定视觉主题或组件库迁移。

## 4. 既有决策与设计依据

### 4.1 YAML 与单一事实源

`docs/adr/0001-use-yaml-for-route-config.md` 继续有效：项目作者配置使用 YAML，路由数据优先保持声明式，应用代码负责解析、校验、规范化、渲染和生成。

本规格对“单一事实源”作进一步限定：

- 它表示项目业务事实只有一个权威作者模型。
- 它不表示作者 YAML 必须直接等于渲染 DTO。
- 它不表示本地端口、LAN 地址和 SubConverter 端点必须进入可提交的项目配置。
- 当前阶段仍保留一个物理 `config/routes.yaml`；完成去重和规范化后，再依据真实的 Git 冲突与维护成本决定是否拆分。若未来物理拆分，需要新 ADR 明确取代当前决定。

### 4.2 交互原则

- Nielsen Norman Group 的渐进披露：默认只展示完成当前任务所需的信息，将高级参数和低频设置放入折叠区、抽屉或次级标签。
- Nielsen Norman Group 的可用性启发式：系统状态可见、用用户语言描述动作、避免用户记忆内部 Git 分支或配置依赖。
- GOV.UK “Complete multiple tasks”：用任务状态帮助用户判断哪里未完成，但允许跳转和重复进入，不伪造严格线性流程。
- GOV.UK “Check answers”：导入、迁移和 GitHub 发布等有覆盖风险的操作，在执行前展示结构化摘要。
- GitHub Actions concurrency：发布工作流只保留同一发布目标的最新运行，避免旧任务晚完成后覆盖新产物。

参考：

- <https://www.nngroup.com/articles/progressive-disclosure/>
- <https://www.nngroup.com/articles/ten-usability-heuristics/>
- <https://design-system.service.gov.uk/patterns/complete-multiple-tasks/>
- <https://design-system.service.gov.uk/patterns/check-answers/>
- <https://docs.github.com/en/actions/using-jobs/using-concurrency>

## 5. 配置架构

### 5.1 四层模型

配置链路拆成四层，每层只有一个职责：

```text
config/routes.yaml（作者配置，schema v2）
        ↓ parse / migrate
AuthorProjectConfig（稳定 ID、预设、可编辑）
        ↓ normalize
NormalizedProject（展开预设、引用已解析、无歧义）
        ↓ runtime context
RouteKitConfig / RenderInput（本地或 GitHub 的实际 URL）
        ↓ render / generate
INI + rule-provider YAML
```

- **作者配置**面向 Git diff、人工维护和 Web 编辑，允许复用预设并使用稳定 ID。
- **规范化模型**展开所有预设，解析引用，保证渲染器不再理解 UI 草稿、迁移状态或显示名称引用。
- **运行时上下文**提供本机 LAN URL、SubConverter 端点或 GitHub Raw URL，不污染可提交项目事实。
- **渲染输入**保持简单、完整、无缺失引用；渲染函数不再承担迁移和补救逻辑。

### 5.2 Schema v2

没有 `schemaVersion` 的现有文件视为 v1。新作者配置使用显式版本：

```yaml
schemaVersion: 2

project:
  template:
    output: Custom_Clash.ini
  defaults:
    proxyGroups:
      healthCheck:
        url: https://cp.cloudflare.com/generate_204
        interval: 300

memberSets:
  region-groups:
    members:
      - group: hk
      - group: us
      - group: jp
      - group: sg
  standard-proxy:
    members:
      - group: manual
      - group: auto
      - preset: region-groups
      - group: residential
      - group: low-rate

proxyGroups:
  - id: chat
    name: 💬 即时通讯
    type: select
    members:
      - preset: standard-proxy
    nodeFilters:
      - match: .*

routes:
  - id: telegram
    policy:
      group: chat
    source:
      type: geosite
      value: telegram
  - id: custom-direct
    policy:
      builtin: DIRECT
    source:
      type: rule-provider
      provider: custom-direct-domain

ruleProviders:
  - id: custom-direct-domain
    name: Custom Direct Domain
    output: Custom_Direct_Domain.yaml
    behavior: domain
    enabled: true
    sources:
      - id: local-direct
        name: Local Direct
        type: clash-list
        path: config/rules/Custom_Direct_Domain.list
```

字段约束：

- `id` 是稳定引用键，创建后不随显示名称变化。
- `name` 只承担展示和最终 INI 策略组名称；重命名不会修改其它作者配置引用。
- 策略组成员使用带类型的 `group`、`builtin` 或 `preset`，不再混用任意字符串。
- `memberSets` 只复用成员声明；规范化时递归展开并检查 preset 循环。
- `nodeFilters` 与策略组引用分开建模，至少保存 `match`，后续可增加订阅分组作用域；不允许把健康检查 URL 当作节点过滤器。
- `routes[].policy` 是判别联合：`{ group: <策略组 ID> }` 或 `{ builtin: DIRECT|REJECT }`。
- rule-provider 路由使用 `{ type: rule-provider, provider: <provider ID> }`，不再以输出文件名充当关系键。
- `vendorRepos`、rule-provider source 和其它可被 UI 独立编辑的实体也使用稳定 ID；显示名称不承担关系键职责。
- `enabled: true` 的 provider 必须有至少一个有效数据源；不完整导入不能进入可执行模型。
- provider 输出当前只允许 `.yaml`；`.mrs` 在拥有专用生成器前是阻断错误。

### 5.3 本地运行设置

本地设备差异不进入版本化项目作者配置。新增 ignored 本地设置文件：

```text
.clashroutekit/local.yaml
```

可包含：

```yaml
serve:
  host: 0.0.0.0
  port: 8787
  publicBaseUrl: http://192.168.1.10:8787
subconverterUrl: http://10.0.0.3:25500/sub
```

规则：

- 环境变量和显式 CLI 参数优先于本地设置文件。
- GitHub Actions 继续从 workflow 上下文生成远程 Raw Base URL。
- 订阅 URL 与 Token 仍只存在设备配置页面会话内存，不写入该文件。
- v1 的 `publishBaseUrl` 在迁移复核时移动到本地设置；迁移不会静默覆盖已有本地设置。

### 5.4 v1 到 v2 迁移

迁移遵循“只读分析 → 复核 → 原子写入”：

1. 解析 v1，并生成稳定、唯一的策略组和 provider ID。
2. 把 `ruleSets.policy`、策略组 `options` 和 provider 文件引用转换为 ID 引用。
3. 检测完全相同的成员列表，生成无损 `memberSets`，避免手工重复。
4. 将项目级默认值保留在作者配置，将本地 URL 移入本地设置候选变更。
5. 对空数据源 provider、`.mrs`、未知 GEOSITE、无效节点过滤器和缺失引用生成结构化迁移问题。
6. 未解决的导入项不自动生成可执行 provider；用户必须映射、禁用或放弃该项。
7. 应用前展示渲染语义对比；除明确列出的无效项外，v1 与 v2 的规范化 INI 应一致。
8. 通过所有阻断校验后才原子写入；失败保留原文件。

迁移不会在普通加载时自动写盘。CLI 和 Web 都必须显式要求用户确认。

### 5.5 统一诊断模型

所有诊断使用统一结构：

```ts
interface Diagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  path?: string;
  message: string;
  related?: string[];
}
```

校验分层：

- **Schema 校验**：字段类型、必填字段、枚举、URL、正整数和输出扩展名。
- **引用校验**：稳定 ID、成员 preset、provider、策略目标、重复 ID。
- **图校验**：策略组循环引用、preset 循环、不可达或空成员组。
- **语义校验**：FINAL 数量、select/health-check 字段边界、启用 provider 的数据源、规则与 provider behavior 一致性。
- **工作区校验**：本地文件、vendor repo、GEOSITE tag、Git 分支和 GitHub Actions 状态；由 Node 侧适配器执行。

行为边界：

- Web 草稿允许带 warning 保存，不允许带 error 写盘。
- 禁用的不完整 provider 可以作为草稿保留，但不会进入规范化渲染模型。
- CLI `check`、Web 保存、`generate` 和 GitHub 发布调用同一套纯配置诊断；CLI/Server 再追加工作区诊断。
- `generate` 和 GitHub 发布遇到 error 必须停止。

## 6. 信息架构

一级导航固定为四项：

| 页面 | 核心问题 | 主要任务 |
| --- | --- | --- |
| 项目 | 当前在编辑什么 | 导入、迁移、恢复进度、查看项目状态 |
| 规则库 | 有哪些规则可用 | 补全来源、维护 RuleSet/provider、管理低频仓库设置 |
| 路由 | 流量最终去哪里 | 编排规则顺序、编辑策略组、校验引用 |
| 输出 | 如何在本地或远程使用 | 生成设备配置、可选 GitHub 发布 |

页面之间是工作域关系，不是强制步骤。总体数据关系为：

```text
当前项目作者配置
        ↓ 规范化与校验
   ├─ 本地实时模板 ──────────────┐
   │                            ├─> 生成设备配置
   └─ GitHub 发布 -> 远程模板 ───┘
```

设备配置依赖的是“SubConverter 可访问的模板 URL”，并不依赖 GitHub 发布完成。

## 7. 页面设计

### 7.1 项目

项目页承担入口、迁移和总览，不再把导入隐藏在全局右上角。

#### 空项目状态

- 首屏主动作是“导入现有模板”。
- 支持模板库和粘贴 INI 两种来源。
- 次动作是“创建空白项目”；不让空白用户先进入规则库自行猜测下一步。

#### 已有项目状态

- 展示项目名称、Schema 版本、配置文件、未保存修改、最近校验结果和四个任务域的状态摘要。
- “继续编辑”回到最近访问的任务域。
- “重新导入”是项目页次级动作，不占用全局顶栏主位置。
- 发现 v1 时展示迁移说明和复核入口，不在后台自动改写。

#### 导入与迁移复核

导入采用“选择来源 → 解析结果 → 复核并应用”的短流程：

- 明确显示新增、覆盖、无法识别、缺少来源和不支持输出的数量。
- 用户选择“替换项目”或“合并到当前项目”。
- 展示稳定 ID、memberSets 和本地设置迁移摘要。
- 应用前展示结构化语义对比，不展示整份不可操作的 INI。
- 解析或迁移失败保留原始输入和当前项目，不产生部分写入。

### 7.2 规则库

规则库优先解决“路由引用的规则是否可执行”。

- 页面顶部首先展示“待补全来源”“失效来源”和“阻断生成”，提供直接处理入口。
- 主区域按业务分类浏览和搜索 RuleSet/provider，并显示启用状态、来源、条目数和被引用位置。
- 空来源 provider 必须处于禁用草稿状态；完成来源配置后才能启用。
- `.mrs` 等不支持格式显示为导入问题，不伪装成可生成 YAML provider。
- 编辑 RuleSet/provider 继续使用显式保存抽屉；取消或关闭不写入草稿。
- 上游仓库管理属于低频系统设置，放入“仓库设置”弹窗或抽屉，不与规则浏览并列占据主区域。
- 添加规则时优先复用已同步目录；只有缺少来源时才引导添加仓库。

### 7.3 路由

路由页只承担“规则顺序与去向”的编排，不再同时承担策略组详情页和 INI 查看器。

#### 主区域

- 主体是完整路由规则列表，支持排序、分段、启停、编辑和按目标策略组筛选。
- 每行显示规则来源、匹配类型、目标策略和必要的校验状态。
- UI 展示策略组名称，内部 mutation 始终使用稳定 ID。
- 移除路由页的完整 INI 预览；需要排障时提供显式的“查看生成结果”次级入口，而不是常驻面板。

#### 策略组入口

- 策略组以紧凑列表或选择器存在，点击后直接打开编辑抽屉。
- 删除独立的只读策略组预览，避免与抽屉重复。
- 抽屉集中展示并编辑：基本信息、memberSet、成员覆盖、节点筛选、健康检查和引用关系。
- “被 N 条路由规则使用”只显示计数和“在路由列表中筛选”动作，不在抽屉内再次复制完整命中规则列表。
- 内置策略和地区策略作为 typed member 与依赖关系的一部分出现，不再在详情下方重复生成一份“下游策略组 / 内置策略”清单。

#### 校验反馈

- 循环引用、缺失 ID、preset 循环和无可用成员在相关策略组和规则行内就近显示。
- 全局校验结果汇总在页面顶部，但不代替局部错误说明。
- 修正后自动更新校验摘要；实体内容仍遵循抽屉显式保存边界。

### 7.4 输出

原“发布”页改名为“输出”。设备配置与 GitHub 发布保留在同一路由中，但通过两个并列标签分离，避免形成错误的先后关系。

页面顶部共享显示：

- 当前项目 Schema 与校验状态。
- 本地实时模板 URL 与可访问状态。
- GitHub 远程模板是否可用及最后发布时间。

#### 标签一：设备配置

这是默认标签，也是本地闭环的主要出口。

1. 模板来源默认选择“本地实时模板”。
2. 若远程模板可用，可切换为“GitHub 远程模板”。
3. 添加一条或多条订阅，填写配置名称和 SubConverter 端点。
4. User-Agent、Emoji、UDP、规则集、节点包含/排除和自定义参数收进“高级转换选项”，默认折叠。
5. 生成后展示下载、复制链接和二维码三个动作。

交互约束：

- 订阅 URL 和 Token 只保存在当前组件会话内存，刷新即丢弃。
- SubConverter 端点来自本地设置，可在当前页面临时覆盖但不进入项目配置。
- 选择本地模板时，明确提示 SubConverter 必须能够访问本机 LAN 地址。
- 选择 GitHub 远程模板但尚未发布时，显示“远程模板尚不可用”，并可一键切换到“GitHub 发布”标签。
- 生成失败保留全部表单内容，并指出是模板不可达、SubConverter 不可达还是输入缺失。

#### 标签二：GitHub 发布

此标签明确标记“可选”，用于需要公网或跨设备稳定访问模板的场景。

发布流程为：

```text
复核变更 -> 统一校验 -> 提交并推送 main -> GitHub Actions 生成 publish 分支 -> 获得远程模板 URL
```

页面内容：

- GitHub origin、当前分支、未提交变更、Schema 版本和上一次发布状态。
- 默认展示结构化变更摘要；完整规范化 INI 差异按需展开，不常驻占据页面。
- 主按钮使用真实动作名称“提交并推送 main”，不再声称本地直接推送 `publish` 分支。
- 如果当前分支不是 `main`，停止并明确提示切换或合并策略，不静默推送其它分支。
- 推送后展示 GitHub Actions 的排队、运行、成功或失败状态。
- `publish` 分支和远程 Raw URL 仅在 Actions 成功后标记为最新。
- 发布工作流配置 concurrency，使同一目标只保留最新运行，避免旧产物覆盖新产物。

## 8. 目标工程结构

保留 pnpm workspace 与 `core / cli / web` 总体方向，但重新收紧依赖边界：

```text
packages/
  core/
    src/config/          schema、迁移、规范化、纯校验、mutation
    src/routing/         策略组图、引用分析、路由摘要
    src/render/          INI 与 provider 纯生成
  local-server/
    src/config/          原子读写与本地设置
    src/catalog/         vendor catalog 与搜索
    src/git/             状态、提交、推送与 workflow 查询
    src/http/            API 与静态托管适配

apps/
  cli/                   参数解析、命令组合和终端输出
  web/
    src/features/project/
    src/features/library/
    src/features/routing/
    src/features/output/
    src/shared/
```

依赖规则：

- Core 不依赖 Node 文件系统、HTTP、React 或 Git。
- `local-server` 依赖 Core，负责所有 Node IO 和工作区校验。
- CLI 依赖 Core 与 `local-server`，不再自行解析 YAML 或复制校验逻辑。
- Web 运行时代码只依赖 Core 类型与纯函数，并通过 API 调用 `local-server`。
- `apps/web/vite.config.ts` 使用 `@clash-route-kit/local-server` 的公开入口，不再相对导入 `apps/cli/src`。
- Web 不再构建期内联仓库 `config/routes.yaml`；加载失败时显示项目错误或空项目入口，而不是使用可能过期的打包快照。

### 8.1 Core 边界

Core 至少提供：

- `parseAuthorProjectConfig`
- `migrateAuthorProjectConfig`
- `normalizeProjectConfig`
- `validateAuthorProjectConfig`
- `validateNormalizedProject`
- 策略组/preset 依赖图与循环检测
- 使用稳定 ID 的原子 mutation
- INI 和 provider 纯生成

旧 `RouteKitProjectConfig` 在迁移期仅作为 v1 兼容类型；新页面和新 mutation 不继续扩展它。

### 8.2 Local Server 边界

当前 `serveApi.ts` 拆成配置仓库、规则文件、Catalog、Vendor、Git 和 HTTP 路由模块。HTTP handler 只负责：

1. 解析请求。
2. 调用 use case。
3. 把结构化结果转换为 HTTP 响应。

配置和本地设置使用临时文件加原子替换写入，避免中途失败留下半份 YAML。

### 8.3 Web 边界

- `App` 只负责应用启动、一级导航和跨页面项目快照。
- 每个 feature 拥有页面、组件、局部状态、请求适配和测试。
- 所有业务 mutation 调用 Core；组件不直接拼装跨实体更新。
- `TemplateSourceStatus` 统一计算本地/远程模板状态，避免设备配置与 GitHub 发布重复推导。

## 9. 错误处理与安全边界

- Schema：非法嵌套对象在读取时失败，不再依靠 TypeScript 强制断言掩盖运行时数据。
- 迁移：解析失败或存在未解决阻断项时不写盘；原 v1 文件保持不变。
- 导入：无法识别来源、`.mrs` 和空 provider 留在复核结果中，不自动变成启用的执行配置。
- 规则库：上游同步失败按仓库隔离，不让单个失败源拖垮整个目录。
- 路由：缺失引用、策略组循环和 preset 循环就近展示，禁止带错误生成或发布。
- 节点筛选：检查空值、明显 URL 误填和可检测的正则语法错误。
- 本地模板：不可访问时提供监听地址、服务状态和 URL 检查指引。
- 设备配置：不记录、不持久化、不写日志展示完整订阅 Token。
- GitHub 发布：每个失败步骤分别报告，不把 generate、commit、push 或 Actions 失败合并成模糊的“发布失败”。
- 所有有覆盖风险的操作都先复核，失败后保留用户输入和未提交草稿。

## 10. 响应式与可访问性

- 桌面端保持单一主任务区域，避免三栏同时滚动。
- 移动端将抽屉切换为近全屏；路由行和订阅行垂直排列，不要求横向滚动才能完成主操作。
- “设备配置 / GitHub 发布”保持同一页面标签，在窄屏下不拆成隐藏入口。
- 所有状态不仅依赖颜色，同时提供文字、图标和诊断路径。
- 键盘焦点在打开抽屉、切换标签、执行错误定位后移动到对应标题或错误项。

## 11. 测试策略

### 11.1 配置与 Core

- Schema v2 合法/非法夹具，覆盖每个判别联合和嵌套字段。
- 验证当前浅解析漏洞被关闭：数字策略组、缺字段 RuleSet、非法 vendorRepo 必须被拒绝。
- v1 → v2 迁移快照与重复成员列表提取。
- 显示名称重命名不改变稳定 ID 与其它引用。
- preset 展开、preset 循环、策略组循环、缺失引用和内置策略解析。
- 启用空 provider、`.mrs` 输出、behavior 不匹配和无效节点过滤器。
- v1 与 v2 在合法配置上的规范化 INI 等价测试。
- 当前已发现的“全球直连 URL 被当作 node filter”作为回归夹具。

### 11.2 CLI 与 Local Server

- CLI、Web 保存 API、generate 和发布使用同一纯配置诊断。
- 工作区校验覆盖本地规则文件、vendor、GEOSITE tag 与分支状态。
- 配置迁移和普通保存使用原子写入，失败不破坏原文件。
- 本地设置优先级：CLI 参数 > 环境变量 > `.clashroutekit/local.yaml` > 默认值。
- HTTP 路由模块分别测试，不再通过单个超大 handler 覆盖所有职责。
- `.yaml` 托管与生成器输出扩展名保持一致。

### 11.3 Web 组件

- 项目空状态、v1 迁移复核、替换/合并和失败不写入。
- 策略组只有一个详情入口；抽屉不复制命中规则列表，“筛选路由”能定位主列表。
- memberSet 展开结果可读，但编辑不会把展开后的完整列表重复写回每个组。
- 路由页不再常驻渲染 INI 预览。
- 设备配置默认使用本地模板，无 GitHub remote 时仍可生成。
- 高级转换选项默认折叠，展开后保留现有参数能力。
- 订阅数据不进入项目保存请求、本地设置或持久存储。
- GitHub 发布按钮与实际 action 序列一致，非 `main` 分支被阻止。
- Actions 未成功时不得把远程模板标记为最新。

### 11.4 浏览器验收

- 1200px 桌面与 360px 移动端走查四个一级页面。
- 从 v1 项目完成迁移、补全规则、编辑路由、本地生成设备配置，全程不配置 GitHub。
- 配置 GitHub 后完成复核、推送、等待 Actions，并使用远程模板生成设备配置。
- 验证刷新后订阅 Token 消失，本地设置和项目配置各自正确保留。
- 验证页面无控制台错误、无重复主滚动区、无被固定栏遮挡的主要操作。

## 12. 验收标准

1. 新项目进入后，导入是页面主动作而不是右上角工具按钮。
2. v1 项目不会被静默改写；用户可以看到完整迁移问题与语义摘要。
3. v2 使用稳定 ID；修改策略组显示名称不会改写几十处引用。
4. 重复策略组成员列表通过 `memberSets` 声明一次，规范化结果保持顺序和语义。
5. 非法嵌套配置不能通过 Core parser。
6. Web 保存、CLI check、generate 和 GitHub 发布共享相同的纯配置 error 结果。
7. 启用的空 provider、`.mrs` 输出、缺失引用和循环引用会阻断生成。
8. 本地 LAN URL 与 SubConverter 端点不再进入版本化项目配置。
9. 策略组成员、下游引用和健康检查只在策略组抽屉维护。
10. 命中规则只在路由主列表展示；策略组抽屉只提供计数和筛选入口。
11. 路由页和输出页都不常驻重复展示完整 INI。
12. 用户不配置 GitHub 也能从当前本地项目生成并下载设备配置。
13. 输出页默认打开“设备配置”，并列提供标记为可选的“GitHub 发布”。
14. GitHub 发布明确推送 `main`，`publish` 分支由 Actions 生成，并配置 workflow concurrency。
15. Web 不再直接导入 CLI 源码或构建期内联具体项目 `routes.yaml`。
16. 订阅 URL 与 Token 不写入项目文件、本地设置、Git、日志或持久化浏览器存储。
17. 桌面和移动端均能完成四个主任务，不依赖悬停或横向滚动。

## 13. 分阶段交付

### 阶段 A：当前配置健康门禁

- 将已发现的 URL node filter、空启用 provider、`.mrs` 和缺失 GEOSITE 纳入统一诊断。
- 在不改变 v1 文件结构的前提下，确保 check/generate/publish 对同一阻断项达成一致。

### 阶段 B：Schema v2 与 Core

- 实现 v2 parser、迁移、规范化、稳定 ID、memberSets 和统一诊断。
- 保持 v1 只读兼容与显式迁移。

### 阶段 C：Local Server 与 CLI 边界

- 引入 `packages/local-server`。
- 拆分配置、Catalog、Vendor、Git 和 HTTP；CLI 变为薄适配层。
- 增加 ignored 本地设置和原子配置仓库。

### 阶段 D：Web 工作流

- 落地“项目 / 规则库 / 路由 / 输出”。
- 接入迁移复核、稳定 ID mutation、memberSet 编辑和统一诊断。

### 阶段 E：输出与 GitHub 发布闭环

- 设备配置默认本地模板。
- GitHub 发布使用真实分支流向、Actions 状态和 concurrency。

每个阶段单独形成实施计划并通过测试门禁，避免一次性重写整个仓库。

## 14. 被否决的方案

- **只改 UI、不改配置模型**：会把名称引用、重复成员和校验漂移换一种界面继续暴露。
- **立即把 YAML 拆成多个项目文件**：在规范化和统一配置仓库建立前，会先增加跨文件事务、迁移和测试复杂度。
- **设备配置必须在 GitHub 发布之后进行**：错误地把一种托管方式变成业务前置条件，破坏本地闭环。
- **设备配置与 GitHub 发布拆成两个一级页面**：两者共享模板状态和输出语境，增加导航负担；同页双标签更合适。
- **继续使用单页纵向三段发布流程**：视觉顺序会暗示强制依赖，并让高级配置挤占发布复核空间。
- **导入继续放在右上角**：不符合首次使用顺序，也无法承载导入和 Schema 迁移复核。
- **同时保留策略组预览和编辑抽屉**：重复内容必然漂移，用户也难以判断哪个界面是事实来源。
- **把控制台改成严格向导**：规则、路由和输出需要反复往返，严格线性导航不符合实际工作方式。
- **改用数据库保存项目配置**：破坏 Git 可审阅、可复制和声明式维护的核心价值，当前没有对应收益。
