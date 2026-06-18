# 单进程闭环 serve · 设计方案

- **日期**：2026-06-18
- **状态**：已通过头脑风暴评审，待用户最终审阅
- **作者**：ClashRouteKit 项目
- **背景**：评估 `docs/superpowers/plans/2026-06-18-clashroute-design.md`（一份 Python/FastAPI 重写提案）后，决定**不换技术栈**，只把其中真正解决"不可用"的两点——**单进程闭环托管 INI** 与 **订阅尾巴做到底**——折进现有 Node/pnpm monorepo。

---

## 1. 概述与目标

当前"编辑 → 生成 INI → 托管 → 装配订阅"碎成多个进程：`pnpm dev`（编辑器 + API，寄生于 vite）、`pnpm serve:output`（独立 :8787 静态托管 `output/`）、`pnpm generate`（CLI 落盘）。subconverter 要拉的 INI 由 `serve:output` 托管，与编辑器不同源、不同进程，且 `publishBaseUrl` 默认 `127.0.0.1` 只在同机可用。订阅尾巴只拼了 URL，无二维码、无防缓存。

**目标**：把闭环焊成单进程，并补齐尾巴，使日常使用变为"编辑 → 存 → 扫码/下载即得最新订阅"。

### 1.1 数据流（目标态）

```
手机 / OpenClash ──订阅URL──▶ subconverter(/sub?target=clash&url=<机场>&config=<工具INI URL?v=mtime>)
                                          │ 拉取
                                          ▼
                       工具进程 (host 0.0.0.0:8787, public-base = LAN IP)
                         ├─ /templates/<name>.ini   实时渲染 renderIni(config)
                         ├─ /rules/<file>.yaml       静态托管 output/rules（generate 落盘）
                         ├─ /api/*                   配置 CRUD / catalog / actions
                         └─ /                          编辑器前端（serve 态托管构建产物）
```

**关键**：真正访问 `publishBaseUrl`（工具托管的 INI/provider）的是 **subconverter**，不是手机；手机只访问 subconverter 的 `/sub`。因此 `publishBaseUrl` 取决于 subconverter 部署位置。

---

## 2. 已确定决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 是否换技术栈 | 否，留 Node/pnpm | 设计文档的 Python 是重写成本，现有栈已有全部地基 |
| 运行形态 | **dev + serve 两者都要**，共享同一套托管/生成逻辑 | dev 给改 web 代码用（热更），serve 给日常常驻用 |
| 共享核心放哪 | **方案 A：放进 `apps/cli`** | `apps/web/dev` 已 import cli 的 `program.js`，依赖方向天然正确；handler 已是 `node:http` 签名，搬动近零成本；不新增包 |
| subconverter 部署 | **异机固定 IP** | 用户 subconverter 固定在旁路由/NAS；不做网卡探测，配置写死 LAN IP |
| 监听地址 | serve 默认 `host 0.0.0.0` | 让异机 subconverter 能拉到托管的 INI |
| yaml 预览 | **不做后端代理**；订阅 URL 即可下载链接 | 浏览器直接 GET subconverter URL 下载 yaml，用户自选位置；少一层代理 |
| 机场链接 | **纯会话内存，不落盘** | 隐私数据；不为预览而持久化；最安全最简 |
| INI 托管 | **实时渲染**（读 config → `renderIni`） | 存盘即最新，无需手动 generate；`renderIni` 是纯函数极快 |
| provider YAML 托管 | **generate 落盘 + 静态托管** | 依赖 vendor 源文件、变化不频繁，避免每请求重读 |
| 二维码 | 本地离线生成（`qrcode` 库） | 不上传任何数据 |
| 防缓存 | `config=` 的 INI URL 带 `?v=<config mtime>` | 否则 subconverter 喂回缓存的旧 config |

### 2.1 非目标（YAGNI）

- 不做后端 httpx 代理 subconverter、不做工具内 yaml 预览面板。
- 不做机场链接持久化、不做网卡自动探测。
- 不引 dnd-kit、不引多模板（`userdata/templates/*.json`）——与"单一 `routes.yaml` 进 Git"哲学冲突。
- 不引 express/fastify——沿用现有裸 `node:http` handler 风格。
- 本轮不做访问鉴权 token（见 §9 风险）。

---

## 3. 架构总览

四个包职责（沿用现状，本方案只动 cli 与 web，新增托管层）：

- `packages/core`：纯函数，无 IO。新增承接从 web 搬来的纯配置变换（见 §4.6）。
- `apps/cli`：文件 IO + 调 core；**新增**共享 API handler、托管层、`serve` 命令。
- `apps/web`：编辑器 UI；dev 中间件改为复用 cli 的 handler；订阅装配页增强。
- （不新增包。）

**依赖方向**：`web → cli → core`（已成立，本方案不改方向，只把 handler 从 `web/dev` 搬到 `cli`，使 web/dev 变薄）。

