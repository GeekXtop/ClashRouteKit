# 项目默认值与策略组关系展示设计

日期：2026-08-07
状态：已在对话中确认，待书面审阅

## 1. 背景

当前路由页把 `customProxyGroups` 按 `type === "url-test"` 分成“服务组”和“地区组”，并在选中策略组后仅展示 `ruleSet.policy === group.name` 的直接入站规则。这混淆了两个独立维度：

- `type` 描述策略组的选择行为，例如 `select`、`url-test`、`fallback`、`load-balance`。
- `ruleSet.policy` 与 `group.options` 描述两种不同引用关系：规则指向策略组、策略组引用下游策略组。

标准 SubConverter INI 不包含“服务组/地区组”或 `role` 语义。地区节点池通常没有 RuleSet 直接指向它，但会被大量上游策略组引用，因此当前界面的“没有匹配规则”容易被误解为策略组未生效。

项目还在多处重复或硬编码以下值：

- 策略组测速 URL、测速间隔和 URLTest 容差。
- Rule Provider 类型 RuleSet 的刷新间隔。
- GEOIP RuleSet 的 `no-resolve`。
- SubConverter 紧凑语法中的测速超时槽位当前固定留空，数据模型也没有 `timeout`。

## 2. 目标

1. 删除“服务组/地区组”语义分类，不增加 `role` 或 UI 分类覆盖字段。
2. 左侧按 `customProxyGroups` 数组原始顺序展示全部策略组。
3. 选中策略组后，同时展示直接 RuleSet、上游策略组引用、成员与节点来源，避免纯下游组出现无信息空白页。
4. 增加项目级默认值，覆盖策略组健康检查和 RuleSet 常用默认值，同时保留单项覆盖。
5. 增加 `timeout` 的数据模型、INI 导入、INI 渲染和 UI 编辑支持。
6. 保持标准 SubConverter INI 可导入，不要求模板携带 ClashRouteKit 专用元数据。
7. 保持旧配置向后兼容；没有 `defaults` 的旧配置继续使用现有程序兜底。

## 3. 非目标

- 不引入 `role`、`categoryOverride` 或基于名称强制推断地区语义。
- 不自动修改 `nodeFilters: [".*"]`；该字段可能绕过下游组，但属于独立的运行策略调整。
- 不把 OpenClash 订阅更新间隔、`publishBaseUrl`、`subconverterUrl` 混入项目默认值。
- 不隐藏 `behavior`、`policy`、`type`、`options` 等具有核心业务语义的字段。
- 不在本次改动中增加策略组拖拽排序；仅保证显示与渲染遵循配置数组顺序。
- 不自动把导入模板中的重复字段提升为项目默认值，避免静默改写导入内容。

## 4. 关系模型

路由页需要显式区分三类关系：

```text
RuleSet --policy--> custom_proxy_group
custom_proxy_group --options--> downstream custom_proxy_group
custom_proxy_group --nodeFilters--> subscription proxy nodes
```

策略组可以同时拥有多种关系。例如一个组既可被 RuleSet 直接命中，也可被其他策略组引用。界面不再强制把每个组塞进唯一语义类别。

为每个策略组计算以下只读统计：

- `directRuleSets`：`ruleSet.policy === group.name`，保持全局规则顺序。
- `referencedByGroups`：`parent.options.includes(group.name)`，保持策略组数组顺序。
- `memberCount`：`options.length + nodeFilters.length`。

## 5. 配置模型

新增可选项目默认值：

```yaml
defaults:
  proxyGroups:
    healthCheck:
      url: https://cp.cloudflare.com/generate_204
      interval: 300
      timeout: 5
    urlTest:
      tolerance: 50
  ruleSets:
    ruleProviderInterval: 28800
    geoipNoResolve: true
```

对应 TypeScript 结构：

```ts
export interface ProxyGroupHealthCheckDefaults {
  url?: string;
  interval?: number;
  timeout?: number;
}

export interface ProxyGroupDefaults {
  healthCheck?: ProxyGroupHealthCheckDefaults;
  urlTest?: {
    tolerance?: number;
  };
}

export interface RuleSetDefaults {
  ruleProviderInterval?: number;
  geoipNoResolve?: boolean;
}

export interface RouteKitDefaults {
  proxyGroups?: ProxyGroupDefaults;
  ruleSets?: RuleSetDefaults;
}
```

`RouteKitConfig` 增加：

```ts
defaults?: RouteKitDefaults;
```

`CustomProxyGroup` 增加：

