# ClashRouteKit Web 控制台重做 · 设计文档

日期：2026-06-19
状态：待用户审阅

## 1. 背景与目标

现有 Web 控制台（React 19 + 50KB 手写 CSS，五个页面：规则目录 / 规则源 / 策略组 / 路由 / 发布）存在系统性问题：四页风格不统一、路由页三栏高度错乱、规则目录树有 bug、订阅装配与 OpenClash 实际工作流不符、导入动线混乱、上游仓库不可编辑、报错撑乱版面。

本次目标：**围绕用户真正声明的两样东西——有序 `ruleSets`（路由）与 `customProxyGroups`（策略组）——重做整个控制台**，把"浏览/规则源/发布"等支撑性功能收敛到清晰的信息架构里，统一风格，修掉积累的 bug。

数据模型保持不变（`config/routes.yaml` → `RouteKitProjectConfig` 仍是唯一配置源；core 纯函数不动其语义）。本次只重做 `apps/web` 的界面与交互，并配套调整 `apps/cli` 的 serve API。

## 2. 范围

**本次做：**
- 信息架构 5 页 → 3 页（路由 / 规则库 / 发布）。
- 引入 AntD 作为组件库，替换手写 CSS 的主体。
- 三页全部重做（含添加规则来源选择器、上游仓库管理弹窗、订阅/发布流程）。
- 修复：category 树展开 bug、`Invalid catalog entries`、git 报错错位（改全局通知）、上游仓库不可编辑、换 GeekXtop fork。
- 合并「导入模板」与「导入 INI」为单一导入流程。

**暂不做（deferred）：**
- 「模板设置」编辑器（编辑 `template.output` 文件名、`clashRuleBase`）。当前单模板、output 名仅体现在 URL，clash_rule_base 不展示（用户 DNS/base 交由 OpenClash 处理）。
- 多模板（`template` 当前是单数，不做多模板切换/下拉）。
- 拖拽库（dnd-kit 等）——用改良原生拖拽，库作为后备。

## 3. 技术选型

| 项 | 决策 | 理由 |
|---|---|---|
| 组件库 | **AntD v5**（React 19，`ConfigProvider` 配 `zh_CN` + 主题 token；全局 `message/notification` 用 `<App>` 包裹） | 一次拿到 Tree / Modal / Drawer / notification / Tabs / Form / Table，直接解决树 bug、弹窗、全局提示、风格统一 |
| 拖拽重排 | **改良原生 HTML5 拖拽**（加插入指示线 + 拖拽手柄）+ 键盘/按钮重排；**不引入** dnd-kit | 单用户本地桌面工具，触屏非痛点；重排低频；保持精简依赖。若长列表跨分节实现过糟，再换 dnd-kit（后备） |
| 二维码 | 保留 `qrcode` 依赖 | config.yaml 跨设备导入需要二维码 |
| 风格 | 全站统一「两栏纪律」/单栏流程；不再每页各写宽度/搜索/排序 | 修第 7 点 |

## 4. 信息架构：5 页 → 3 页

| 新页面 | 合并自 | 职责 |
|---|---|---|
| **路由** | 旧「路由」+「策略组」 | 编辑有序 `ruleSets` 与 `customProxyGroups`（二者强耦合，合并） |
| **规则库** | 旧「规则目录」+「规则源」 | 管理"你拥有/配置的来源"：上游仓库（同步/编辑）、本地 .list、规则源（自定义合并） |
| **发布** | 旧「发布」 | 单栏流程：模板 → 发布模板（Git）→ 装配 config.yaml |

浏览/搜索上游 GEOSITE 等「发现」动作，从独立页收敛进路由页「添加规则」的来源选择器（在要用它的地方搜）。

## 5. 页面一：路由

