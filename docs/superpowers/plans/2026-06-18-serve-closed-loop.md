# 单进程闭环 serve 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development（推荐，A 层纯逻辑任务）或 superpowers:executing-plans（B 层 vite/UI 任务，inline 执行、先读活组件再落码）逐任务实施。步骤用 checkbox（`- [ ]`）跟踪。

**Goal:** 把「编辑 → 生成 INI → 托管 → 装配订阅」从三进程焊成单进程闭环，并补齐订阅尾巴（二维码 + 浏览器直下 yaml + 防缓存）。

**Architecture:** 把现寄生于 vite 的 `routeKitApi` handler（已是 `node:http` 签名）整体迁入 `apps/cli`，新增框架无关的「托管层」（`/templates` 实时渲染、`/rules` 静态、web 构建产物）与 `serve` 命令；`serve`（常驻）与 `pnpm dev`（vite 中间件）复用同一套 handler。依赖方向 `web → cli → core` 已成立，本计划只让 web/dev 变薄。

**Tech Stack:** Node 内置 `http`（不引 express/fastify）、TypeScript（NodeNext，相对 import 必带 `.js`）、vitest、React 19、`qrcode`。

## Global Constraints

- **ESM/NodeNext**：所有相对 import 必带 `.js` 扩展名（即使源是 `.ts`）。
- **新增 core 导出**必须在 `packages/core/src/index.ts` 显式 re-export（含类型）。
- **免构建开发**：改 core 源码无需先 build，cli/web/测试经 alias/`--conditions development` 直接用 `packages/core/src`。
- **唯一配置源** `config/routes.yaml`（类型 `RouteKitProjectConfig`）；改 schema 同步 `types.ts` + CLI(`readConfig`) + web(`config.ts`) 三处消费方。
- **质量门禁**：无 lint，靠 `pnpm typecheck` + `pnpm test`；A 层任务先写失败测试；收尾跑 `pnpm typecheck && pnpm test && pnpm build && pnpm check`。
- **CLI 命令**经 `pnpm --filter @clash-route-kit/cli start <command>` 运行（`start` = `tsx --conditions development src/index.ts`）。
- **不引入** express/fastify、dnd-kit、多模板、后端代理 subconverter；机场链接纯内存不落盘。

---

## File Structure

| 文件 | 责任 |
|---|---|
| `packages/core/src/configMutations.ts`（新） | 纯配置变换 `addVendorRepo`（从 web 搬来） |
| `apps/cli/src/serveApi.ts`（新，迁自 web） | `/api/*` handler（配置 CRUD / catalog / rule files / vendor / git / actions） |
| `apps/cli/src/serveHosting.ts`（新） | 托管层：`/templates/*.ini` 实时渲染、`/rules/*.yaml` 静态、web 静态 + SPA fallback |
| `apps/cli/src/serve.ts`（新） | `createServeServer`（装配 `http.Server`）+ `startServe`（监听/日志/dist 校验） |
| `apps/cli/src/index.ts`（改） | 分发 `serve`，解析 `--port/--host/--public-base/--web-root` |
| `apps/web/vite.config.ts`（改） | dev 中间件改用 cli 的 hosting + api handler，同端口托管 |
| `apps/web/dev/routeKitApi.ts`（删） | 逻辑已迁 cli |
| `packages/core/src/types.ts`（改） | `RouteKitConfig.subconverterUrl?` |
| `apps/web/src/subscriptions.ts`（改） | `buildSubconverterUrl` 加 `subconverterUrl` + `configVersion`（cache-bust） |
| `apps/web/src/components/SubscribeAssembler.tsx`（新） | 机场链接 → 订阅 URL + 二维码 + 复制/下载/打开 |
| `package.json`（改） | `serve` 脚本替 `serve:output`；加 `qrcode` 依赖 |

---

# Phase M1 · 单进程托管地基

## Task 1：`addVendorRepo` 搬到 core

**Files:**
- Create: `packages/core/src/configMutations.ts`
- Create: `packages/core/tests/configMutations.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/web/src/configMutations.ts:342-357`（删本地定义，改 re-export）

