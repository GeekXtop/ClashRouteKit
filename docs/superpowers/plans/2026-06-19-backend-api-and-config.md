# 后端 API + 配置 实现计划（重做计划 1/5）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Web 控制台重做提供后端支撑：上游仓库增改删 API（隐藏 vendor 路径、相对数据目录、可钉分支）、catalog 条目带 `hasChildren`（修树 bug 的数据基础）、配置换 GeekXtop fork。

**Architecture:** 沿用 `apps/cli/src/serveApi.ts` 既有范式——纯函数 + 可注入 IO（`readText`/`readDirectory`/`writeText`/`runCommand`），HTTP 由 `createRouteKitApiHandler` 薄封装。配置变换放 `packages/core`（纯函数）。测试用 vitest + 注入 fake，不碰真实磁盘。

**Tech Stack:** TypeScript（NodeNext ESM）、Node `node:fs/promises`、`yaml` 包、vitest、pnpm workspace。

> 2026-06-23 完成状态：功能目标已落地。`updateVendorRepo`/`removeVendorRepo`、vendor 增改删 API、catalog `hasChildren/root`、GeekXtop fork 配置均已在当前代码中实现；`pnpm typecheck`、`pnpm test`、`pnpm check`、`pnpm --filter @clash-route-kit/core build` 已通过。历史“确认失败”和“提交”步骤不再作为功能待办追踪。

## 2026-06-23 状态总览

- [x] Task 1：core vendor repo update/remove mutation 已实现并导出。
- [x] Task 2：serveApi vendor 输入归一化、add/update/remove helper 与 HTTP API 已接线。
- [x] Task 3：catalog entries 已返回 `hasChildren`，并扩展 `root` 以避免子类目重复显示。
- [x] Task 4：`config/routes.yaml` 已切到 `https://github.com/GeekXtop/Custom_OpenClash_Rules.git`。
- [x] 收尾校验：`pnpm typecheck`、`pnpm test`、`pnpm check`、`pnpm --filter @clash-route-kit/core build` 已通过。
- [ ] 非功能历史项：逐步提交记录未追溯；不影响实现状态。

## Global Constraints

- ESM/NodeNext：所有相对 import 必须带 `.js` 扩展名（即使源文件是 `.ts`）。
- 新增 core 导出必须在 `packages/core/src/index.ts` 显式 re-export（含类型）。
- `packages/core` 保持纯函数，**不得**有任何文件 IO。
- serve/dev 中间件链经 vite 加载的是 core 的 **dist**：本计划新增的 core 运行时导出（`updateVendorRepo`/`removeVendorRepo`）被 `serveApi` 消费，改完须跑 `pnpm --filter @clash-route-kit/core build` 更新 dist，否则 `pnpm dev`/`pnpm serve` 启动报缺导出（纯类型改动不受影响）。
- 测试位置受 `vitest.config.ts` 限定为 `packages/*/tests/**` 与 `apps/*/tests/**`。
- 提交粒度：每个 Task 末尾一次提交。

---

## 文件结构

| 文件 | 责任 | 动作 |
|---|---|---|
| `packages/core/src/configMutations.ts` | vendorRepos 纯变换（add/update/remove） | 修改 |
| `packages/core/src/index.ts` | re-export 新函数与类型 | 修改 |
| `packages/core/tests/configMutations.test.ts` | update/remove 单测 | 修改 |
| `apps/cli/src/serveApi.ts` | vendor 输入归一化 + 增改删 helper + catalog hasChildren + 路由 | 修改 |
| `apps/cli/tests/serveApi.test.ts` | 上述 helper 单测 | 修改 |
| `config/routes.yaml` | 换 GeekXtop fork | 修改 |

---

## Task 1: core — `updateVendorRepo` / `removeVendorRepo`

**Files:**
- Modify: `packages/core/src/configMutations.ts`
- Modify: `packages/core/src/index.ts:6`
- Test: `packages/core/tests/configMutations.test.ts`

**Interfaces:**
- Consumes: `RouteKitProjectConfig`, `VendorRepoConfig`（`./types.js`）；已存在 `addVendorRepo`。
- Produces:
  - `updateVendorRepo(config: RouteKitProjectConfig, name: string, patch: Partial<VendorRepoConfig>): RouteKitProjectConfig`
  - `removeVendorRepo(config: RouteKitProjectConfig, name: string): RouteKitProjectConfig`

