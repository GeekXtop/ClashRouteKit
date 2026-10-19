# Spec：修发布链（routes.yaml 入库）+ 写冲突防护（baseMtime / .list 原子写）

日期：2026-10-19
状态：设计已确认（用户 2026-10-19 会话拍板「routes.yaml 入库 main（推荐）」并批准设计四节），spec 待评审
前置调研：dsh 会话 session-69c76ce4 第三、四轮分析 + 本会话对全部关键论断的独立复核（20+ 条带行号论断零失实）

## 1. 背景与问题

### 1.1 P0：发布链已断四周（2026-09-18 起）

证据链（全部逐条复核属实）：

1. `.gitignore:14` 忽略 `config/routes.yaml`；`git ls-files config` 只有 `routes.yaml.example` 和三个 `.list`。1180 行的真实作者配置从未入库。
2. `.github/workflows/publish.yml:36-39` 兜底：`if [ ! -f config/routes.yaml ]; then cp config/routes.yaml.example config/routes.yaml`。在 CI 里该文件永远不存在，每次都复制 example。
3. `config/routes.yaml.example` 是 v1 格式（顶层 `publishBaseUrl` / `defaults` / `template` / `vendorRepos` / `customProxyGroups` / `ruleSets` / `ruleProviders`，无 `schemaVersion`）。
4. `297bedd`（2026-09-23）移除 v1 磁盘格式支持后，CI 的 Validate 步（publish.yml:56-61，含 `pnpm check`）对 example 必然报 `schema.version.unsupported` 并失败。
5. 结论：`publish` 分支冻结在 `f7a6fd7`（2026-09-18），OpenClash 设备拉到的产物已一个月未更新。
6. 连带发现：`packages/local-server/src/git/gitActions.ts:141` 的 `git-commit` 动作 stage 的是 `config/modules.yaml`（v1 文件名，磁盘上已不存在）+ `config/rules`——web「提交路由配置」按钮从未提交过 v2 配置。

### 1.2 P1：写冲突无防护

- GET `/api/project/config` 返回 `mtime`（`configRepository.ts:115`），但 PUT 请求体只有 `{ schemaVersion, yaml }`（`apps/web/src/v2/v2Project.ts` `saveV2Project`），无版本字段。
- web 为 600ms 防抖自动保存 + 整份 YAML 覆盖；双标签页后写静默覆盖前写，无任何提示；全仓 grep `undo|If-Match|409|baseMtime` 零命中。
- `packages/local-server/src/rules/ruleFiles.ts:74` 的 `.list` 写入是裸 `writeFile`，与 `routes.yaml` 的 `writeFileAtomic`（`configRepository.ts:154`）不一致。

### 1.3 入库决策依据（隐私面）

- `config/routes.yaml` 的 22 个 URL 全部公开：18× `https://cp.cloudflare.com/generate_204`（健康检查）+ 4× 公开规则仓库。
- 无订阅 URL、无私有代理端点；`publishBaseUrl` / `subconverterUrl` 在 v2 已移至 `.clashroutekit/local.yaml`（不入库）。
- 决定性事实：`publish` 分支已公开托管渲染后的 INI（含完全相同的规则映射），入库源 YAML 无新增暴露面。

## 2. 用户决策

- **routes.yaml 入库 main**（2026-10-19 拍板，备选「本地直推 publish」因丢 CI 门禁、依赖本机开机、改动面更大而否决）。
- **baseMtime 严格模式**：PUT 必带版本令牌，缺省即拒绝（web 与 server 同仓同发布，无兼容包袱）。
- **范围**：① 发布链修复 + ② 写冲突防护。命中模拟器、连接校验中间件（Origin/Host/token）、注释保真（parseDocument）、语义化 id、`.list` 版本令牌均为后续批次，不在本 spec。

## 3. 改动清单

### 3.1 发布链修复

- `.gitignore`：删除 `config/routes.yaml` 行；执行时 `git add config/routes.yaml` 入库。
- `gitActions.ts:141`：stage 清单 `config/modules.yaml, config/rules` → `config/routes.yaml, config/rules`。
- `config/routes.yaml.example` 重写为 **v2 空白起步模板**：顶层 `schemaVersion: 2`，最小自洽结构（`project` + 一个示例 `vendorRepos` 条目 + 一个 `ruleProvider` + 一个 `proxyGroup` + 两三条 `routes`），各段配中文注释说明职责。验收：`parseAuthorProjectConfig` 解析成功、`pnpm check` 通过、`pnpm generate` 出产物。CI 兜底逻辑（publish.yml:36-39）保留不动，从「每次触发的死代码」变为真正可用的新手路径。
- **freshness 门禁测试**：新增 `apps/cli/tests/configExamples.test.ts`，遍历仓库 `config/*.yaml.example`，断言每个都能被 `parseAuthorProjectConfig` 解析成功且 `schemaVersion === 2`。防「两个都能跑的东西」重新长出。
- README 第 3 步随入库决策更新：流程反转为「配置已入库，直接改 `config/routes.yaml`；`routes.yaml.example` 是从零起步的空白模板」。

