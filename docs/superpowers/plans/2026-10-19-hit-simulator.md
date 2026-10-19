# 命中模拟器实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 输入域名 → 命中路由 → 策略链 → 可能终点（直连/拒绝/运行时选择），带逐条评估轨迹。

**Architecture:** core 纯函数评估器（材料预加载，零 IO）+ local-server `POST /api/route-simulate`（文件加载与 v2 校验）+ web RoutingPage 折叠面板。三层各自独立可测。

**Tech Stack:** TypeScript strict/NodeNext ESM、Vitest、antd 5、既有 /api 守卫与 authorizedFetch。

**Spec:** `docs/superpowers/specs/2026-10-19-hit-simulator-design.md`（评估语义 §2、链解析 §3、错误处理 §6）

## Global Constraints

- 匹配谓词大小写不敏感；后缀 = 相等或以 `.x` 结尾；精确 = 全等；关键词 = 子串包含。
- 评估按 `routes` 数组顺序，**命中即停**，trace 仍含全部行（命中行 + 之前的 miss/skip + 之后的 `not-evaluated`）。
- `policy.group` 与成员 `{group}` 引用组 **id**（渲染名仅作显示）；`{preset}` 引用 memberSets **id**。
- 模拟器不猜测运行时选择：select 与 url-test/fallback/load-balance 组一律归 `runtime-select:<name>`。
- IO 失败不致命：provider 输出缺失 / geosite tag 缺失 → 该路由 trace 行 `skipped` 并带 reason。
- core 不做任何文件 IO；文件读取只在 local-server。
- 遵守仓库风格：双空格、双引号、显式 `.js` 后缀、尾随逗号。

## Review Focus

1. **`+.x` 后缀边界**：`+.example.com` 必须命中 `example.com` 本身与 `a.example.com`，但**不得**命中 `notexample.com`。→ Task 1 谓词矩阵测试。
2. **命中即停 + trace 完整性**：命中行之后的路由必须标 `not-evaluated` 而非 `miss`。→ Task 1 顺序测试。
3. **策略链环**：组 A 含组 B、B 含 A（或 memberSet 互引）不得死循环。→ Task 1 防环测试。
4. **域名输入合法性**：空串、含空格、含 `/` 或 `:` → 400；纯关键词（无点）合法。→ Task 2 API 测试。
5. **yaml 覆盖优先于磁盘**：带 `yaml` 时必须评估提交文本而非磁盘 routes.yaml，且不落盘。→ Task 2 API 测试。

---

### Task 1: core 评估器 `simulateDomainRoute`

**Files:**
- Create: `packages/core/src/simulate.ts`
- Modify: `packages/core/src/index.ts`（追加导出）
- Test: `packages/core/tests/simulateDomainRoute.test.ts`

**Interfaces:**
- Consumes: `RouteV2` / `ProxyGroupV2` / `MemberSet` / `ProviderBehavior`（`packages/core/src/config/schemaV2/types.ts` 与 `../../types.js`）。
- Produces（Task 2/3 依赖，名字与形状照抄）:

```ts
export type TraceOutcome =
  | { kind: "hit" }
  | { kind: "miss" }
  | { kind: "skipped"; reason: string }
  | { kind: "not-evaluated" };

export interface RouteTraceRow {
  index: number;
  routeId: string;
  label: string;            // "GEOSITE,ai" | "provider:<id>" | "GEOIP,cn" | "FINAL"
  outcome: TraceOutcome;
}

export interface SimulateRouteResult {
  status: "matched" | "unmatched";
  domain: string;
  matched?: {
    index: number;
    routeId: string;
    label: string;
    policyLabel: string;    // 组显示名或 DIRECT/REJECT
    chain: Array<{ id: string; name: string; type: ProxyGroupV2["type"] }>;
    possibleTerminals: string[];  // "direct" | "reject" | "runtime-select:<name>"
  };
  trace: RouteTraceRow[];
}

export interface DomainRouteInput {
  domain: string;           // 调用方已 trim + lowercase
  routes: RouteV2[];
  proxyGroups: ProxyGroupV2[];
  memberSets: Record<string, MemberSet>;
  /** provider id → 载荷条目；null = 输出文件缺失 */
  providerEntries: Record<string, { behavior: ProviderBehavior; entries: string[] | null }>;
  /** geosite tag → 已转换规则串（DOMAIN,.../DOMAIN-SUFFIX,.../DOMAIN-KEYWORD,...）；null = tag 缺失 */
  geositeEntries: Record<string, string[] | null>;
}

export function simulateDomainRoute(input: DomainRouteInput): SimulateRouteResult;
export function parseDomainEntry(entry: string): { kind: "exact" | "suffix"; value: string } | null; // domain 行为：`+.x`/`x`
export function parseRuleEntry(rule: string): { kind: "exact" | "suffix" | "keyword"; value: string } | null; // 规则串
export function isPlausibleDomain(input: string): boolean;
```