### 5.1 布局
- **无全局顶栏**。两栏主区 + 底部可收起预览抽屉。
- **左栏（窄）= 策略组导航**：列出策略组（按服务组/地区组分组）+「全部规则」。栏头有「＋」新建策略组。
- **中栏（主）= 路由有序流**：按 `section`（`;注释`）分节渲染 `ruleSets`，顺序即优先级，可拖动重排。栏头有「＋ 添加规则」（随选中组预填目标）+ 一个可选小过滤框。
- **右侧 Drawer**：编辑策略组（非常驻，点 ✎ 触发）。
- **底部**：可收起的实时 INI 预览抽屉。

### 5.2 交互
- **规则＝行内编辑**。一行：`⠿拖动 | 来源文本 ✎ | 策略组下拉 | 启用开关 | ✕`。
  - 高频字段行内可编：归属策略组（下拉）、启用（开关）、顺序（拖动）。
  - 分节：把行拖到另一分节标题下即改 `section`（行内不放 section 字段）。
  - 来源：添加时由选择器定好，行内以文本显示；点 ✎ 开小 popover 改（低频）。
  - `FINAL` 行不可禁用/删除。
- **策略组**：
  - 点组**名** = 把中栏筛成"命中此组的入站规则"（轻动作）。
  - 点组行的 **✎ 编辑**（hover 显示）= 弹右侧 Drawer 编辑（重动作）。二者独立、可并存。
  - Drawer 内容：名称、类型（select/url-test/…）、成员（`[]其它组`/DIRECT/REJECT，可重排）、节点过滤正则、url-test 的测速 URL/间隔/容差、"命中此组的规则"列表（可跳转）。
- 重排：改良原生拖拽（插入指示线）+ 键盘/按钮兜底。

### 5.3 添加规则 · 来源选择器（Modal）
点「＋ 添加规则」弹出较大 Modal：
- 顶部：搜索 + 类型筛选（GEOSITE/GEOIP/列表/规则源）+ 仓库筛选。
- 左：**双形态**——
  - 浏览态（搜索框空）= **树**：domain-list-community 按分类展开。**箭头是否出现由后端 `hasChildren`（该条目是否含 `include:`）决定**，不再"点开才猜、猜空再翻 geo"（修 category-acg bug）。点箭头展开/收起；点名字选中并预览；分类节点本身也可整选。
  - 搜索态（有输入）= **跨仓库扁平列表**（虚拟滚动，扛 1500+）。GEOIP/.list/规则源等非层级来源亦走列表。
- 右：**全高域名预览**（解析 includes 后的真实域名）。
- 底：归属策略组（预填当前选中组）+ 分节 + 「添加」。

## 6. 页面二：规则库（管理台式）

### 6.1 布局（两栏）
- **左栏 = 来源管理**，三组：
  - **上游仓库**：每行 名称 + 同步状态（同步时间 / `钉 main` / 未同步）+ ⟳ 同步 + ⚙ 编辑（→Modal）。组尾「＋ 添加上游仓库」（→Modal）。底部「全部同步」（从旧发布页迁来）。
  - **本地 .list**：文件列表 + 「＋ 新建」，点击 → 右栏编辑。
  - **规则源**：自定义合并 YAML 配方列表 + 「＋ 新建」，点击 → 右栏配方编辑。
- **右栏 = 全高编辑**：选 .list → 文本编辑器（保存）；选规则源 → 配方编辑（来源 + 排除/移除 + 输出 + 预览）；选仓库 → 摘要 + 同步/编辑/移除。

### 6.2 上游仓库 增/改弹窗（Modal）
字段：
- 名称
- Git URL（Custom_OpenClash_Rules 默认值改为 `https://github.com/GeekXtop/Custom_OpenClash_Rules.git`）
- 分支（可空＝默认分支；填 `main` 并「☑ 钉住」＝钉 main。ACL4SSR、Custom_OpenClash_Rules 钉 main）
- 数据类型（domain-list / list-dir / provider-yaml）
- 数据目录（**仓库内相对路径**，如 `data` / `Clash` / `rule`）