- [x] **Step 1: 写失败测试**

在 `packages/core/tests/configMutations.test.ts` 顶部 import 行改为：

```ts
import { addVendorRepo, removeVendorRepo, updateVendorRepo } from "../src/configMutations.js";
```

在文件末尾追加：

```ts
describe("updateVendorRepo", () => {
  it("replaces fields of an existing repo by name", () => {
    const start = addVendorRepo(base, { name: "Custom", url: "https://old.git", path: "vendor/Custom" });
    const next = updateVendorRepo(start, "Custom", {
      name: "Custom",
      url: "https://github.com/GeekXtop/Custom_OpenClash_Rules.git",
      path: "vendor/Custom",
      branch: "main",
    });
    expect(next.vendorRepos.find((r) => r.name === "Custom")?.url).toBe(
      "https://github.com/GeekXtop/Custom_OpenClash_Rules.git",
    );
    expect(next.vendorRepos.find((r) => r.name === "Custom")?.branch).toBe("main");
  });
  it("throws when the repo name is not found", () => {
    expect(() => updateVendorRepo(base, "missing", { name: "missing", url: "x", path: "p" })).toThrow(/not found/);
  });
  it("rejects renaming onto another existing repo", () => {
    const start = addVendorRepo(base, { name: "Custom", url: "x", path: "vendor/Custom" });
    expect(() => updateVendorRepo(start, "Custom", { name: "dler-io", url: "x", path: "vendor/Custom" })).toThrow(/exists/);
  });
});

describe("removeVendorRepo", () => {
  it("removes a repo by name immutably", () => {
    const next = removeVendorRepo(base, "dler-io");
    expect(next.vendorRepos).toHaveLength(0);
    expect(base.vendorRepos).toHaveLength(1);
  });
  it("throws when the repo name is not found", () => {
    expect(() => removeVendorRepo(base, "missing")).toThrow(/not found/);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm exec vitest run packages/core/tests/configMutations.test.ts`
Expected: FAIL（`updateVendorRepo`/`removeVendorRepo` is not a function / 未导出）

- [x] **Step 3: 实现两个函数**

在 `packages/core/src/configMutations.ts` 末尾追加：

```ts
export function updateVendorRepo(
  config: RouteKitProjectConfig,
  name: string,
  patch: Partial<VendorRepoConfig>,
): RouteKitProjectConfig {
  const index = config.vendorRepos.findIndex((item) => item.name === name);
  if (index === -1) {
    throw new Error(`vendor repo "${name}" not found`);
  }
  const next: VendorRepoConfig = { ...config.vendorRepos[index]!, ...patch };
  const nextName = next.name.trim();
  if (!nextName) {
    throw new Error("vendor repo name is required");
  }
  next.name = nextName;
  if (config.vendorRepos.some((item, i) => i !== index && item.name === nextName)) {
    throw new Error(`vendor repo "${nextName}" already exists`);
  }
  if (config.vendorRepos.some((item, i) => i !== index && item.path === next.path)) {
    throw new Error(`vendor repo path already exists: ${next.path}`);
  }
  const vendorRepos = [...config.vendorRepos];
  vendorRepos[index] = next;
  return { ...config, vendorRepos };
}

export function removeVendorRepo(config: RouteKitProjectConfig, name: string): RouteKitProjectConfig {
  if (!config.vendorRepos.some((item) => item.name === name)) {
    throw new Error(`vendor repo "${name}" not found`);
  }
  return { ...config, vendorRepos: config.vendorRepos.filter((item) => item.name !== name) };
}
```

在 `packages/core/src/index.ts` 第 6 行改为：

```ts
export { addVendorRepo, removeVendorRepo, updateVendorRepo } from "./configMutations.js";
```

- [x] **Step 4: 运行测试，确认通过**

Run: `pnpm exec vitest run packages/core/tests/configMutations.test.ts`
Expected: PASS（5 个新用例全过）

- [ ] **Step 5: 构建 core dist（供 serve/dev）+ 提交**

```bash
pnpm --filter @clash-route-kit/core build
git add packages/core/src/configMutations.ts packages/core/src/index.ts packages/core/tests/configMutations.test.ts
git commit -m "feat(core): add updateVendorRepo and removeVendorRepo mutations"
```

---

## Task 2: serveApi — vendor 输入归一化 + 增改删 helper + API