---

## 4. 组件与接口（按单元划分）

每个单元单一职责、明确接口、可独立测试。

### 4.1 共享 API handler（搬到 cli）

- **职责**：处理 `/api/*`（配置 CRUD、catalog、rule files、vendor/add、git、actions）。逻辑即现 `apps/web/dev/routeKitApi.ts`，整体迁入 `apps/cli/src/serveApi.ts`。
- **接口**（不变）：`createRouteKitApiHandler(options: ProgramOptions) => (req: IncomingMessage, res: ServerResponse, next: () => void) => void`。已是 `node:http` 签名，serve 与 dev 通用。
- **依赖**：注入式 fs（现有 `ReadText`/`WriteText`/`ReadDirectory`）+ core + cli 的 `generateOutputs`/`checkConfig`/`syncVendor`。
- **变更**：GET `/api/project/config` 的返回 `ProjectConfigFileResult` **新增 `mtime: number`**（`stat` 配置文件），供前端拼 cache-bust。

### 4.2 托管层 hosting handler（新增，cli）

- **职责**：处理非 `/api/*` 的静态/实时托管，链在 API handler 之前或之后。`apps/cli/src/serveHosting.ts`。
- **接口**：`createHostingHandler(options: HostingOptions) => (req, res, next) => void`，其中
  `HostingOptions extends ProgramOptions { publicBase: string; webRoot?: string }`（`webRoot` 为 web 构建产物目录，dev 态省略——dev 由 vite 处理前端）。
- **路由**：
  - `GET /templates/<name>.ini` → 读 config（以 `{ ...config, publishBaseUrl: publicBase }` 覆盖运行时 public-base）→ `renderIni(config, options)` → 返回 `text/plain`；响应头带 `ETag`/`Last-Modified` 用 config mtime。
  - `GET /rules/<file>.yaml` → 读 `output/rules/<file>`（路径白名单校验，仿现有 `resolveRuleFile`）→ 静态返回 `text/yaml`。
  - 其余 → `webRoot` 静态文件（serve 态，含 SPA fallback 到 `index.html`）；无 `webRoot` 时 `next()`（dev 态交回 vite）。
- **依赖**：注入式 fs + core 的 `renderIni` + cli 的 `parseRouteKitConfig`。

### 4.3 serve 命令（新增，cli）

- **职责**：`clashroutekit serve` —— `node:http.createServer` 组合 `[hosting handler → api handler → 404]`，监听 `host:port`。
- **CLI 接口**：`serve [--port 8787] [--host 0.0.0.0] [--public-base <url>] [--web-root <dir>]`。
  - `--public-base` 默认取 `config.publishBaseUrl`；`--web-root` 默认 `apps/web/dist`。
- **行为**：启动前确保 web 已构建（缺 `dist` 则提示先 `pnpm build`，本轮不自动 build）；启动日志回显 **编辑器地址 / public-base / subconverter 地址**。
- **接线**：`apps/cli/src/index.ts` 分发 `serve`；`package.json` 加 `"serve": "..."`（替代 `serve:output`）。
- **可测**：`createServeServer(options): http.Server`（纯装配，不 `listen`），集成测试起 server、请求 `/templates`、`/rules`、`/api`。

### 4.4 dev 适配（瘦身，web）

- `apps/web/vite.config.ts` 的中间件改为复用 cli 的 `createHostingHandler`（无 `webRoot`）+ `createRouteKitApiHandler`，**同端口**也托管 `/templates`、`/rules`。
- 删除 `apps/web/dev/routeKitApi.ts`（逻辑已迁 cli）与 `package.json` 的 `serve:output` 脚本。
- 现有 `apps/web/tests/routeKitApi.test.ts` 跟随迁移到 `apps/cli/tests/`，import 路径改为 cli。

### 4.5 配置 schema 变更（core + 三处消费方）

- `packages/core/src/types.ts`：`RouteKitConfig` 加 `subconverterUrl?: string`（默认在消费处兜底 `http://10.0.0.3:25500/sub`）。
- 同步：CLI `readConfig`（解析容忍新字段，`parseRouteKitConfig`）、web `config.ts`（构建期 `?raw` 内联，无需改解析，但类型生效）。
- `parseRouteKitConfig`/`serializeRouteKitConfig`（core）保留 `subconverterUrl` 往返。
- 加测试断言往返保真。

### 4.6 依赖搬迁（web → core）

- 现 handler 依赖 `apps/web/src/configMutations.ts` 的 `addVendorRepo`（纯配置变换、无 IO）。搬到 cli 后该依赖跨向 web 不合适。**将 `addVendorRepo` 移到 `packages/core`**（纯函数应归 core），在 `index.ts` re-export；web `configMutations.ts` 改为从 core re-export 以不破坏现有 import。
- 若 handler 还依赖其它 web 侧纯函数，同此处理。

