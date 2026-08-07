# 使用 YAML 维护中心路由声明配置

- 状态：accepted
- 日期：2026-06-24
- 决策人：user/Codex 会话

## 背景

ClashRouteKit 的核心配置源是 `config/routes.yaml`，它同时声明发布根地址、模板输出、上游规则仓库、策略组、有序路由规则和 rule-provider 生成源。该配置主要由人维护，也会被 Web 控制台和 CLI 往返读写。

用户在比较 Claude 使用 JSON、Codex 使用 TOML 的技术选型后，要求明确本项目继续使用 YAML 的理由。

## 决策

继续使用 YAML 作为 ClashRouteKit 的中心路由声明配置格式，尤其是 `config/routes.yaml`。路由数据仍优先放在 YAML 和 `config/rules/*.list` 中，应用代码只负责解析、校验、渲染和生成。

该选择不代表所有工具配置都应统一为 YAML。外部工具或目标生态如果原生使用 JSON、TOML 或其他格式，应在各自适配层遵循其原生格式；本项目的中心声明层保持 YAML。

## 备选方案

- JSON：语义严格、生态通用、适合机器交换，但不支持注释，人工维护大量有序规则和嵌套对象时噪音较高。
- TOML：适合浅层、手写的键值配置，但 `ruleSets`、`customProxyGroups`、`ruleProviders.sources` 这类数组对象嵌套会变得冗长，不如 YAML 直观。
- 拆分为多个专用配置文件：可以降低单文件长度，但会削弱当前“单一生效配置源”的维护模型，并增加 CLI、Web 控制台和测试的同步成本。

## 后果

- 正面影响：YAML 对有序列表、嵌套声明和人工编辑更友好，适合当前路由规则、策略组和 provider 源组合的形状。
- 正面影响：继续保持 `config/routes.yaml` 作为唯一中心配置源，降低 CLI、Web 控制台和发布流程之间的配置漂移。
- 成本：需要持续用 schema、类型和 `pnpm check` 限制 YAML 的隐式类型、缩进错误和引用错误。
- 成本：程序化往返序列化可能丢失注释，因此长期语义说明应写入 README、ADR 或字段文档，而不是依赖配置内注释。
- 后续工作：新增配置字段时继续同步类型、解析、Web 编辑器和测试；对包含正则、冒号、井号或易被隐式转换的值保持保守写法。

## 参考

- `config/routes.yaml`
- `packages/core/src/types.ts`
- `packages/core/src/configDocument.ts`
- `README.md`