**Files:**
- Modify: `apps/cli/src/serveApi.ts`
- Test: `apps/cli/tests/serveApi.test.ts`

**Interfaces:**
- Consumes: `addVendorRepo`/`updateVendorRepo`/`removeVendorRepo`（core）；`readProjectConfigFile`/`writeProjectConfigFile`（同文件已存在）。
- Produces:
  - `interface VendorRepoInput { name: string; url: string; branch?: string; catalog?: { reldir: string; kind: "domain-list" | "list-dir" | "provider-yaml" | "ini-template" } }`
  - `normalizeVendorRepoInput(input: VendorRepoInput): VendorRepoConfig`（派生 `path = vendor/<name>`、`catalog.dir = vendor/<name>/<reldir>`）
  - `addProjectVendorRepo(options & { input }): Promise<ProjectConfigFileResult>`
  - `updateProjectVendorRepo(options & { name; input }): Promise<ProjectConfigFileResult>`
  - `removeProjectVendorRepo(options & { name }): Promise<ProjectConfigFileResult>`
  - HTTP：`POST /api/vendor/add`（body `{input}`）、`POST /api/vendor/update`（body `{name, input}`）、`POST /api/vendor/remove`（body `{name}`）

- [x] **Step 1: 写失败测试**

在 `apps/cli/tests/serveApi.test.ts` 的 import 块加入：

```ts
import {
  addProjectVendorRepo,
  normalizeVendorRepoInput,
  removeProjectVendorRepo,
  updateProjectVendorRepo,
} from "../src/serveApi.js";
import type { VendorRepoConfig } from "@clash-route-kit/core";
```

文件末尾追加：

```ts
describe("vendor repo mutations over project config", () => {
  const root = path.resolve("fixture-repo");
  const configFile = "config/routes.yaml";
  const yamlWith = (repos: string) =>
    [
      "publishBaseUrl: http://127.0.0.1:8787",
      "template:",
      "  output: Custom_Clash.ini",
      repos,
      "customProxyGroups: []",
      "ruleSets: []",
      "",
    ].join("\n");

  it("normalizes input into a full repo with derived path and catalog dir", () => {
    const repo = normalizeVendorRepoInput({
      name: "GeekX",
      url: "https://x.git",
      branch: "main",
      catalog: { reldir: "rule", kind: "list-dir" },
    });
    expect(repo).toEqual<VendorRepoConfig>({
      name: "GeekX",
      url: "https://x.git",
      path: "vendor/GeekX",
      branch: "main",
      catalog: { dir: "vendor/GeekX/rule", kind: "list-dir" },
    });
  });

  it("omits branch and catalog when not provided", () => {
    const repo = normalizeVendorRepoInput({ name: "Bare", url: "https://x.git" });
    expect(repo).toEqual<VendorRepoConfig>({ name: "Bare", url: "https://x.git", path: "vendor/Bare" });
  });

  it("adds a repo by writing the serialized config", async () => {
    let written = "";
    const result = await addProjectVendorRepo({
      root,
      configFile,
      input: { name: "GeekX", url: "https://x.git", catalog: { reldir: "rule", kind: "list-dir" } },
      readText: async () => yamlWith("vendorRepos: []"),
      writeText: async (_p, text) => {
        written = text;
      },
    });
    expect(result.config.vendorRepos.at(-1)?.name).toBe("GeekX");
    expect(result.config.vendorRepos.at(-1)?.catalog?.dir).toBe("vendor/GeekX/rule");
    expect(written).toContain("GeekX");
  });

  it("updates an existing repo url", async () => {
    const result = await updateProjectVendorRepo({
      root,
      configFile,
      name: "Custom",
      input: { name: "Custom", url: "https://github.com/GeekXtop/Custom_OpenClash_Rules.git", branch: "main", catalog: { reldir: "rule", kind: "list-dir" } },
      readText: async () =>
        yamlWith(
          ["vendorRepos:", "  - name: Custom", "    url: https://old.git", "    path: vendor/Custom"].join("\n"),
        ),
      writeText: async () => {},
    });
    expect(result.config.vendorRepos[0]?.url).toBe("https://github.com/GeekXtop/Custom_OpenClash_Rules.git");
    expect(result.config.vendorRepos[0]?.catalog?.dir).toBe("vendor/Custom/rule");
  });

  it("removes a repo by name", async () => {
    const result = await removeProjectVendorRepo({
      root,
      configFile,
      name: "Custom",
      readText: async () =>
        yamlWith(["vendorRepos:", "  - name: Custom", "    url: x", "    path: vendor/Custom"].join("\n")),
      writeText: async () => {},
    });
    expect(result.config.vendorRepos).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm exec vitest run apps/cli/tests/serveApi.test.ts`