**Interfaces — Produces:**
- `addVendorRepo(config: RouteKitProjectConfig, repo: VendorRepoConfig): RouteKitProjectConfig`（重名/重路径抛错）

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/tests/configMutations.test.ts
import { describe, expect, it } from "vitest";
import { addVendorRepo } from "../src/configMutations.js";
import type { RouteKitProjectConfig, VendorRepoConfig } from "../src/types.js";

const base = {
  publishBaseUrl: "http://127.0.0.1:8787",
  template: { output: "Custom_Clash.ini" },
  vendorRepos: [{ name: "dler-io", url: "x", path: "vendor/Rules" }] as VendorRepoConfig[],
  customProxyGroups: [],
  ruleSets: [],
} as unknown as RouteKitProjectConfig;

describe("addVendorRepo", () => {
  it("appends a vendor repo", () => {
    const next = addVendorRepo(base, { name: "MyRules", url: "https://x/y.git", path: "vendor/y" });
    expect(next.vendorRepos.at(-1)?.name).toBe("MyRules");
    expect(base.vendorRepos).toHaveLength(1); // 不可变
  });
  it("rejects duplicate name", () => {
    expect(() => addVendorRepo(base, { name: "dler-io", url: "x", path: "p" })).toThrow(/exists/);
  });
  it("rejects duplicate path", () => {
    expect(() => addVendorRepo(base, { name: "New", url: "x", path: "vendor/Rules" })).toThrow(/path/);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run packages/core/tests/configMutations.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现** —— 创建 `packages/core/src/configMutations.ts`：

```ts
import type { RouteKitProjectConfig, VendorRepoConfig } from "./types.js";

export function addVendorRepo(
  config: RouteKitProjectConfig,
  repo: VendorRepoConfig,
): RouteKitProjectConfig {
  const name = repo.name.trim();
  if (!name) {
    throw new Error("vendor repo name is required");
  }
  if (config.vendorRepos.some((item) => item.name === name)) {
    throw new Error(`vendor repo "${name}" already exists`);
  }
  if (config.vendorRepos.some((item) => item.path === repo.path)) {
    throw new Error(`vendor repo path already exists: ${repo.path}`);
  }
  return { ...config, vendorRepos: [...config.vendorRepos, { ...repo, name }] };
}
```

- [ ] **Step 4: re-export** —— 在 `packages/core/src/index.ts` 末尾追加：

```ts
export { addVendorRepo } from "./configMutations.js";
```

- [ ] **Step 5: web 改为 re-export** —— `apps/web/src/configMutations.ts` 删除第 342-357 行的本地 `addVendorRepo` 定义，在文件顶部 import 区之后追加：

```ts
export { addVendorRepo } from "@clash-route-kit/core";
```
若删除后 `VendorRepoConfig` 在该文件不再被引用，从其 import 列表移除以免 typecheck 报未使用。

- [ ] **Step 6: 运行确认通过 + 提交**

Run: `pnpm exec vitest run packages/core/tests/configMutations.test.ts && pnpm --filter @clash-route-kit/web typecheck`

```bash
git add packages/core/src/configMutations.ts packages/core/tests/configMutations.test.ts packages/core/src/index.ts apps/web/src/configMutations.ts
git commit -m "refactor(core): move addVendorRepo to core (shared by cli serve)"
```

## Task 2：API handler 迁入 cli

把 `apps/web/dev/routeKitApi.ts` 整体迁到 `apps/cli/src/serveApi.ts`，仅改 import 来源；签名 `createRouteKitApiHandler(options: ProgramOptions)` 不变。原 web 文件本任务**暂不删**（vite 仍引），Task 5 再删。

**Files:**
- Create: `apps/cli/src/serveApi.ts`（内容 = 现 `apps/web/dev/routeKitApi.ts`，改 import）
- Create: `apps/cli/tests/serveApi.test.ts`（迁自 `apps/web/tests/routeKitApi.test.ts`，改 import 路径）
- Delete: `apps/web/tests/routeKitApi.test.ts`（迁走）

**Interfaces — Produces:**
- `createRouteKitApiHandler(options: ProgramOptions): (req: IncomingMessage, res: ServerResponse, next: () => void) => void`
- 以及现 routeKitApi 导出的全部纯函数（`readProjectConfigFile`、`listCatalogSources`、`catalogOriginsFromConfig`、`readCatalogTemplate` 等），保持同名导出。

- [ ] **Step 1: 复制文件到 cli** —— 把 `apps/web/dev/routeKitApi.ts` 全文复制到 `apps/cli/src/serveApi.ts`。

- [ ] **Step 2: 改两处 import**（其余不变）：
  - `from "../../cli/src/program.js"` → `from "./program.js"`
  - `from "../src/configMutations.js"`（`addVendorRepo`）→ `from "@clash-route-kit/core"`

- [ ] **Step 3: 迁移测试** —— 把 `apps/web/tests/routeKitApi.test.ts` 复制为 `apps/cli/tests/serveApi.test.ts`，其 import `from "../dev/routeKitApi.js"` 改为 `from "../src/serveApi.js"`；删除原 `apps/web/tests/routeKitApi.test.ts`。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm exec vitest run apps/cli/tests/serveApi.test.ts && pnpm --filter @clash-route-kit/cli typecheck`
Expected: PASS（迁移后行为不变）。

- [ ] **Step 5: 提交**

```bash
git add apps/cli/src/serveApi.ts apps/cli/tests/serveApi.test.ts apps/web/tests/routeKitApi.test.ts
git commit -m "refactor: move route-kit api handler into cli (serveApi)"
```

## Task 3：托管层 `createHostingHandler`

**Files:**
- Create: `apps/cli/src/serveHosting.ts`
- Create: `apps/cli/tests/serveHosting.test.ts`

**Interfaces — Consumes:** core `renderIni`、`parseRouteKitConfig`；`ProgramOptions`（from `./program.js`）。
**Interfaces — Produces:**
- `interface HostingOptions extends ProgramOptions { publicBase: string; webRoot?: string; readText?: (filePath: string) => Promise<string> }`
- `createHostingHandler(options: HostingOptions): (req: IncomingMessage, res: ServerResponse, next: () => void) => void`

路由：`GET /templates/*.ini` → 读 config（以 `publicBase` 覆盖 `publishBaseUrl`）→ `renderIni` → `text/plain`；`GET /rules/<file>.yaml`（白名单 `^[A-Za-z0-9_.-]+\.yaml$`）→ 读 `output/rules/<file>` → `text/yaml`；其余 → `webRoot` 静态 + SPA fallback，无 `webRoot` 则 `next()`。

- [ ] **Step 1: 写失败测试**

```ts
// apps/cli/tests/serveHosting.test.ts
import { describe, expect, it } from "vitest";
import { createHostingHandler } from "../src/serveHosting.js";

function fakeRes() {
  const res: any = { statusCode: 200, headers: {} as Record<string, string>, body: "" };
  res.setHeader = (k: string, v: string) => { res.headers[k.toLowerCase()] = v; };
  res.end = (chunk?: string) => { if (chunk) res.body += chunk; res.done?.(); };
  return res;
}
function run(handler: any, url: string, method = "GET") {
  return new Promise<any>((resolve) => {
    const res = fakeRes();
    res.done = () => resolve(res);
    handler({ url, method }, res, () => { res.statusCode = 404; res.end("next"); });
  });
}

const sampleConfig = `publishBaseUrl: http://127.0.0.1:8787
template:
  output: Custom_Clash.ini
vendorRepos: []
customProxyGroups:
  - name: Proxy
    type: select
    options: [DIRECT]
ruleSets:
  - id: p
    policy: Proxy
    source:
      type: rule-provider
      behavior: domain
      file: AI_Domain.yaml
  - id: final
    policy: Proxy
    source:
      type: final
`;

describe("createHostingHandler", () => {
  const handler = createHostingHandler({
    root: "/proj",
    configFile: "config/routes.yaml",
    publicBase: "http://10.0.0.3:8787",
    readText: async () => sampleConfig,
  });

  it("renders /templates/*.ini live with publicBase substituted", async () => {
    const res = await run(handler, "/templates/Custom_Clash.ini");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.body).toContain("[custom]");
    expect(res.body).toContain("http://10.0.0.3:8787/rules/AI_Domain.yaml");
    expect(res.body).not.toContain("127.0.0.1");
  });

  it("rejects /rules path traversal", async () => {
    const res = await run(handler, "/rules/..%2f..%2fsecret.yaml");
    expect(res.statusCode).toBe(400);
  });

  it("calls next for non-hosted paths when no webRoot", async () => {
    const res = await run(handler, "/api/project/config");
    expect(res.body).toBe("next");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/cli/tests/serveHosting.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现** —— 创建 `apps/cli/src/serveHosting.ts`：

```ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseRouteKitConfig, renderIni } from "@clash-route-kit/core";
import type { ProgramOptions } from "./program.js";

export interface HostingOptions extends ProgramOptions {
  publicBase: string;
  webRoot?: string;
  readText?: (filePath: string) => Promise<string>;
}

const RULE_FILE = /^[A-Za-z0-9_.-]+\.yaml$/;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function send(res: ServerResponse, status: number, contentType: string, body: string | Buffer): void {
  res.statusCode = status;
  res.setHeader("content-type", contentType);
  res.end(body);
}

export function createHostingHandler(options: HostingOptions) {
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));

  return (request: IncomingMessage, response: ServerResponse, next: () => void): void => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname;

    if (pathname.startsWith("/templates/") && pathname.endsWith(".ini")) {
      const configPath = path.resolve(options.root, options.configFile);
      void readText(configPath)
        .then((text) => {
          const config = parseRouteKitConfig(text);
          const ini = renderIni({ ...config, publishBaseUrl: options.publicBase });
          send(response, 200, "text/plain; charset=utf-8", ini);
        })
        .catch((error: unknown) => {
          send(response, 500, "text/plain; charset=utf-8", error instanceof Error ? error.message : String(error));
        });
      return;
    }

    if (pathname.startsWith("/rules/")) {
      const file = decodeURIComponent(pathname.slice("/rules/".length));
      if (!RULE_FILE.test(file)) {
        send(response, 400, "text/plain; charset=utf-8", `Invalid rule file: ${file}`);
        return;
      }
      const filePath = path.resolve(options.root, "output/rules", file);
      void readText(filePath)
        .then((text) => send(response, 200, "text/yaml; charset=utf-8", text))
        .catch(() => send(response, 404, "text/plain; charset=utf-8", `Not found: ${file}`));
      return;
    }

    if (!options.webRoot) {
      next();
      return;
    }

    const webRoot = options.webRoot;
    const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const candidate = path.resolve(webRoot, rel);
    if (!candidate.startsWith(path.resolve(webRoot))) {
      send(response, 400, "text/plain; charset=utf-8", "Bad path");
      return;
    }
    void readFile(candidate)
      .then((buf) => send(response, 200, CONTENT_TYPES[path.extname(candidate)] ?? "application/octet-stream", buf))
      .catch(() => {
        // SPA fallback
        void readFile(path.resolve(webRoot, "index.html"))
          .then((buf) => send(response, 200, "text/html; charset=utf-8", buf))
          .catch(() => send(response, 404, "text/plain; charset=utf-8", "Not found"));
      });
  };
}
```

- [ ] **Step 4: 运行确认通过 + 提交**

Run: `pnpm exec vitest run apps/cli/tests/serveHosting.test.ts && pnpm --filter @clash-route-kit/cli typecheck`

```bash
git add apps/cli/src/serveHosting.ts apps/cli/tests/serveHosting.test.ts
git commit -m "feat(cli): hosting handler (live INI + static rules + SPA)"
```

## Task 4：`serve` 命令

**Files:**
- Create: `apps/cli/src/serve.ts`
- Create: `apps/cli/tests/serve.test.ts`
- Modify: `apps/cli/src/index.ts`
- Modify: `package.json:10`（`serve:output` → `serve`）

**Interfaces — Consumes:** `createHostingHandler`（Task 3）、`createRouteKitApiHandler`（Task 2）。
**Interfaces — Produces:**
- `interface ServeOptions extends HostingOptions { port: number; host: string }`
- `createServeServer(options: ServeOptions): import("node:http").Server`
- `startServe(options: ServeOptions): Promise<import("node:http").Server>`（校验 webRoot、listen、日志）

- [ ] **Step 1: 写失败测试**

```ts
// apps/cli/tests/serve.test.ts
import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createServeServer } from "../src/serve.js";

let server: import("node:http").Server | undefined;
afterEach(() => { server?.close(); server = undefined; });

const sample = `publishBaseUrl: http://127.0.0.1:8787
template: { output: Custom_Clash.ini }
vendorRepos: []
customProxyGroups: [{ name: Proxy, type: select, options: [DIRECT] }]
ruleSets: [{ id: final, policy: Proxy, source: { type: final } }]
`;

describe("createServeServer", () => {
  it("serves live INI and routes /api to api handler", async () => {
    server = createServeServer({
      root: "/proj", configFile: "config/routes.yaml",
      publicBase: "http://10.0.0.3:8787", host: "127.0.0.1", port: 0,
      readText: async () => sample,
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;

    const ini = await fetch(`http://127.0.0.1:${port}/templates/Custom_Clash.ini`);
    expect(ini.status).toBe(200);
    expect(await ini.text()).toContain("[custom]");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/cli/tests/serve.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现** —— 创建 `apps/cli/src/serve.ts`：

```ts
import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { createHostingHandler, type HostingOptions } from "./serveHosting.js";
import { createRouteKitApiHandler } from "./serveApi.js";

export interface ServeOptions extends HostingOptions {
  port: number;
  host: string;
}

export function createServeServer(options: ServeOptions): Server {
  const hosting = createHostingHandler(options);
  const api = createRouteKitApiHandler(options);
  return createServer((request, response) => {
    hosting(request, response, () => {
      api(request, response, () => {
        response.statusCode = 404;
        response.setHeader("content-type", "text/plain; charset=utf-8");
        response.end("Not found");
      });
    });
  });
}

export async function startServe(options: ServeOptions): Promise<Server> {
  if (options.webRoot && !existsSync(path.resolve(options.webRoot, "index.html"))) {
    throw new Error(
      `web build not found at ${options.webRoot}. Run "pnpm build" first, or pass --web-root.`,
    );
  }
  const server = createServeServer(options);
  await new Promise<void>((resolve) => server.listen(options.port, options.host, resolve));
  console.log(`[serve] editor:      http://${options.host}:${options.port}`);
  console.log(`[serve] public-base: ${options.publicBase}  (subconverter pulls INI from here)`);
  console.log(`[serve] templates:   ${options.publicBase}/templates/*.ini (live)`);
  return server;
}
```

- [ ] **Step 4: 接线 index.ts** —— 在 `apps/cli/src/index.ts` 的命令链中（`subconvert-url` 分支之后）加入：

```ts
  if (command === "serve") {
    const args = process.argv.slice(3);
    const flag = (name: string): string | undefined => {
      const index = args.indexOf(name);
      return index >= 0 ? args[index + 1] : undefined;
    };
    const config = await readConfig({ root, configFile });
    const { startServe } = await import("./serve.js");
    await startServe({
      root,
      configFile,
      host: flag("--host") ?? process.env.CLASH_ROUTE_KIT_HOST ?? "0.0.0.0",
      port: Number(flag("--port") ?? process.env.CLASH_ROUTE_KIT_PORT ?? 8787),
      publicBase: flag("--public-base") ?? process.env.CLASH_ROUTE_KIT_PUBLISH_BASE_URL ?? config.publishBaseUrl,
      webRoot: flag("--web-root") ?? path.resolve(root, "apps/web/dist"),
    });
    return;
  }
```
并在 index.ts 顶部 import 区补 `readConfig`（从 `./program.js`）与 `import path from "node:path"`；若 `readConfig` 当前未从 program.ts 导出，则在 `program.ts` 给其加 `export`。把末尾 Usage 字符串补上 `serve`。

- [ ] **Step 5: 改 package.json 脚本** —— 第 10 行 `"serve:output": "vite ..."` 替换为：

```json
    "serve": "pnpm --filter @clash-route-kit/cli start serve",
```

- [ ] **Step 6: 运行确认通过 + 提交**

Run: `pnpm exec vitest run apps/cli/tests/serve.test.ts && pnpm --filter @clash-route-kit/cli typecheck`

```bash
git add apps/cli/src/serve.ts apps/cli/tests/serve.test.ts apps/cli/src/index.ts apps/cli/src/program.ts package.json
git commit -m "feat(cli): single-process serve command (hosting + api)"
```

## Task 5：dev 中间件复用 cli handler（B 层：先读活文件）

**Files:**
- Modify: `apps/web/vite.config.ts`
- Delete: `apps/web/dev/routeKitApi.ts`

**变更规格：**
- `vite.config.ts` 改为 import cli 的 handler：`import { createRouteKitApiHandler } from "../cli/src/serveApi.js"` 与 `import { createHostingHandler } from "../cli/src/serveHosting.js"`（路径相对 `apps/web/`）。
- `configureServer` 内**先 use hosting（不传 `webRoot`，dev 前端由 vite 处理）再 use api**：

```ts
      const base = { root: process.env.CLASH_ROUTE_KIT_ROOT ?? root, configFile };
      server.middlewares.use(
        createHostingHandler({ ...base, publicBase: process.env.CLASH_ROUTE_KIT_PUBLISH_BASE_URL ?? "http://127.0.0.1:8787" }),
      );
      server.middlewares.use(createRouteKitApiHandler(base));
```
- 删除 `apps/web/dev/routeKitApi.ts`。

**测试点：** `pnpm --filter @clash-route-kit/web typecheck` 通过；`pnpm dev` 手动验证 `/api/project/config`、`/templates/Custom_Clash.ini`、`/rules/<file>.yaml` 同端口可达。

- [ ] 读 `vite.config.ts` 现状 → 改 import + 中间件 → 删 `dev/routeKitApi.ts` → typecheck → 手动验证 → 提交 `refactor(web): dev server reuses cli hosting+api handler, drop serve:output`。

---

# Phase M2 · 配置 schema

## Task 6：`subconverterUrl` 字段 + config `mtime`

**Files:**
- Modify: `packages/core/src/types.ts:49-53`（`RouteKitConfig`）
- Modify: `packages/core/tests/`（新建或追加 `configDocument.test.ts` 往返断言）
- Modify: `apps/cli/src/serveApi.ts`（`ProjectConfigFileResult` + `readProjectConfigFile` 加 `mtime`）
- Modify: `apps/cli/tests/serveApi.test.ts`（断言 mtime）

**Interfaces — Produces:**
- `RouteKitConfig.subconverterUrl?: string`
- `ProjectConfigFileResult { yaml: string; config: RouteKitProjectConfig; mtime: number }`

- [ ] **Step 1: 写失败测试（schema 往返）**

```ts
// packages/core/tests/configDocument.test.ts
import { describe, expect, it } from "vitest";
import { parseRouteKitConfig, serializeRouteKitConfig } from "../src/configDocument.js";

describe("subconverterUrl round-trip", () => {
  it("preserves subconverterUrl across parse/serialize", () => {
    const yaml = `publishBaseUrl: http://10.0.0.3:8787
subconverterUrl: http://10.0.0.3:25500/sub
template: { output: Custom_Clash.ini }
vendorRepos: []
customProxyGroups: []
ruleSets: []
`;
    const config = parseRouteKitConfig(yaml);
    expect(config.subconverterUrl).toBe("http://10.0.0.3:25500/sub");
    expect(serializeRouteKitConfig(config)).toContain("subconverterUrl: http://10.0.0.3:25500/sub");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run packages/core/tests/configDocument.test.ts`
Expected: FAIL（`subconverterUrl` 类型不存在 → typecheck/编译失败）。

- [ ] **Step 3: 加类型** —— `packages/core/src/types.ts` 的 `RouteKitConfig`：

```ts
export interface RouteKitConfig {
  publishBaseUrl: string;
  subconverterUrl?: string;
  customProxyGroups: CustomProxyGroup[];
  ruleSets: RuleSet[];
}
```
（`parseRouteKitConfig`/`serializeRouteKitConfig` 透传整对象，无需改 configDocument.ts 逻辑——本步仅靠类型让测试通过。）

- [ ] **Step 4: 运行确认通过**

Run: `pnpm exec vitest run packages/core/tests/configDocument.test.ts`
Expected: PASS。

- [ ] **Step 5: serveApi 返回 mtime** —— 在 `apps/cli/src/serveApi.ts`：`ProjectConfigFileResult` 接口加 `mtime: number`；`readProjectConfigFile` 实现里 `stat` 配置文件取 `mtimeMs` 并入返回（用 `node:fs/promises` 的 `stat`；注入式可加可选 `statFile`，默认 `(p) => stat(p).then(s => s.mtimeMs)`）。在 `apps/cli/tests/serveApi.test.ts` 追加：读 config 的结果含 `typeof result.mtime === "number"`。

- [ ] **Step 6: 跑测试 + 提交**

Run: `pnpm exec vitest run packages/core/tests/configDocument.test.ts apps/cli/tests/serveApi.test.ts && pnpm typecheck`

```bash
git add packages/core/src/types.ts packages/core/tests/configDocument.test.ts apps/cli/src/serveApi.ts apps/cli/tests/serveApi.test.ts
git commit -m "feat: add subconverterUrl config field + config mtime in api"
```

---

# Phase M3 · 订阅尾巴

## Task 7：`buildSubconverterUrl` 加 subconverter 地址 + cache-bust

**Files:**
- Modify: `apps/web/src/subscriptions.ts`
- Modify: `apps/web/tests/subscriptions.test.ts`（无则新建）

**Interfaces — Produces:**
- `BuildSubconverterUrlInput` 增 `subconverterUrl?: string`、`configVersion?: string | number`
- `config=` 拼接 INI URL 时附 `?v=<configVersion>`（有值时）

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import { buildSubconverterUrl } from "../src/subscriptions.js";

describe("buildSubconverterUrl cache-bust + subconverterUrl", () => {
  it("uses subconverterUrl and appends ?v to config", () => {
    const url = buildSubconverterUrl({
      providers: [{ id: "a", name: "Air", url: "https://air/sub", enabled: true }],
      publishBaseUrl: "http://10.0.0.3:8787",
      templateOutput: "Custom_Clash.ini",
      subconverterUrl: "http://10.0.0.3:25500/sub",
      configVersion: 1718000000000,
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("http://10.0.0.3:25500/sub");
    expect(parsed.searchParams.get("config")).toBe(
      "http://10.0.0.3:8787/templates/Custom_Clash.ini?v=1718000000000",
    );
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/web/tests/subscriptions.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现** —— 在 `apps/web/src/subscriptions.ts`：
  - `BuildSubconverterUrlInput` 加 `subconverterUrl?: string;` 与 `configVersion?: string | number;`
  - `normalizeEndpoint` 的入参优先取 `input.subconverterUrl ?? input.endpoint`（保留 `endpoint` 兼容）
  - `templateUrl` 改为接受 `configVersion`，有值时附 `?v=`：

```ts
function templateUrl(publishBaseUrl: string, templateOutput: string, configVersion?: string | number): string {
  const base = `${publishBaseUrl.replace(/\/+$/, "")}/templates/${templateOutput}`;
  return configVersion === undefined || configVersion === "" ? base : `${base}?v=${configVersion}`;
}
```
  - `buildSubconverterUrl` 内 `endpoint.searchParams.set("config", templateUrl(input.publishBaseUrl, input.templateOutput, input.configVersion))`，并把 `normalizeEndpoint(input.subconverterUrl ?? input.endpoint)`。

- [ ] **Step 4: 运行确认通过 + 提交**

Run: `pnpm exec vitest run apps/web/tests/subscriptions.test.ts`

```bash
git add apps/web/src/subscriptions.ts apps/web/tests/subscriptions.test.ts
git commit -m "feat(web): subconverterUrl + config cache-bust in subscription url"
```

## Task 8：订阅装配组件（二维码 + 下载，B 层：先读活组件）

**Files:**
- Create: `apps/web/src/components/SubscribeAssembler.tsx`
- Create: `apps/web/tests/subscribeAssembler.test.tsx`
- Modify: `apps/web/src/components/WorkspaceRouter.tsx`（在 publish 视图渲染 SubscribeAssembler）
- Modify: `package.json`（加 `qrcode`、`@types/qrcode` 到 web 包 deps；执行 `pnpm --filter @clash-route-kit/web add qrcode && pnpm --filter @clash-route-kit/web add -D @types/qrcode`）

**Interfaces — Consumes:** `buildSubconverterUrl`（Task 7）；`GET /api/project/config` 返回的 `mtime`（Task 6）。

**布局规格：**
- 组件 props：`{ publishBaseUrl: string; templateOutput: string; subconverterUrl: string; fetcher?: Fetcher }`。
- 内部 `useState`：机场链接文本（多行，**纯内存**）、subconverter 地址输入（默认 `subconverterUrl`）、`configVersion`（`useEffect` 内 `fetcher("/api/project/config")` 取 `mtime`）、二维码 dataURL。
- 解析机场链接：复用 `parseProviderLines`（subscriptions.ts 已有）→ `buildSubconverterUrl({...})`。
- 产出区：可点击订阅 URL（`<a href={url} target="_blank" rel="noreferrer">下载 yaml</a>`）+「复制 URL」（`navigator.clipboard`）+ 二维码 `<img src={dataUrl}>`（`import QRCode from "qrcode"; QRCode.toDataURL(url).then(setDataUrl)`，在 url 变化的 `useEffect` 内，离线生成）。
- 字号/类沿用既有 `--fs-*` 与 publish 页共享类（与 PublishPanel 同语言）。

**测试点（mock）：** mock `qrcode`（`vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64,xxx" } }))`）；mock fetcher 返回 `{ mtime: 1718000000000 }`；输入一行机场链接 `provider:Air,https://air/sub` → 断言渲染的订阅 URL 含 `subconverterUrl`、`config=...%3Fv%3D1718000000000`（或解码后含 `?v=`）；二维码 `<img>` 出现。

- [ ] 读 `PublishPanel.tsx` + `WorkspaceRouter.tsx` 现状 → 写 subscribeAssembler 测试 → 建组件（机场链接内存输入 + 生成 URL + 二维码 + 复制/下载）→ 在 WorkspaceRouter 的 publish 视图挂载（传 `config.publishBaseUrl`、`config.template.output`、`config.subconverterUrl ?? "http://10.0.0.3:25500/sub"`）→ 跑测试 + typecheck → 提交 `feat(web): subscription assembler with QR + browser yaml download (issue: usable loop)`。

---

# 收尾

## Task Z：全量校验 + 文档

- [ ] Run: `pnpm typecheck && pnpm test && pnpm build && pnpm check`，全绿。
- [ ] `pnpm build`（产出 `apps/web/dist`）后 `pnpm serve`：浏览器开 `http://<host>:8787` 走查编辑器；确认 `/templates/Custom_Clash.ini` 实时反映改动、`/rules/*.yaml` 可达、订阅装配页二维码可扫、订阅 URL 点开浏览器下载 yaml。
- [ ] 更新 `CLAUDE.md`：`pnpm serve` 取代 `pnpm serve:output` 的说明；新增 serve 命令与 `--public-base`/`subconverterUrl` 说明；标注 dev/serve 共享 cli handler。
- [ ] 提交 `docs: update CLAUDE.md for single-process serve + subscription tail`。

---

## Self-Review

**1. Spec 覆盖：** §4.1 API handler 迁 cli=Task 2；§4.2 托管层=Task 3；§4.3 serve 命令=Task 4；§4.4 dev 瘦身=Task 5；§4.5 subconverterUrl + mtime=Task 6；§4.6 addVendorRepo 搬迁=Task 1；§4.7 订阅装配/二维码/cache-bust=Task 7+8。§2 决策（监听 0.0.0.0、public-base 覆盖、实时渲染、provider 落盘、纯内存机场链接、不自动 build）分别落在 Task 4(index.ts 默认 host/dist 校验)、Task 3(renderIni 覆盖 publishBaseUrl)、Task 8(内存)。§6 文件清单全覆盖。§7 里程碑 = M1/M2/M3。

**2. 占位扫描：** 各 A 层任务（1/3/4/6/7）给完整 TDD 代码与命令；B 层（5/8）按本仓库既有「变更规格 + 测试点 + 先读活组件」范式（web 活跃重构，与 2026-06-18-console-refinement 计划一致），非占位。无 TBD/TODO。

**3. 类型一致：** `addVendorRepo`、`createRouteKitApiHandler`、`createHostingHandler`/`HostingOptions`、`createServeServer`/`startServe`/`ServeOptions`、`ProjectConfigFileResult.mtime`、`buildSubconverterUrl` 的 `subconverterUrl`/`configVersion`、`RouteKitConfig.subconverterUrl` 在定义任务与消费任务间签名一致。`ServeOptions extends HostingOptions`，serve 把同一 options 同时喂给 hosting 与 api（api 只用 `ProgramOptions` 子集，兼容）。

**4. 风险确认：** serve 缺 `apps/web/dist` 时 `startServe` 抛清晰错误（Task 4 Step 3）；`/rules` 路径白名单与 traversal 校验（Task 3）；dev 与 serve 复用同一 handler，行为一致。