```ts
timeout?: number | null;
tolerance?: number | null;
```

字段单位：

- `interval`：秒。
- `timeout`：秒，遵循 SubConverter `interval[,timeout][,tolerance]` 紧凑语法。
- `tolerance`：毫秒。
- `ruleProviderInterval`：秒。

`undefined` 表示继承项目默认值；`null` 仅用于 `timeout` 和 `tolerance`，表示明确留空、不继承项目默认值。这样可在已有项目默认值的情况下忠实导入 `300,,50` 或不带 tolerance 的模板。

## 6. 默认值解析顺序

### 6.1 策略组健康检查

对于 `url-test`、`fallback`、`load-balance`：

```text
单组显式值
  → 项目 defaults.proxyGroups
  → 现有程序兜底
```

现有程序兜底保持：

- URL：`https://cp.cloudflare.com/generate_204`
- interval：`300`
- timeout：不显式输出
- URLTest tolerance：`50`

新建项目可显式写入推荐默认值 `timeout: 5`；旧项目没有该字段时保持原来的空 timeout 输出。

`defaults.proxyGroups.urlTest.tolerance` 只自动应用于 `type: url-test`。导入到其他健康检查类型的显式 tolerance 仍需保留和重新输出，但 UI 不把它作为推荐字段展示。

### 6.2 RuleSet

Rule Provider 类型：

```text
source.interval
  → defaults.ruleSets.ruleProviderInterval
  → 28800
```

GEOIP 类型：

```text
source.noResolve
  → defaults.ruleSets.geoipNoResolve
  → true
```

`geosite` 和 `final` 不使用这些默认值。

## 7. INI 导入与渲染

SubConverter 健康检查尾段格式：

```ini
interval[,timeout][,tolerance]
```

导入器需要解析三段：

- `300,5,50` → `interval: 300`、`timeout: 5`、`tolerance: 50`。
- `300,,50` → `interval: 300`、`timeout: null`、`tolerance: 50`。
- `300,5` → `interval: 300`、`timeout: 5`、`tolerance: null`。
- `300` → `interval: 300`、`timeout: null`、`tolerance: null`。

渲染器应按有效值动态生成最短合法尾段：

- 只有 interval：`300`
- interval + timeout：`300,5`
- interval + tolerance：`300,,50`
- 三者都有：`300,5,50`

ClashRouteKit 负责正确生成 SubConverter INI。最终 Clash/Mihomo 配置是否保留 timeout 取决于使用的 SubConverter 版本和目标导出器；UI 应把该字段标为“SubConverter 测速超时（秒）”，避免与 Mihomo YAML 中以毫秒表示的 timeout 混淆。

导入标准 INI 时：

- 保持 `custom_proxy_group` 原始顺序。
- 不生成 `role` 或分类字段。
- 保留每组显式 URL、interval、timeout、tolerance。
- 不自动提取项目默认值。

## 8. 路由页设计

### 8.1 左侧策略组列表

删除“服务组/地区组”两个 Collapse。左侧结构改为：

```text
全部规则                        63
🚀 手动选择       select       规则 1 · 引用 25
♻️ 自动选择       url-test     规则 0 · 引用 25
🤖 ChatGPT        select       规则 1 · 引用 0
🇭🇰 香港节点      url-test     规则 0 · 引用 25
...
```

要求：

- “全部规则”固定在顶部。
- 其余行严格按照 `customProxyGroups` 数组顺序。
- 显示组名、type 徽标、直接规则数和被引用数。
- 只保留一个“新建策略组”入口；创建时选择 type，不再提供“新建地区组”。
- 标题区域提供“项目默认值”齿轮入口。

### 8.2 右侧全部规则模式

选中“全部规则”时，继续显示完整的有序 RuleSet 流，顺序即最终规则优先级。

### 8.3 右侧策略组模式

选中具体策略组时，右侧显示：

1. 组摘要：名称、type、成员数、编辑入口。
2. 上游引用：列出 `referencedByGroups`。
3. 节点来源：options、nodeFilters，以及健康检查的有效值和继承来源。
4. 直接路由规则：列出 `directRuleSets`，保持全局顺序。

没有直接 RuleSet 时，文案改为：

```text
当前没有 RuleSet 直接指向此组。
该组仍可作为下游策略组被其他组引用。
```

保留“添加直接路由规则”入口，因为规范允许 RuleSet 直接指向任意策略组，但使用明确文案，避免误导为策略组必须添加规则才能工作。