- [ ] **Step 1: 写失败测试**（`packages/core/tests/simulateDomainRoute.test.ts`），用例组：
  1. `parseDomainEntry` / `parseRuleEntry`：`+.example.com`→suffix example.com；`example.com`→exact；`DOMAIN-SUFFIX,a.com`→suffix；`DOMAIN,b.com`→exact；`DOMAIN-KEYWORD,openai`→keyword；`IP-CIDR,1.2.3.0/24`→null；大小写混合→value 小写。
  2. `isPlausibleDomain`：`www.a.com` 真；`openai` 真；`""`/`a b.com`/`a/b`/`a:b`/`中文.cn` 假。
  3. 谓词矩阵（经 simulateDomainRoute）：suffix 命中本域与多级子域、不命中 `notexample.com`；exact 只全等；keyword 子串。
  4. 源类型：geosite entries 命中；domain behavior provider 命中；classical provider 中 `DOMAIN-SUFFIX` 命中而 `IP-CIDR` 行被忽略；ipcidr provider 整条 skipped("ip-only")；geoip 路由 skipped("仅 IP 规则")；provider entries=null → skipped；geosite tag=null → skipped。
  5. 顺序与即停：三条路由第 2 条命中 → trace = [miss, hit, not-evaluated]，status matched；无 final 且全 miss → status unmatched、trace 全 miss。
  6. 策略链：policy {builtin:"DIRECT"} → policyLabel "DIRECT"、terminals ["direct"]、chain []；{group:"g1"}（g1 select、含 {group:"g2"}、{builtin:"REJECT"}、{preset:"s1"}；g2 url-test；s1 成员 {builtin:"DIRECT"}）→ chain [g1,g2]、terminals ["runtime-select:g1","reject","direct"]；显示名取 `name` 而非 id。
  7. 防环：g1↔g2 互引 → 正常返回，terminals 含两个 runtime-select，不抛栈溢出。
- [ ] **Step 2: 跑红**：`pnpm --filter @clash-route-kit/core exec vitest run tests/simulateDomainRoute.test.ts` → FAIL（模块不存在）。
- [ ] **Step 3: 实现 `simulate.ts`**：按上面签名。算法要点——按 routes 顺序循环，每条先算 label 与 skip 判定，构造谓词数组；命中即 break；命中后剩余行全部 `not-evaluated`。链解析用显式栈 + visited Set（组 id 空间），members 递归收集 terminals。
- [ ] **Step 4: 跑绿**：同 Step 2 → PASS。
- [ ] **Step 5: `pnpm --filter @clash-route-kit/core exec tsc -p tsconfig.json --noEmit` 过；提交 `feat: core 域名路由命中评估器`。**

### Task 2: API 端点 `POST /api/route-simulate`

**Files:**
- Create: `packages/local-server/src/simulate/simulateMaterial.ts`（材料加载：provider 载荷 + geosite 文件转换）
- Modify: `packages/local-server/src/http/apiHandler.ts`（新端点分支，放 /api/actions 分支之前）
- Modify: `packages/local-server/src/index.ts`（导出 simulateMaterial 函数）
- Test: `packages/local-server/tests/routeSimulate.test.ts`

**Interfaces:**
- Consumes: Task 1 全部导出；`parseAuthorProjectConfig`（core）；`validateNormalizedProject`/`hasDiagnosticErrors`（core，同 checkConfig 用法）；`readRules` 语义（generateOutputs 的三源读取，可本地重实现小函数或直接 import core 的 `convertDomainListCommunity`）。
- Produces: HTTP `POST /api/route-simulate`，请求 `{domain: string, yaml?: string}`：
  - 200 `{ok:true, result: SimulateRouteResult}`；
  - 400 `{ok:false, output:"Invalid domain"}`；
  - 422 `{ok:false, output:..., diagnostics:[...]}`（磁盘或覆盖 yaml 未过 v2 校验，复用 PUT 的 errorPayload 结构）；
  - 守卫：走既有 connectionGuard（POST + token + 同源），无需额外处理。

