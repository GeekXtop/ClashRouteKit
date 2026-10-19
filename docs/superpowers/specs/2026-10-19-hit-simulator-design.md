# 命中模拟器设计（Route Hit Simulator）

- 日期：2026-10-19
- 状态：已确认（本会话预授权连续执行；方案路线属用户"全做"批准范围）
- 上游理解纪要：输入一个域名，回答"这条路由表会把它送往哪里"——命中第 N 条路由、落在哪个策略组、最终是什么方向。

## 1. 问题与目标

OpenClash/Clash Meta 运行时按顺序匹配规则，第一条命中即止。本项目作者在
`config/routes.yaml`（Schema v2）里编排路由，但"某域名会命中哪条"目前只能靠
人工推演：规则源分散在 vendor geosite 文件与 output/rules/*.yaml 载荷里，
策略组还有多层嵌套与预设成员集。

目标：给编辑器一个**命中模拟**入口——输入域名，输出：

1. 命中的路由（id、序号、源标签如 `GEOSITE,ai`）；
2. 策略链（policy → 组 → 成员集递归，含组类型）；
3. 可能终点分类（直连 / 拒绝 / 运行时选择的节点出口）；
4. 逐条规则的评估轨迹（命中 / 未中 / 跳过及原因），可当调试视图用。

非目标（YAGNI）：

- 不做 IP 输入（geoip/ipcidr 只出现为"跳过：仅 IP 规则"）；不做 IP 归属推断；
- 不模拟 Clash 进程内行为（DNS 解析、fake-ip、规则热更新）；
- 不做批量输入；不做历史记录；
- 不替代 `pnpm check` 的静态校验，模拟器只消费校验后的配置。

## 2. 评估语义（对齐 Clash Meta 域名匹配）

输入域名统一小写。四种路由源：

| 源 | 评估方式 | 域名输入下不适用时 |
| --- | --- | --- |
| `geosite` | 读 `vendor/domain-list-community/data/<tag>`（`include:` 递归去重、`@attr` 忽略、`full:`→精确、`keyword:`→子串、其余→后缀），同 core `convertDomainListCommunity` 的转换口径 | tag 缺失→轨迹记 `skipped: geosite tag 不在本地 vendor` |
| `rule-provider` | 读 `output/rules/<provider.output>` 载荷。behavior=domain：`+.x`→后缀、`x`→精确；behavior=classical：`DOMAIN-SUFFIX,x`/`DOMAIN,x`/`DOMAIN-KEYWORD,k` 参与域名匹配，其余类型忽略；behavior=ipcidr：整条跳过 | 文件缺失→轨迹记 `skipped: provider 输出缺失（先执行 generate）` |
| `geoip` | 仅 IP 规则 | 轨迹记 `skipped: 仅 IP 规则` |
| `final` | 兜底命中 | — |

匹配谓词（大小写不敏感）：后缀 = 查询域名等于 x 或以 `.x` 结尾；精确 = 全等；
关键词 = 包含子串。 classical 载荷里无法解析的行记入轨迹 `unknown`，不影响匹配。

**匹配即停**：按 routes 数组顺序评估，第一条命中后不再继续；轨迹仍完整给出
（命中行之前逐条 miss/skip + 命中行）。无 final 且全未命中 → `unmatched`。

## 3. 策略链解析

`policy = {builtin}` → 终点 `DIRECT`（直连）/`REJECT`（拒绝）。
`policy = {group: name}` → 按**组名**找 `proxyGroups`；链节点输出
`{name, type}`。成员递归（防环，visited 集合）：

- `{group}` → 嵌套组，继续；
- `{builtin}` → 终点标签；
- `{preset}` → `memberSets[id].members`，继续。

输出两类信息：

- `chain`: 策略组路径（第一个元素是 policy 组）；
- `possibleTerminals`: 递归收集的去重终点集合，元素为
  `direct` / `reject` / `runtime-select:<组名>`（select 组或任何无法静态收敛到
  builtin 的分支）。url-test / fallback / load-balance 组静态视为
  `runtime-select:<组名>`（自动选节点，仍属运行时决定）。

诚实原则：模拟器**不猜测**运行时选择，凡需要用户手选或自动测速决定的出口都归入
`runtime-select`。

## 4. 配置来源

默认读磁盘 `config/routes.yaml`（与 GET /api/project/config 同源）。请求体可带
`yaml` 覆盖：编辑器草稿未保存即可模拟（服务端仍走完整 v2 校验，校验失败 422
返回 diagnostics，不落盘）。覆盖文本经 Batch B 注释保真路径同规则处理，不影响
本功能（模拟只用解析结果）。

## 5. 组件与边界

- **core `packages/core/src/simulate.ts`（纯函数）**：
  `simulateDomainRoute(input)`。输入为预加载的评估材料（域名、路由表、
  每个来源的条目集合、策略组/成员集映射），不做任何 IO——全部文件读取由
  local-server 完成后传入。这样匹配谓词与链解析可脱离文件系统单测。
- **local-server `POST /api/route-simulate`**：请求
  `{domain, yaml?}`；加载配置（yaml 覆盖或磁盘）→ 逐来源收集评估材料
  （provider 载荷、geosite 文件内容，含 include 递归复用 core 转换）→ 调 core →
  返回 `{ok:true, result}`。材料加载失败不致命（对应轨迹 skip）。响应体含
  `trace[]`（每条路由一行）。走既有 /api 连接守卫（token + 同源）。
- **web `RoutingPage` 命中模拟面板**：输入框 + 模拟按钮 + 结果卡
  （命中路由、策略链、可能终点、可折叠轨迹）。调 `authorizedFetch` 传草稿
  yaml（若已改动）与域名。零草稿改动时可不带 yaml（省校验开销）。

## 6. 错误处理

- 域名非法（空、含空格/路径字符）→ 400 `Invalid domain`；
- yaml 覆盖但校验失败 → 422 + diagnostics（复用 PUT 的 errorPayload 结构）；
- 磁盘配置缺失/非法 → 422 + diagnostics（同上）；
- vendor 目录整体缺失 → 不报错：geosite 轨迹逐条 skip，`traceReason` 说明。

## 7. 测试策略

- core：匹配谓词矩阵（后缀/精确/关键词、大小写、`+.x` 边界、多级子域）、
  匹配即停与轨迹完整性、策略链递归与防环、runtime-select 归类。
- local-server：API 层 —— 磁盘配置模拟、yaml 覆盖模拟、provider 缺文件 skip、
  geosite tag 缺失 skip、非法域名 400、坏 yaml 422。
- web：RoutingPage 面板渲染与交互（输入→结果卡；trace 折叠）。

## 8. 交付切分

单计划三任务：① core 评估器（谓词矩阵 + 链解析，TDD）；② API 端点（材料加载
+ 端点，TDD）；③ web 面板 + 全量验证。实现按 ①→②→③ 串行提交。