**不暴露本地 vendor 路径**：自动派生为 `vendor/<name>`，UI 不显示、不让填（修第 6 点）。

### 6.3 后端配套
- `vendorRepos` 成为**唯一可编辑来源**；移除 serveApi 里硬编码的 `CATALOG_ORIGINS` 兜底（或仅用于首次种子）。
- 新增 API：编辑/删除上游仓库（当前只有 `/api/vendor/add`）。
- `/api/catalog/entries` 返回每条目的 `hasChildren`，供树正确渲染箭头。
- catalog 解析按源**独立**进行：某源失败降级为"该源不可用"提示，不再整页抛 `Invalid catalog entries`（沿用近期 graceful 改动）。
- 数据目录：UI 收/给"仓库内相对路径"，后端拼成 `vendor/<name>/<reldir>`（兼容现有 `catalog.dir` 全路径，做规范化）。

## 7. 页面三：发布（单栏 · 上下平铺）

按依赖顺序竖向排列（模板是 config.yaml 的输入，故在最上）：

**顶部 · 模板（共享前提）**
- 单模板，无下拉。显示 output 名（即模板 URL 末段）。
- 校验徽标（自动）：`✓ 引用完整` / `⚠ N 处缺失策略组`（旧"校验引用"按钮降级为自动状态）。
- `enableRuleGenerator` / `overwriteOriginalRules` 锁定 true、不展示控件（仍渲入 INI）。`clashRuleBase` 暂不展示。

**① 发布模板（Git）— 给 OpenClash / subconverter 拉取**
- 模板 URL 两种，各带复制：
  - 本机 LAN（实时）：`http://<LAN-IP>:8787/templates/<output>`（= publishBaseUrl，须 LAN IP，127.0.0.1 路由器访问不到）。
  - 发布 raw（需推送）：`…/<repo>/publish/templates/<output>`。
- **Git 发布一条龙**：构建产物（写 `output/`）→ 提交 → 推送 publish 分支；展示变更文件 + diff + git 状态。
- **不下载 .ini**（subconverter/OpenClash 只认 URL）。
- OpenClash「编辑订阅」对照填写提示：在线订阅转换✓ / 订阅转换服务地址 / 模板=自定义模板 → 自定义模板 URL=上面的模板 URL / UA=clash.meta / Use Rule Provider（**给一句话条件说明，不默认勾**）。

**② 装配 config.yaml — 直接导入设备**
- **原生多条订阅**列表：每行 名称 + URL + 启用 + 删除 +「＋ 添加订阅」（内部组装 subconverter 的 `url=` 参数，用户不碰 `provider:`/`|`）。
- subconverter 端点（默认 `subconverterUrl`，兜底 `http://10.0.0.3:25500/sub`）。
- 「生成 config.yaml」→ 浏览器**下载** + **二维码**（`clash://install-config?url=…` 供其它设备扫码导入）。
- **不预览 yaml**。
- 订阅链接含 token：**持久化到 gitignored 本地文件 `config/subscriptions.local.yaml`**（经专用本地 API 读写，survive 重载、跨浏览器可用），**绝不写入 `routes.yaml` / 不进 git / 不发布**。`.gitignore` 增加该文件。

### 关于 Use Rule Provider（说明性，非本项目控件）
OpenClash 该开关开启时给 subconverter 加 `&expand=false&classic=true`：
- 关（默认）：规则内联展开进 config 的 `rules:`，配置大但自包含。
- 开：生成 `rule-providers:` + `RULE-SET`，配置小、可热更，但要求设备 Clash 支持 provider 且能访问 publishBaseUrl。ClashRouteKit 的 `output/rules/*.yaml` 正是给"开"用的。

## 8. 导入流程（合并「导入模板」+「导入 INI」）

