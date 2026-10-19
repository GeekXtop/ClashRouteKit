# Spec：连接校验中间件（Host 白名单 + Origin 校验 + 启动期 token）

日期：2026-10-19
状态：设计已确认（用户 2026-10-19 会话拍板「token 门禁全部 /api」并批准设计四节），spec 待评审
前置调研：dsh 会话 session-69c76ce4 第二轮 + 本会话对服务链（localServer / hostingHandler / apiHandler / serve.ts / vite.config.ts）的实读

## 1. 背景与问题（已逐条复核）

本仓库 local-server 是绑定 `127.0.0.1:8787` 的本地编辑服务，但**没有任何连接层校验**：

1. 全仓（packages/local-server、apps/cli）grep `Origin|Host 校验|sec-fetch|authorization` 零命中——「绑定 127.0.0.1」只回答「谁连得上」，没回答「谁能让它做事」。
2. `/api/actions/*` 只要求 POST、不读 body、不校验 content-type（apiHandler.ts:398-423）：任意网页一个 `<form method="POST" action="http://127.0.0.1:8787/api/actions/git-push">`（简单请求、无预检）即可推送本机仓库。
3. `/api/git/remote`、`/api/git/publish-status` 不校验 HTTP 方法，任意方法都执行。
4. 无 Host 校验 → DNS rebinding 后，攻击页可从 `127.0.0.1` 读到 GET `/api/project/config` 返回的 routes.yaml 全文。
5. `serve.host`（local.yaml）允许改绑定地址，但无 wildcard 拒绝——绑定 `0.0.0.0` 会把端口暴露到所有接口且无任何鉴权。

## 2. 用户决策

- **token 门禁全部 `/api/*`**（GET 也查；2026-10-19 拍板，备选「仅写路径」因读接口暴露全文被否）。
- Host 白名单（全路径）与 Origin/Sec-Fetch-Site 校验（/api 写路径）两条都做——三层冗余是刻意的，任一层失效仍有兜底。
- `/templates`、`/rules` 不做 token 门禁：SubConverter 是无 token 的外部拉取方，这两段是只读的生成产物（内容本就公开发布在 publish 分支），只受 Host 白名单约束。

## 3. 改动清单

### 3.1 connectionGuard（新中间件）

新文件 `packages/local-server/src/http/connectionGuard.ts`：

- `createConnectionGuard(options)` 返回 `(req, res, next) => void`；`createLocalServerContext` 返回值增加 `connectionGuard` 与 `token`（`crypto.randomBytes(32).toString("hex")`，每次服务启动重新生成）。`LocalServerContextOptions` 增加可选 `serveHost?: string`（serve.ts 传实际绑定地址；vite dev 不传，白名单仅环回——vite 默认绑 localhost，LAN 字面量只影响 serve 路径）。
- **Host 校验（所有路径）**：`Host` 头剥端口（含 IPv6 方括号形式）后必须 ∈ 白名单 = {`127.0.0.1`, `localhost`, `[::1]`, `::1`} ∪ {resolved `serve.host` 字面量} ∪ {publicBaseUrl 解析出的 host}。不在白名单 → 403 JSON `{ok:false, output:"Forbidden"}`；缺 Host 头 → 400。守卫构造时忽略 wildcard（`0.0.0.0`/`::`/unspecified 永不入白名单）。
- **Origin / Sec-Fetch-Site（仅 `/api/*` 且非 GET/HEAD）**：带 `Origin` 头 → 解析出的 host 必须在白名单；否则若带 `Sec-Fetch-Site` → 必须 `same-origin` 或 `none`；两者都缺（非浏览器客户端）→ 直接收 token 关。
- **token 校验（仅 `/api/*`，全方法）**：`x-clash-route-kit-token` 必须与 context token 精确匹配，否则 403 JSON，文案 `"Forbidden: missing or stale token — refresh the page"`（旧 bundle 窗口的用户提示）；Host/Origin 失配 403 文案为 `"Forbidden"`。
- 挂载顺序：两宿主都**最先**挂 guard（先于 hosting）。

### 3.2 启动期 wildcard 拒绝

`apps/cli/src/serve.ts`：新增启动校验——`serve.host` 解析为 unspecified 地址（`0.0.0.0`、`::`、hostname `*`）时抛错退出，错误信息指引用户改用具体网卡字面量。校验逻辑抽为可单测的纯函数（放 local-server，serve.ts 引用）。

### 3.3 token 注入（两宿主，与守卫同一提交）