### 3.2 写冲突防护（baseMtime）

契约（PUT `/api/project/config`）：

- 请求体：`{ schemaVersion: 2, yaml, baseMtime }`，`baseMtime` 为必带 number（ms，与 GET 返回的 `mtime` 同源）。
- 服务端写路径（`configRepository.ts`，与 GET 共用 `statMtime` 注入点保证读写口径一致）：写前 stat 当前文件比对 `baseMtime`——相等则写入；不等则 **409** `{ ok:false, conflict:true, code:"config.conflict", currentYaml, mtime }`，不落盘（勘误 2026-10-19：实现未带 `output`，以 `conflict:true` 标记冲突变体）；缺字段或非 number 则 **400**。
- 200 成功响应在现有返回体（已含 post-write `mtime`，`configRepository.ts:169`）上不变——客户端每次保存成功后更新本地 base，否则下一次自动保存会与自己冲突。

web 侧：

- `fetchProjectDocument` 的 `ProjectDocument` 增加 `mtime` 字段透传。
- `saveV2Project` 增加 `baseMtime` 参数并入请求体；响应处理增加显式 409 分支：服务端返回 `{ ok:false, conflict:true, code:"config.conflict", currentYaml, mtime }`，`saveV2Project` 将其解析为返回类型 `{ ok:false, conflict:true, currentYaml, mtime }`（区别于普通校验失败），供调用方分流。
- 409 → 弹「文件已被外部修改」对话框，两个动作：**覆盖**（以 409 返回的 `mtime` 为 base 重新保存当前编辑内容）/ **重载**（重新 GET，以服务端内容替换编辑态）。调用点为现有自动保存与抽屉保存路径，随 plan 细化。

`.list` 原子写（不加版本令牌）：

- `ruleFiles.ts:74` 默认 `writeText` 改用 `writeFileAtomic`（复用 `config/atomic.ts`）。

### 3.3 已知限制（写入代码注释）

文件系统 mtime 粒度较粗（部分 FS 秒级），极短间隔的连续外部写入可能漏检冲突。单用户本地工具场景可接受；如未来需要更强保证再升级为内容 hash 或 ETag。

### 3.4 文档小修（独立提交，评审时可划掉）

- `AGENTS.md:20` 与 README 三处 `pnpm serve:output` → `pnpm serve`（脚本已改名，文档未跟）。
- CLAUDE.md「三个包」→「四个包」、`serveHosting` 位置描述更新（已迁入 local-server）。

## 4. 测试与验证

新增回归测试（TDD，先红后绿）：

1. freshness：`config/*.yaml.example` 全部可解析且 `schemaVersion === 2`（防发布链回归的核心门禁）。
2. PUT 三路径：`baseMtime` 匹配 → 写入且响应含新 `mtime`；不匹配 → 409 + `currentYaml`，文件未变；缺字段/非 number → 400。
3. `git-commit` 动作 stage 清单断言（mock/注入 runCommand 层）。
4. `.list` 原子写：写入内容正确、失败时清理临时文件且不破坏原文件（与 `atomic.ts` 既有测试对齐）。
5. web 409 处理：mock 冲突响应，对话框出现且覆盖/重载行为正确。

验证分层：

- 每提交前：受影响测试 + `pnpm typecheck`（受影响文件 lint 若有配置）。
- 推送前：全量 `pnpm test`。
- 本地等价证据：`CLASH_ROUTE_KIT_CONFIG=config/routes.yaml.example pnpm check` 通过（复现 CI 兜底路径）。
- 发布层：推 main 后确认 GitHub Actions 绿、`publish` 分支出现新提交且产物反映真实配置。publish.yml 本身即全量门禁，本地省略的等价检查由 CI 承担。

## 5. 提交切分（主工作树，显式路径 add）

1. `fix(publish): routes.yaml 入库并修复发布链`——gitignore、入库、stage 清单、example v2、freshness 测试、README 第 3 步。
2. `feat: 配置写入加 baseMtime 冲突检测`——server 契约 + web 保存与 409 处理 + 测试。
3. `fix: .list 写入改原子替换`——ruleFiles + 测试。
4. `docs: 修正 serve 脚本名与包数描述`——AGENTS.md / README / CLAUDE.md。

## 6. 风险与边界

- **产物内容变化**：发布链修复后 CI 从 example 切换到真实配置，设备订阅内容会更新——这正是目的，但属可见变化，在提交说明中注明。
- **他人在途改动**：工作树现有 `package.json`、`pnpm-lock.yaml`、`.claude/settings.json` 的未提交改动，与本任务文件集零重叠；主工作树执行，提交一律显式路径，不用 `git add -A`。
- **workspace 理由**：改动面小（预计 ≤10 文件）、与在途文件集零重叠，留在主工作树；`workspace: 主工作树 + 理由` 已记入本节。
- 执行时段：2026-10-19 周一 08:55 判据通过，非高峰；机械执行派 opencode-free，spec/plan/审查/验收留主会话。
