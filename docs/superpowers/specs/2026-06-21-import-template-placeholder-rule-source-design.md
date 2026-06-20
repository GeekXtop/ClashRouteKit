# 导入模板自动落地为本地规则源占位 + 校验分级 + classical/ipcidr 生成

日期：2026-06-21
分支：redesign/web-console
状态：设计已获用户口头批准，待 spec 评审

## 1. 背景与根因

### 现象
在 web 控制台「导入模板」后，配置仅前端可见，重启（重新读取磁盘 `config/routes.yaml`）后又恢复成导入前——即导入没有持久化。

### 根因（已验证）
导入只更新前端草稿，落盘完全依赖[App.tsx:86-99](apps/web/src/App.tsx#L86) 的防抖自动保存。自动保存有一道门槛：

```js
// App.tsx:87
if (!project.dirty || !canSaveProject(project).ok) return;
```

[`canSaveProject`](apps/web/src/projectController.ts#L189) 要求 [`validateDraftConfig`](apps/web/src/draftValidation.ts#L83) **零诊断**才放行。导入的模板一旦产生任何校验诊断，自动保存在此处静默 `return`——既不写盘也不报错，`message` 还停在 `importTemplate` 设置的「已覆盖导入模板」，用户以为成功。

### 触发条件（已用脚本 + 浏览器双重验证）
- 浏览器实测：粘贴一段合法最小 INI → `PUT /api/project/config` 200、`routes.yaml` 被改写。**自动保存机制本身正常。**
- 脚本扫描（`parseIniToConfig → replaceImportedConfig(当前 routes.yaml) → validateDraftConfig`）：
  - ACL4SSR 全 33 个模板：全部通过（可保存）。
  - **Aethersailor（用户自有仓库）11 个模板里 8 个被挡**：`Custom_Clash.ini / _Full / _Lite / _Mainland / Smart` 系列。
- 失败原因分布：23× 「RuleSet 引用了不存在的 provider 输出」，1× 「custom_proxy_group 名称重复」。

### 本质：数据模型缺一类「外部规则源落地」
模板里 `ruleset=策略,clash-<behavior>:<URL>,<interval>` 被 [`parseRulesetSource`](packages/core/src/import.ts#L9) 解析为 `rule-provider` 类型，`file = basename(URL)`。但：
- `ImportedConfig`（[types.ts:149](packages/core/src/types.ts#L149)）不含 `ruleProviders`，[`replaceImportedConfig`](apps/web/src/configMutations.ts#L410) 只替换 `ruleSets`/`customProxyGroups`，不碰 `ruleProviders`；
- 于是 ruleSet 的 `file` 引用悬空（当前 6 个 provider 的 output 命不中），校验报错。

模板引用的远程文件（如 `https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Direct_Classical_IP.yaml`）链接本身有效，且对应文件**已同步在本地 `vendor/Aethersailor/rule/` 下**（6 个引用 basename 全部命中）。问题在于导入没有把这些远程引用「落地」成 ClashRouteKit 的本地规则源。

注意：jsdelivr 路径 owner 是 `Aethersailor`，而 vendorRepo clone 的是 `github.com/GeekXtop/Custom_OpenClash_Rules.git`——**owner 不一致**，所以「按 URL 精确匹配 vendor 仓库」不可行。

## 2. 目标 / 非目标

### 目标
1. 导入模板时，把模板引用的远程 provider 落地为本地规则源占位，使导入结果在数据模型上自洽。
2. 校验分级：把「规则源待补全」从硬错误降级为警告，**允许带占位保存**。
3. 显著提醒：autosave 失败不再静默；规则源列表对待补全项加标签。
4. core 支持 classical / ipcidr 两种 behavior 的 provider 生成（本期实现，非延后）。

### 非目标
- 全局统一提醒系统（独立立项，本期用现有 `notify` + 局部标签顶上）。
- 导入时的自动 URL→vendor 映射（用户明确选择「一律置空手动指定」）。

## 3. 总体行为

导入模板时，除照旧覆盖 `ruleSets`（路由顺序）和 `customProxyGroups`（策略组）外，**新增规则源处理**：

- 扫描导入的每条 `rule-provider` 类型 ruleSet（`{file, behavior, interval}`）；
- 若当前 config 已有同名 `output` 的规则源 → **复用，不动**；
- 若没有 → **新建空占位规则源**：`output = file`，`behavior = 按前缀映射`，`sources = []`；
- 现有规则源**全部保留**（即便新模板未引用，如 AI / Developer / Crypto / Microsoft）。

结果：所有 ruleSet 的 provider 引用都命中规则源（「引用不存在 provider」错误消失）；空占位触发**待补全警告（非阻断）**→ 允许保存 + 显著提醒。

behavior 前缀映射：`clash-domain → domain`、`clash-classic → classical`、`clash-ipcidr → ipcidr`（已由 `parseRulesetSource` 解析进 `RuleProviderRuleSetSource.behavior`）。

## 4. 数据模型（`packages/core/src/types.ts`）

- `RuleProviderConfig.behavior`：`"domain"` → `ProviderBehavior`（`"domain" | "classical" | "ipcidr"`，该类型已存在于 [types.ts:1](packages/core/src/types.ts#L1)）。仅此一处放宽，其余字段不变。
- `DomainProviderInput` / `DomainProviderSummary` / `DomainProviderRule` 泛化为通用 provider 名称（或新增并列类型），以承载三种 behavior。命名在实现时统一，保持 `index.ts` re-export 完整。

## 5. 导入逻辑（`apps/web/src/configMutations.ts`）

- `replaceImportedConfig(config, imported)` 增加 `ruleProviders` 合并：
  1. 从 `imported.ruleSets` 中筛出 `source.type === "rule-provider"` 的项，得到所需 `{output: file, behavior}` 集合（按 `output` 去重）；
  2. 现有 `config.ruleProviders` 全量保留；
  3. 对所需 output 中、现有 `ruleProviders` 没有的，追加空占位 `{ name, output, behavior, sources: [] }`（`name` 用 `nextName` 基于 output 去后缀生成，避免重名）；
  4. 返回 `{ ...config, customProxyGroups: 替换, ruleSets: 替换, ruleProviders: 保留+补缺失 }`。
- `importTemplate`（[useProjectDraftActions.ts:208](apps/web/src/useProjectDraftActions.ts#L208)）流程不变，仍走 `replaceImportedConfig`；保存成功后的 message 改为反映待补全数量（见 §8）。

## 6. 校验分级（`draftValidation.ts` + `projectController.ts`）

`validateDraftConfig` 返回值由 `string[]` 改为 `{ errors: string[]; warnings: string[] }`。

**降级为 warning（允许保存）：**
- 规则源 `sources` 为空 →「规则源 X 待补全：尚未指定数据源」。

**保持 error（阻断保存）：**
- 名称/ID/output 重复（custom_proxy_group / RuleSet / Rule provider name / Rule provider output）；
- FINAL 兜底缺失或多于一条；
- RuleSet `policy` 为空或引用了不存在的 custom_proxy_group（非内置 DIRECT/REJECT）；
- RuleSet `id` / 名称为空；
- rule-provider 类型 RuleSet 的 `file` 为空，或引用了不存在的 provider output（导入后理应不再出现，但保留兜底）；
- 规则源 source 的 name 为空、path 为空/非法（绝对路径或 `..`）、basePath 非法、domain-list-community 的 entry 为空。

**`canSaveProject`（projectController.ts）：** 只看 `errors`；`errors` 为空即可保存（哪怕有 warnings）。`SaveReadiness` 增加可选 `warnings` 字段供 UI 显示。

**调用方同步更新：** 所有调用 `validateDraftConfig` / `canSaveProject` 的位置（App.tsx 自动保存判断、任何展示 diagnostics 的 UI）适配新返回结构。

## 7. core 生成扩展（`packages/core/src/rules.ts`）

按 behavior 分派三种生成，统一接口 `{ source, rules, exclude }` → YAML payload 字符串：

- **domain**（现有 `generateDomainProvider`）：保留 DOMAIN-SUFFIX(→`'+.x'`)/DOMAIN(→`'x'`)，其余丢弃。
- **classical**（新增 `generateClassicalProvider`）：**保留完整规则行原样**（DOMAIN / DOMAIN-SUFFIX / DOMAIN-KEYWORD / IP-CIDR / IP-CIDR6 / PROCESS-NAME / DST-PORT / SRC-IP-CIDR 等），payload 项为带引号的规则行（如 `- 'IP-CIDR,1.2.3.0/24,no-resolve'`）；去重 key = 规则行 trim 后小写，排序用 `localeCompare`，exclude 按规则行匹配。
- **ipcidr**（新增 `generateIpcidrProvider`）：**仅保留 IP-CIDR / IP-CIDR6**，payload 项为 CIDR 值（提取规则第二字段，如 `- '1.2.3.0/24'`）；其余类型丢弃；去重、排序、exclude。

`summarize*` 同步提供按 behavior 的统计（`inputRules` / `outputRules` / `excludedRules`，domain 专属的 `domainRules` 泛化为 `outputRules`）。新增函数在 [core/src/index.ts](packages/core/src/index.ts) 显式 re-export（含类型）。

## 8. CLI 适配（`apps/cli/src/program.ts` 等）

- generate 循环（[program.ts:373](apps/cli/src/program.ts#L373)）由硬编码 `generateDomainProvider` 改为**按 `provider.behavior` 分派**到对应生成函数；
- report/summary 字段（`domainRules` 等，见 [program.ts:391-401](apps/cli/src/program.ts#L391)）泛化为 `outputRules`；
- [index.ts:27](apps/cli/src/index.ts#L27)、[serveApi.ts:724-729](apps/cli/src/serveApi.ts#L724) 的 generate summary 日志同步适配；
- 空占位规则源（`sources: []`）在 generate 时产出空 payload（已验证不崩，[program.ts:338-379](apps/cli/src/program.ts#L338)），属预期。
- ⚠️ **构建注意（CLAUDE.md）**：serve/dev 经 `vite.config.ts` import `serveApi`/`serveHosting` → core 走 **dist**。新增 core 运行时导出后必须 `pnpm --filter @clash-route-kit/core build`，否则 `pnpm serve` / `pnpm dev` 启动报缺导出。

## 9. 提醒与 UI（本期：现有 `notify` + 列表标签）

- **autosave 不再静默**：当 `canSaveProject` 因 `errors` 不通过时，把首条 error 写进 `status="error"` + `message`（沿用现有展示），不再静默 `return`。
- **待补全显著提醒**：保存成功但存在 warnings 时，message 提示「已保存，N 个规则源待补全数据源」；规则源列表（规则库页）对 `sources` 为空的规则源加「待补全」标签（视觉标记）。
- 全局统一提醒系统（结构化诊断、warning 级别、跨页面一致）单独立项，不在本期。

## 10. 测试

- **core**（`packages/core/tests/`）：
  - `generateClassicalProvider`：保留 IP/混合规则行、去重、排序、exclude 生效；
  - `generateIpcidrProvider`：仅留 IP-CIDR/IP-CIDR6、丢弃 domain 规则、去重排序；
  - behavior 类型扩展通过 typecheck。
- **web**（`apps/web/tests/`）：
  - `configMutations.replaceImportedConfig`：现有同名 output 复用不重建、缺失建空占位、behavior 按前缀、额外现有规则源保留；
  - `draftValidation`：空 source → warning（非 error）、重名/缺 FINAL → error；
  - 端到端断言：导入真实 `Custom_Clash.ini` 后 `canSaveProject(...).ok === true`，且 warnings 数量 > 0（即原 8 个 BLOCKED 模板转 ALLOWED）。
- **cli**（`apps/cli/tests/`）：`generate` 对 classical / ipcidr behavior 的 provider，用 `mkdtemp` + sample 断言 payload 正确；空占位 provider 产出空 payload 不报错。

## 11. 受影响文件清单

- `packages/core/src/types.ts` — behavior 类型放宽、provider 输入/汇总类型泛化
- `packages/core/src/rules.ts` — 新增 classical / ipcidr 生成
- `packages/core/src/index.ts` — re-export 新函数/类型
- `apps/web/src/configMutations.ts` — replaceImportedConfig 规则源合并
- `apps/web/src/draftValidation.ts` — 分级返回 `{errors, warnings}`
- `apps/web/src/projectController.ts` — canSaveProject 只看 errors、SaveReadiness 带 warnings
- `apps/web/src/App.tsx` — autosave 失败不静默、message 反映 warnings
- `apps/web/src/useProjectDraftActions.ts` — importTemplate message 适配
- 规则库页相关组件（`LibrarySidebar` / `LibraryPage` 等）— 待补全标签
- `apps/cli/src/program.ts` / `index.ts` / `serveApi.ts` — generate 按 behavior 分派 + 日志适配

## 12. 后续（本期外）

- 全局统一提醒系统（需求 A）。
- 导入时可选的 URL→vendor 自动映射建议（当前一律置空）。

## 附录：根因验证记录

- 复现时导入把 `config/routes.yaml` 覆盖为 189 行；已从页面首个 `GET /api/project/config` 响应体完整还原（hash 与导入前逐字节一致，462 行），并清理临时文件与 5173/5174 残留进程。
- 扫描脚本与浏览器复现均为一次性手段，未留存于仓库。