二者本质都是"把 INI 解析成 `ruleSets`+`customProxyGroups`"，重复，合并为单一「导入」：
- **两个来源**：① 从模板库选 `.ini`（读 ini-template 类仓库里的 `.ini`，修第 5 点"数据源模板没读到仓库信息"）；② 粘贴 INI 文本。
- **统一**：同一解析器 → 预览解析出的规则/策略组 → 选「替换」或「合并进现有配置」。
- **入口**：去掉右上角浮按钮。
  - 空配置时：路由页大号空状态 CTA「从模板导入开始 / 手动新建」（第 5 点"导入先行"）。
  - 已有配置时：入口降级到 app 头部「导入 / 导出 配置」菜单。

## 9. 全局

- **通知**：所有异步错误（同步失败、解析失败、git 报错如"Repository not found"）走 AntD 全局 `notification`（右上角 toast），**不再用内联红字撑乱版面**（修第 2 点）。仓库不可达提示换源。
- **校验**：策略组引用校验自动运行，结果以状态徽标呈现（发布页 + 必要处）。
- **风格统一**：AntD 组件 + 一致的两栏纪律 / 单栏流程；统一左栏宽度、面板头、间距；移除散落的搜索框/排序按钮（修第 7 点）。

## 10. 9 点反馈对照

| # | 反馈 | 处理 |
|---|---|---|
| 1 | `Invalid catalog entries` | 后端按源独立解析、失败降级提示，不整页抛错 |
| 2 | git 报错错位 + 换备份链接 | 全局 notification；Custom_OpenClash_Rules 换 GeekXtop fork |
| 3 | category-acg 树点了变 geo + 更好展示 | 树由 `hasChildren` 决定箭头（不再猜后翻）；浏览=树/搜索=列表双形态 |
| 4 | 全部域名详情太矮、去冗余 | 来源选择器右侧全高域名预览，去掉"只读"等冗余 |
| 5 | 导入模板动线 + 没读到仓库信息 | 合并为单一导入；空状态前置 CTA；模板来源读 ini-template 仓库 |
| 6 | 钉 main / 可编辑 / 弹窗 / 隐藏 vendor | 仓库 Modal 编辑、分支钉住、自动派生 vendor 路径不展示 |
| 7 | 风格不统一 | AntD + 两栏纪律/单栏流程，统一宽度与控件 |
| 8 | 导入 INI 重复 / 添加规则位置 / 路由失败 / 合并 / 预览去向 | 合并导入；添加规则归中栏头预填；路由+策略组合并为两栏行内+Drawer；预览入发布页（路由留抽屉） |
| 9 | 规则源想复杂了 | 规则源降级并入「规则库」管理台；浏览发现移入来源选择器 |

## 11. 数据与后端改动清单

- `apps/web`：三页全部重写为 AntD；新增来源选择器、仓库 Modal、导入流程、发布单栏流程、多订阅本地存储；`subscriptions.ts` 重构支持原生多订阅（替换 textarea 解析）；移除旧 `SubscribeAssembler` 的机场 textarea 形态。
- `apps/cli` serve API：上游仓库 增/改/删 API；catalog entries 增 `hasChildren`；catalog 按源容错；（config.yaml 下载走浏览器直连 subconverter URL，QR 编码 `clash://` 深链，无需新服务端转换端点）。
- `config/routes.yaml`：`Aethersailor` 项 url 改 GeekXtop fork（name 可保留或更名）。
- 依赖：新增 `antd`；保留 `qrcode`、`lucide-react`（或被 AntD 图标替代，二选一，实现时定）。

## 12. 测试

- core 纯函数语义不变，现有 `packages/core/tests` 应继续通过。
- cli serve API 新增端点的集成测试（mkdtemp + sample config，沿用现有模式）：仓库增改删、catalog `hasChildren`、按源容错。
- web 组件测试（vitest + jsdom + @testing-library）：来源选择器树/列表切换与 `hasChildren` 渲染、路由行内编辑、组 Drawer 触发、发布页多订阅装配 URL 组装、导入解析。
- 回归：`pnpm typecheck`、`pnpm test`、`pnpm check`。