## 9. 编辑界面

### 9.1 项目默认值 Drawer

统一 Drawer 分为两个区块：

```text
策略组健康检查
  测速 URL
  测速间隔（秒）
  测速超时（秒）
  URLTest 容差（毫秒）

规则默认值
  Rule Provider 刷新间隔（秒）
  GEOIP 默认 no-resolve（高级）
```

路由页齿轮默认定位到策略组区块；规则库中的上下文入口可定位到规则默认值区块。底层编辑同一份 `defaults`。

### 9.2 单组 Drawer

- 所有类型显示名称、type、options、nodeFilters。
- `url-test`、`fallback`、`load-balance` 显示 URL、interval、timeout。
- `url-test` 额外显示 tolerance。
- 每个支持继承的字段提供“继承项目默认值 / 自定义”状态。
- timeout 和 tolerance 额外支持“明确留空”，对应 `null`。
- 显示有效值及来源，例如“继承项目默认值：300 秒”。

### 9.3 RuleSet Drawer

- `rule-provider` 的 interval 支持“继承项目默认值 / 自定义”。
- `geoip` 的 noResolve 支持“继承 / 开启 / 关闭”三态，而不是仅二态 Switch。

## 10. 当前项目配置迁移

`config/routes.yaml` 增加已确认的 `defaults`：

```yaml
defaults:
  proxyGroups:
    healthCheck:
      url: https://cp.cloudflare.com/generate_204
      interval: 300
      timeout: 5
    urlTest:
      tolerance: 50
  ruleSets:
    ruleProviderInterval: 28800
    geoipNoResolve: true
```

迁移时仅移除与项目默认值完全相同的单项字段：

- 七个现有 URLTest 组的 URL、interval、tolerance。
- Rule Provider RuleSet 中显式的 `interval: 28800`。
- GEOIP RuleSet 中显式的 `noResolve: true`。

以下字段不修改：

- `nodeFilters`，包括重复的 `.*`。
- 组 type、options 和顺序。
- RuleSet policy、section、enabled 和顺序。
- Rule Provider behavior、file 和生成配方。

迁移后生成的健康检查尾段会从 `300,,50` 变为 `300,5,50`，这是显式启用统一 timeout 的预期变化。

## 11. 校验与错误处理

新增校验：

- URL 非空且可由 `URL` 解析；允许 HTTP/HTTPS。
- interval、timeout、ruleProviderInterval 必须为正整数。
- tolerance 必须为非负整数。
- `null` 只允许用于单组 timeout/tolerance 覆盖，不允许作为项目默认值。
- `select` 类型不消费健康检查默认值，但切换回健康检查类型后仍可继承默认值。

导入不认识的字段继续按现有 warning 机制处理，不因缺少 ClashRouteKit 专用元数据而报错。

## 12. 测试与验收标准

### Core

- `renderIni` 正确解析默认值优先级。
- timeout/tolerance 的 undefined、null、显式值组合均生成正确紧凑语法。
- `parseIniToConfig` 正确解析 `300`、`300,5`、`300,,50`、`300,5,50`。
- 老配置没有 `defaults` 时输出与改动前一致。
- Rule Provider interval 与 GEOIP noResolve 支持项目默认值和单项覆盖。

### Web

- 左侧不再出现服务组/地区组分类。
- 策略组顺序与配置数组完全一致。
- 行上展示 type、直接规则数、被引用数。
- 选中无直接规则的下游组时，显示引用关系和说明，不显示误导性的“没有匹配规则”。
- 项目默认值 Drawer 可编辑全部确认字段。
- 单组和 RuleSet 编辑器支持继承、自定义及需要的三态字段。

### 配置与回归

- 当前 `routes.yaml` 迁移后 `pnpm check` 通过。
- `pnpm test`、`pnpm typecheck`、`pnpm build` 通过。
- `pnpm generate` 成功，生成 INI 仅包含预期默认值展开变化。
- 不修改或删除用户工作区中的无关未提交内容。

## 13. 已确认决策

- 不再划分服务组和地区组。
- 不增加 `role` 或 `categoryOverride`。
- 左侧按全部 `custom_proxy_group` 原始顺序展示。
- 右侧以直接 RuleSet 为主，同时必须展示策略组引用关系和节点来源。
- 增加统一“项目默认值”Drawer。
- 项目默认值包含策略组健康检查、Rule Provider 刷新间隔和 GEOIP no-resolve。
- 增加 timeout，并保留每组单独覆盖。