### 4.7 订阅装配页增强（web）

- `apps/web/src/subscriptions.ts`：`buildSubconverterUrl` 增参 `subconverterUrl`（取代硬编码 endpoint 默认）与 `configVersion`（拼 `config=<INI URL>?v=<configVersion>`）。
- `apps/web/src/components/PublishPanel.tsx`：
  - 机场链接输入（纯内存）；subconverter 地址输入（默认取 `config.subconverterUrl`，可改）；target/开关。
  - 产出：可点击订阅 URL（`<a target="_blank">` → 浏览器下载 yaml）+「复制 URL」+「下载 yaml」按钮 + **二维码**（`qrcode` 生成 data URL，离线）。
  - cache-bust 的 `configVersion` 取自 `GET /api/project/config` 返回的 `mtime`（§4.1）。
- 新增依赖 `qrcode`（+ `@types/qrcode`）。

---

## 5. 测试策略

- **托管层**（4.2）：注入 fs，断言 `/templates/x.ini` 实时渲染含 `[custom]` 与 public-base 替换正确；`/rules/x.yaml` 路径白名单拒绝越界；SPA fallback。
- **serve 装配**（4.3）：`createServeServer` 起 server，请求各端点断言状态码与 content-type。
- **API handler**（4.1）：迁移现有 routeKitApi 测试到 cli，新增 `mtime` 字段断言。
- **subscriptions**（4.7）：扩测 `subconverterUrl` 注入与 `?v=` cache-bust 拼接。
- **schema**（4.5）：`parseRouteKitConfig`/`serializeRouteKitConfig` 往返保 `subconverterUrl`。
- **二维码**：生成 data URL 不抛错。
- 收尾：`pnpm typecheck && pnpm test && pnpm build && pnpm check` 全绿。

---

## 6. 文件影响清单

**新增**：
- `apps/cli/src/serveApi.ts`（迁自 `apps/web/dev/routeKitApi.ts`）
- `apps/cli/src/serveHosting.ts`（托管层）
- `apps/cli/src/serve.ts`（`serveCommand` + `createServeServer`）
- `apps/cli/tests/serveHosting.test.ts`、`apps/cli/tests/serve.test.ts`

**修改**：
- `apps/cli/src/index.ts`（分发 `serve`）
- `packages/core/src/types.ts`（`subconverterUrl`）、`parsers`（往返）、`index.ts`（re-export `addVendorRepo`）
- `apps/web/vite.config.ts`（中间件复用 cli handler）
- `apps/web/src/subscriptions.ts`、`components/PublishPanel.tsx`、`configMutations.ts`（addVendorRepo 改 re-export）、`config.ts`（类型）
- `config/routes.yaml`（加 `subconverterUrl`，可选示例）
- `package.json`（`serve` 脚本替 `serve:output`；加 `qrcode` 依赖）
- `CLAUDE.md`（更新命令与发布模型说明）

**删除**：
- `apps/web/dev/routeKitApi.ts`、`package.json` 的 `serve:output`

---

## 7. 里程碑（留给实施计划细化）

- **M1 地基**：依赖搬迁（4.6）+ API handler 迁 cli（4.1）+ 托管层（4.2）+ serve 命令（4.3）+ dev 瘦身（4.4）。达成"单进程同源托管 INI/rules/编辑器"。
- **M2 schema**：`subconverterUrl`（4.5）+ config `mtime`（4.1）。
- **M3 尾巴**：订阅装配页二维码 + 下载 + cache-bust（4.7）。

---

## 8. 关键约定（沿用 CLAUDE.md）

- ESM/NodeNext：相对 import 必带 `.js`。
- 新增 core 导出在 `index.ts` 显式 re-export（含类型）。
- 唯一配置源 `config/routes.yaml`，改 schema 同步 `types.ts` + CLI + web 三处。
- 免构建开发：core 改动经 alias 直接生效。
- CI publish 不受影响：CI 覆盖 `publishBaseUrl` 为 raw github，`serve`/`--public-base` 仅本地运行时生效。

---

## 9. 风险与待确认

- **`0.0.0.0` 暴露面**：serve 监听全网卡 = 可信 LAN 内任何人可访问编辑器 + API（能改配置）。本地自用可接受；如需收紧，后续加 token，本轮不做。
- **provider 落盘的新鲜度**：改了 `ruleProviders` 或 sync vendor 后需重跑 generate 才更新 `/rules`；INI 实时渲染不受影响。可在保存涉及 provider 的改动时提示「需重新生成 rules」，本轮以提示为主、不自动重算。
- **web `dist` 前置**：serve 依赖已构建的前端；缺 `dist` 时仅提示，不自动 build（避免 serve 启动慢/隐式构建）。
- **`addVendorRepo` 迁移**：移到 core 时确保 web 既有 import 经 re-export 不破，`pnpm -r typecheck` 验证。