- [ ] **Step 1: 写失败测试**（`routeSimulate.test.ts`，复用 apiHandler.test.ts 的 callHandler 风格与临时 root 挂具）：
  1. 磁盘 routes.yaml 含 geosite 路由 + final；vendor data 放 `ai` 文件含 `openai.com` → POST domain `www.openai.com` 命中 geosite 路由，policyLabel 正确。
  2. provider 路由：output/rules/X.yaml 写 `payload: ["+.a.com"]`（domain behavior）→ `x.a.com` 命中；无该输出文件 → 该行 skipped、reason 含 "generate"，落到后续路由。
  3. yaml 覆盖：请求带合法 yaml（与磁盘不同，多一条 DOMAIN-SUFFIX 直连路由）→ 按覆盖文本命中，且 writeText 未被调用（不落盘）。
  4. 非法域名：`""`、`a/b` → 400。
  5. 覆盖 yaml 校验失败 → 422 + diagnostics。
  6. 磁盘配置缺失 → 422。
- [ ] **Step 2: 跑红**：`pnpm --filter @clash-route-kit/local-server exec vitest run tests/routeSimulate.test.ts` → FAIL（404/无端点）。
- [ ] **Step 3: 实现**：
  - `simulateMaterial.ts`：`loadSimulateMaterials(options, config)` → `{providerEntries, geositeEntries}`。provider：按 `ruleProviders[].output` 读 `output/rules/<output>`，YAML.parse 取 `payload` 字符串数组（行为照 generateOutputs readClashProvider），失败/缺失 → null，behavior 取自 provider 定义。geosite：按 routes 里出现的去重 tag 集合，读 `vendor/domain-list-community/data/<tag>`，经 core `convertDomainListCommunity(text, {sourceUrl: pathToFileURL(file), fetchText: 读相对文件})` 转换，失败 → null。全部读取带 try/catch，不抛出。
  - apiHandler 分支：解析 body；`isPlausibleDomain` 不过 → 400；yaml 覆盖时 `parseAuthorProjectConfig(yaml)` + v2 校验（与 PUT 同链路，失败 422），否则 `readAuthorProjectFile`（失败 422）；组装 `DomainRouteInput` 调 `simulateDomainRoute`；200 返回。
- [ ] **Step 4: 跑绿**：同 Step 2 → PASS；`pnpm typecheck` 过。
- [ ] **Step 5: 提交 `feat: /api/route-simulate 命中模拟端点`。**

### Task 3: web 面板 + 全量验证

**Files:**
- Create: `apps/web/src/routeSimulator.ts`（API 调用封装）
- Create: `apps/web/src/components/HitSimulatorPanel.tsx`
- Modify: `apps/web/src/components/RoutingPage.tsx`（`rk-routing-top` 之后插入折叠面板）
- Test: `apps/web/tests/hitSimulatorPanel.test.tsx`

**Interfaces:**
- Consumes: `authorizedFetch`（`../src/apiClient.js`）；`SimulateRouteResult` 类型（core 导出，类型 Only import）。
- Produces: `simulateRouteHit(domain: string, yaml: string | undefined, fetcher: Fetcher): Promise<SimulateRouteResult>`；`<HitSimulatorPanel yaml fetcher />`。

- [ ] **Step 1: 写失败测试**（jsdom + antd，参照既有 web 组件测试风格）：
  1. 输入域名点「模拟」→ fetch 收到 POST body `{domain:"www.a.com"}`（yaml 未变时不带 yaml 键）；
  2. 响应 matched → 结果卡显示命中路由 label 与策略链；trace 折叠区可展开；
  3. 响应 unmatched → 显示「未命中且无 final 兜底」；400/422 → 显示 reason 文案。
- [ ] **Step 2: 跑红**：`pnpm exec vitest run apps/web/tests/hitSimulatorPanel.test.tsx`（仓库根跑）→ FAIL。
- [ ] **Step 3: 实现**：`routeSimulator.ts` POST /api/route-simulate（经 authorizedFetch）；面板用 antd `Input.Search` + 结果 Card + `Collapse`（trace 表格：index/label/outcome；skipped 显示 reason）。RoutingPage 在 `rk-routing-top` div 之后插入 `<Collapse ghost>` 单项面板（默认收起，不打扰双栏布局），传 `yaml={v2State?.document.yaml}` 与 `fetcher`。
- [ ] **Step 4: 跑绿**：`pnpm exec vitest run apps/web/tests/hitSimulatorPanel.test.tsx` → PASS。
- [ ] **Step 5: 全量验证**：`pnpm test`（根目录，≥634 例全绿）、`pnpm typecheck`、`pnpm build`；提交 `feat: 路由命中模拟面板`。

## 收尾

- 推送 main，`gh run list` 等 CI 绿（publish 分支自动刷新）。
- 台账 `.superpowers/sdd/2026-10-19-hit-simulator/progress.md` 记录批次与验证证据。
- 手工冒烟（可选）：`pnpm dev` 面板输入 `www.openai.com`。