Expected: FAIL（`normalizeVendorRepoInput` 等未导出）

- [x] **Step 3: 实现归一化与 helper**

在 `apps/cli/src/serveApi.ts` 顶部 import 块，把第 21 行：

```ts
import { addVendorRepo } from "@clash-route-kit/core";
```

改为：

```ts
import { addVendorRepo, removeVendorRepo, updateVendorRepo } from "@clash-route-kit/core";
import type { VendorRepoConfig } from "@clash-route-kit/core";
```

在 `addVendorRepo` 当前被使用的 `/api/vendor/add` handler 之前（建议紧接 `readGitRemote` 定义之后、`formatGenerateOutput` 之前）插入：

```ts
export interface VendorRepoInput {
  name: string;
  url: string;
  branch?: string;
  catalog?: { reldir: string; kind: "domain-list" | "list-dir" | "provider-yaml" | "ini-template" };
}

export function normalizeVendorRepoInput(input: VendorRepoInput): VendorRepoConfig {
  const name = input.name.trim();
  if (!name) {
    throw new Error("vendor repo name is required");
  }
  const repo: VendorRepoConfig = { name, url: input.url.trim(), path: `vendor/${name}` };
  if (input.branch?.trim()) {
    repo.branch = input.branch.trim();
  }
  const reldir = input.catalog?.reldir.trim().replace(/^\/+|\/+$/g, "");
  if (input.catalog && reldir) {
    repo.catalog = { dir: `vendor/${name}/${reldir}`, kind: input.catalog.kind };
  }
  return repo;
}

export interface VendorRepoMutationOptions extends ProgramOptions {
  readText?: ReadText;
  writeText?: WriteText;
  statMtime?: (filePath: string) => Promise<number>;
}

export async function addProjectVendorRepo(
  options: VendorRepoMutationOptions & { input: VendorRepoInput },
): Promise<ProjectConfigFileResult> {
  const { config } = await readProjectConfigFile(options);
  return writeProjectConfigFile({ ...options, config: addVendorRepo(config, normalizeVendorRepoInput(options.input)) });
}

export async function updateProjectVendorRepo(
  options: VendorRepoMutationOptions & { name: string; input: VendorRepoInput },
): Promise<ProjectConfigFileResult> {
  const { config } = await readProjectConfigFile(options);
  return writeProjectConfigFile({
    ...options,
    config: updateVendorRepo(config, options.name, normalizeVendorRepoInput(options.input)),
  });
}

export async function removeProjectVendorRepo(
  options: VendorRepoMutationOptions & { name: string },
): Promise<ProjectConfigFileResult> {
  const { config } = await readProjectConfigFile(options);
  return writeProjectConfigFile({ ...options, config: removeVendorRepo(config, options.name) });
}
```

- [x] **Step 4: 运行测试，确认通过**

Run: `pnpm exec vitest run apps/cli/tests/serveApi.test.ts`
Expected: PASS（5 个新用例全过；旧用例不受影响）

- [x] **Step 5: 接线 HTTP 路由**

在 `apps/cli/src/serveApi.ts` 的 `createRouteKitApiHandler` 内，将现有 `/api/vendor/add` 整段（约 655–681 行）替换为下面三段：