- **serve 路径**：`hostingHandler` 服务 `.html`（静态命中与 SPA fallback 两处）时，在首个 `<head>` 后注入 `<meta name="clash-route-kit-token" content="…">`；无 `<head>` 时前置到文档开头。token 经 `HostingOptions` 传入（serve.ts 从 context 取）。
- **vite dev 路径**：`routeKitApiPlugin` 增加 `transformIndexHtml` 钩子注入同一 meta（dev 的 index.html 由 vite 提供、不经 hostingHandler 静态路径）。
- `serve.ts` 组装改为使用 `createLocalServerContext`（现直接组合 hosting+api 的两行差异收编，避免第三处装配点漂移）。

### 3.4 前端统一加头（与守卫同一提交）

新文件 `apps/web/src/apiClient.ts`：`authorizedFetch(input, init)`——仅当请求路径以 `/api/` 开头（相对字符串）时附加 `x-clash-route-kit-token`（读 `<meta>` 一次并缓存；meta 缺失时不加头，由服务端 403 兜底提示刷新）。外部 URL（subscriptions 探活 subconverter）透传不加头。

替换默认 fetcher 的调用点（`globalThis.fetch` → `authorizedFetch`，函数签名不变，显式传 fetcher 的测试不受影响）：`v2Project.ts`（2 处）、`actions.ts`、`ruleFiles.ts`（4 处）、`catalog.ts`、`publishWorkflow.ts`（2 处）、`SourcePickerModal.tsx`、`LibraryPage.tsx`、`ConfigYamlSection.tsx`、`GithubPublishPanel.tsx`、`ListFileEditor.tsx`。**`subscriptions.ts` 不改**（外部端点）。

旧 bundle 兼容：浏览器缓存的旧 index.html 无 meta → 请求无 token → 403；403 文案为 `Forbidden (refresh required)` 类提示，用户刷新后自愈。该窗口仅一次刷新，可接受。

### 3.5 /api/git 方法校验

`apiHandler.ts`：`/api/git/remote`、`/api/git/publish-status` 仅接受 GET，其余方法 405。`/api/actions/*` 已 POST-only 不动。

## 4. 测试与验证

新增（TDD 先红后绿）：

1. `connectionGuard.test.ts`：Host 允许/拒绝/缺失、剥端口与 IPv6 形式、Origin host 白名单、Sec-Fetch-Site 规则、无头非浏览器放行到 token 关、token 匹配/缺失/错值、`/templates` 与 `/rules` 仅受 Host 检查、wildcard 永不入白名单。
2. `hostingHandler.test.ts`：静态 `.html` 与 SPA fallback 的注入存在且 token 正确；非 html 响应不含 meta。
3. `apiHandler.test.ts`：两个 git 端点非 GET → 405。
4. serve 启动校验纯函数单测：wildcard 三形态拒绝、字面量通过。
5. `apiClient` 单测：/api 路径加头、meta 缺失不加头、外部 URL 不加头。
6. `localServer.test.ts` 集成：全栈无 token → 403；带 token 全链路可用。

验证分层：每提交前受影响测试 + `pnpm typecheck`；推送前全量 `pnpm test`；发布层以 CI 绿为准（pnpm 12.6.0 已过验证）。手工冒烟：`pnpm dev` 与 `pnpm serve` 各起一次，确认页面可用、curl 无 token 403、curl 带 token 200、SubConverter 拉 `/templates` 不受影响。

## 5. 提交切分（主工作树，显式路径）

1. `feat: 本地服务加连接校验（Host/Origin/token）`——connectionGuard + context/serve 组装 + wildcard 拒绝 + 双宿主 token 注入 + apiClient + 全部测试。**必须端到端自洽单提交**（守卫先上线而前端无头会让 web 全 403，baseMtime 批次的教训）。
2. `fix: /api/git 端点补方法校验`——apiHandler + 测试。

## 6. 风险与边界

- **SubConverter 兼容**：Host 白名单含绑定地址本身，拉取 `/templates` `/rules` 不受影响；手工冒烟覆盖。
- **per-boot token 不轮换**：单用户本地工具，服务重启即换；不做会话级轮换（YAGNI）。
- **已知限制（注释声明）**：/templates /rules 无 token、依赖 Host 层；浏览器 LNA/PNA 保护是未来加分项而非依赖。
- **范围外**：HTTPS、CSRF cookie、subconverter 自身鉴权、CLI 动作链路（不走 HTTP）。
- workspace：主工作树（同前批理由：改动面小、他人在途改动已清空）。