```ts
    if (url.pathname === "/api/vendor/add" || url.pathname === "/api/vendor/update") {
      if (request.method !== "POST") {
        writeJson(response, 405, { ok: false, output: "Method not allowed" });
        return;
      }
      const isUpdate = url.pathname === "/api/vendor/update";
      let body = "";
      request.on("data", (chunk: Buffer) => {
        body += chunk.toString("utf8");
      });
      request.on("end", () => {
        void Promise.resolve()
          .then(() => JSON.parse(body) as { name?: string; input?: VendorRepoInput })
          .then((payload) => {
            if (!payload.input) {
              throw new Error("Missing input");
            }
            if (isUpdate) {
              if (!payload.name) {
                throw new Error("Missing name");
              }
              return updateProjectVendorRepo({ ...options, name: payload.name, input: payload.input });
            }
            return addProjectVendorRepo({ ...options, input: payload.input });
          })
          .then((result) => writeJson(response, 200, result))
          .catch((error: unknown) => {
            writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) });
          });
      });
      return;
    }

    if (url.pathname === "/api/vendor/remove") {
      if (request.method !== "POST") {
        writeJson(response, 405, { ok: false, output: "Method not allowed" });
        return;
      }
      let body = "";
      request.on("data", (chunk: Buffer) => {
        body += chunk.toString("utf8");
      });
      request.on("end", () => {
        void Promise.resolve()
          .then(() => JSON.parse(body) as { name?: string })
          .then((payload) => {
            if (!payload.name) {
              throw new Error("Missing name");
            }
            return removeProjectVendorRepo({ ...options, name: payload.name });
          })
          .then((result) => writeJson(response, 200, result))
          .catch((error: unknown) => {
            writeJson(response, 400, { ok: false, output: error instanceof Error ? error.message : String(error) });
          });
      });
      return;
    }
```

同时删除现在顶部 `import { addVendorRepo } ...` 之外对旧 add handler 里 `addVendorRepo` 的直接调用（已被 `addProjectVendorRepo` 取代）。`addVendorRepo` 仍由 `addProjectVendorRepo` 内部使用，保留 import。

- [ ] **Step 6: 类型检查 + 构建 + 提交**

```bash
pnpm -r typecheck
pnpm --filter @clash-route-kit/core build
git add apps/cli/src/serveApi.ts apps/cli/tests/serveApi.test.ts
git commit -m "feat(cli): vendor repo add/update/remove API with hidden vendor path"
```

Expected typecheck：通过（无报错）

---

## Task 3: serveApi — catalog 条目带 `hasChildren`

**Files:**
- Modify: `apps/cli/src/serveApi.ts`
- Test: `apps/cli/tests/serveApi.test.ts`

**Interfaces:**
- Consumes: `parseDomainListEntry`（core，已 import）；`listCatalogEntries`/`catalogOrigin`/`catalogDataDir`（同文件已存在）。
- Produces:
  - `interface CatalogEntryMeta { name: string; hasChildren: boolean }`
  - `listCatalogEntriesWithMeta(options: CatalogEntriesOptions & { readText?: ReadText }): Promise<CatalogEntryMeta[]>`
  - `/api/catalog/entries` 响应改为 `{ entries: CatalogEntryMeta[] }`

- [x] **Step 1: 写失败测试**

在 `apps/cli/tests/serveApi.test.ts` import 块加入 `listCatalogEntriesWithMeta`（并入已有 `../src/serveApi.js` import）。在 `catalog browse helpers` describe 内追加：

```ts
  it("computes hasChildren for domain-list entries from include lines", async () => {
    const files: Record<string, string> = {
      "category-acg": "include:acg-cn\nnicovideo.jp\n",
      "acg-cn": "bilibili.com\n",
      openai: "openai.com\n",
    };
    const entries = await listCatalogEntriesWithMeta({
      root,
      configFile: "config/routes.yaml",
      origin: "domain-list-community",
      readDirectory: async () => ["category-acg", "acg-cn", "openai", "README.md"],
      readText: async (filePath: string) => files[filePath.split(/[\\/]/).pop() ?? ""] ?? "",
    });
    const byName = Object.fromEntries(entries.map((e) => [e.name, e.hasChildren]));
    expect(byName["category-acg"]).toBe(true);
    expect(byName["acg-cn"]).toBe(false);
    expect(byName["openai"]).toBe(false);
    expect(byName["README.md"]).toBeUndefined(); // 含 "." 被过滤
  });

  it("marks list-dir entries hasChildren=false without reading files", async () => {
    const entries = await listCatalogEntriesWithMeta({
      root,
      configFile: "config/routes.yaml",
      origin: "ACL4SSR",
      readDirectory: async () => ["BanAD.list", "Apple.list"],
      readText: async () => {
        throw new Error("should not read list-dir files");
      },
    });
    expect(entries).toEqual([
      { name: "Apple", hasChildren: false },
      { name: "BanAD", hasChildren: false },
    ]);
  });
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm exec vitest run apps/cli/tests/serveApi.test.ts`
Expected: FAIL（`listCatalogEntriesWithMeta` 未导出）

- [x] **Step 3: 实现**

在 `apps/cli/src/serveApi.ts` 的 `listCatalogEntries` 之后追加：

```ts
export interface CatalogEntryMeta {
  name: string;
  hasChildren: boolean;
}

export async function listCatalogEntriesWithMeta(
  options: CatalogEntriesOptions & { readText?: ReadText },
): Promise<CatalogEntryMeta[]> {
  const def = catalogOrigin(options.origin, options.origins);
  const names = await listCatalogEntries(options);
  if (def.kind !== "domain-list") {
    return names.map((name) => ({ name, hasChildren: false }));
  }
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  const dir = catalogDataDir(options, options.origin);
  return Promise.all(
    names.map(async (name) => {
      try {
        const info = parseDomainListEntry(await readText(path.join(dir, name)));
        return { name, hasChildren: info.includes.length > 0 };
      } catch {
        return { name, hasChildren: false };
      }
    }),
  );
}
```

> 性能注记：domain-list 浏览时会逐条读取文件判定 `hasChildren`（domain-list-community ~1500 个小文件）。本地磁盘可接受；后续可加「按数据目录 mtime 缓存」优化（不在本计划）。

- [x] **Step 4: 运行测试，确认通过**

Run: `pnpm exec vitest run apps/cli/tests/serveApi.test.ts`
Expected: PASS

- [x] **Step 5: 切换 `/api/catalog/entries` 响应**

在 `createRouteKitApiHandler` 内，把 `/api/catalog/entries` 段（约 604–613 行）的：

```ts
        .then(({ config }) => listCatalogEntries({ ...options, origin, origins: catalogOriginsFromConfig(config) }))
        .then((entries) => writeJson(response, 200, { entries }))
```

改为：

```ts
        .then(({ config }) =>
          listCatalogEntriesWithMeta({ ...options, origin, origins: catalogOriginsFromConfig(config) }),
        )
        .then((entries) => writeJson(response, 200, { entries }))
```

- [ ] **Step 6: 类型检查 + 构建 + 提交**

```bash
pnpm -r typecheck
pnpm --filter @clash-route-kit/core build
git add apps/cli/src/serveApi.ts apps/cli/tests/serveApi.test.ts
git commit -m "feat(cli): catalog entries carry hasChildren for tree rendering"
```

---

## Task 4: config — 换 GeekXtop fork

**Files:**
- Modify: `config/routes.yaml`

- [x] **Step 1: 改 url**

把 `config/routes.yaml` 中 `name: Aethersailor` 那条的：

```yaml
    url: https://github.com/Aethersailor/Custom_OpenClash_Rules.git
```

改为：

```yaml
    url: https://github.com/GeekXtop/Custom_OpenClash_Rules.git
```

其余字段（`name`、`path: vendor/Custom_OpenClash_Rules`、`branch: main`、`catalog`）保持不变。

- [x] **Step 2: 验证**

Run: `git grep -n "GeekXtop/Custom_OpenClash_Rules" config/routes.yaml`
Expected: 命中一行；不再出现 `Aethersailor/Custom_OpenClash_Rules.git`。

- [ ] **Step 3: 提交**

```bash
git add config/routes.yaml
git commit -m "chore(config): point Custom_OpenClash_Rules to GeekXtop fork"
```

---

## 收尾校验（全 Task 完成后）

- [ ] Run: `pnpm test`　Expected: 全绿
- [ ] Run: `pnpm typecheck`　Expected: 无错误
- [ ] Run: `pnpm check`　Expected: 退出码 0（策略组引用完整）

## Self-Review 记录

- **Spec 覆盖**：本计划对应 spec §6.3（vendor CRUD、hasChildren、隐藏 vendor 路径、相对数据目录）、§10#2（GeekXtop）、§11（后端改动）。catalog「按源容错」spec 已由现有代码 `listCatalogEntries` 的 try/catch 返回 `[]` 覆盖（serveApi.ts:255-260），本计划不重复。`CATALOG_ORIGINS` 作为种子保留（spec §2/§6.3 明确允许「仅用于首次种子」）。
- **占位符**：无 TBD/TODO；每步含完整代码与命令。
- **类型一致性**：`VendorRepoInput`/`normalizeVendorRepoInput`/`addProjectVendorRepo`/`updateProjectVendorRepo`/`removeProjectVendorRepo`/`CatalogEntryMeta`/`listCatalogEntriesWithMeta` 在定义与调用处签名一致。
