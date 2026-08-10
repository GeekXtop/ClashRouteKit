# Local Server and CLI Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建 `@clash-route-kit/local-server` 作为唯一 Node IO/工作区适配层，拆分当前 CLI 巨型程序与 HTTP handler，使 CLI 成为薄命令适配器，并消除 Web 对 CLI 源码的直接依赖。

**Architecture:** Local Server 依赖 Core，提供项目仓库、事务式文件写入、本地设置、运行时项目装载、工作区诊断、生成、Catalog/Vendor/规则文件、Git 和 HTTP 组合；CLI 只解析命令和打印结果，Vite 只导入 Local Server 公开入口。项目作者配置与本地设置分别持久化，迁移应用通过同目录临时文件和可回滚替换保证失败不留下半份文件。

**Tech Stack:** pnpm 9.1.4 workspace、Node.js 22 原生 `fs/promises`/`http`/`child_process`/`crypto`、TypeScript 5.8 strict NodeNext、YAML 2.8、Vitest 3.2、Vite 7。

## Global Constraints

- `packages/local-server` 是唯一可直接导入 `node:*`、执行 Git、访问文件系统或创建 HTTP handler 的领域包。
- Core 继续保持纯 TypeScript；Local Server 只能通过 `@clash-route-kit/core` 公开入口消费领域逻辑。
- CLI 依赖 Core 与 Local Server，不再自行 `YAML.parse`、读取 provider、同步 vendor、生成文件或复制校验逻辑。
- Web 运行时代码不依赖 Local Server；仅 `apps/web/vite.config.ts` 在 Node 构建上下文导入其公开 handler。
- `apps/web/vite.config.ts` 不得相对导入 `apps/cli/src`。
- Web 仍通过 HTTP API 访问本地工作区，不把文件路径和 Git 实现带进浏览器 bundle。
- 项目配置默认路径仍为 `config/routes.yaml`；本地设置固定为 `.clashroutekit/local.yaml` 并加入 `.gitignore`。
- 本地设置只允许 `serve.host`、`serve.port`、`serve.publicBaseUrl` 和 `subconverterUrl`；订阅 URL/Token 字段必须被严格 parser 拒绝。
- 本地设置优先级固定为 CLI 参数 > 环境变量 > `.clashroutekit/local.yaml` > 默认值。
- 默认值固定为 `host: 0.0.0.0`、`port: 8787`、`publicBaseUrl: http://127.0.0.1:8787`、`subconverterUrl: http://127.0.0.1:25500/sub`。
- 项目保存必须校验 revision，防止覆盖磁盘上由其它进程产生的新版本。
- 单文件保存先在目标同目录写临时文件，再用原子 rename 替换；失败清理临时文件并保留原目标内容。
- v1 → v2 迁移同时涉及项目配置和本地设置时，先完成所有校验和临时写入，再替换目标；任一步失败都恢复原文件。
- 迁移不得静默覆盖已有本地设置；调用方必须明确选择 `preserve-existing` 或 `use-migrated`。
- HTTP handler 只做请求解析、use case 调用和响应映射，不包含 Catalog、Git、YAML 或生成业务逻辑。
- 上游同步失败按仓库隔离，返回每个仓库的成功/失败结果。
- v1 与 v2 都可读取；v1 继续支持 `check/generate/serve`，但只有显式迁移会写成 v2。
- 保留现有 HTTP 路径兼容到 Web 工作流计划完成；新增 `/api/project/snapshot`，旧 `/api/project/config` 暂时代理到同一仓库。
- 所有新函数必须可注入文件、命令或 fetch 适配器，以便 Vitest 不调用真实 GitHub 或修改仓库。
- 修改使用 `apply_patch`；不删除或覆盖用户现有配置、规则或 `.agents` 修改。

---

## File Structure

### Package and public contracts

- Create: `packages/local-server/package.json` — workspace package metadata and Core/YAML dependencies。
- Create: `packages/local-server/tsconfig.json` — composite NodeNext build config。
- Create: `packages/local-server/src/index.ts` — only public exports。
- Create: `packages/local-server/src/contracts.ts` — snapshot, local settings, actions and HTTP DTOs。
- Modify: `pnpm-workspace.yaml` — already covers `packages/*`; no content change expected。
- Modify: `tsconfig.json` — add Local Server project reference before CLI/Web。
- Modify: `vitest.config.ts` — add development alias for `@clash-route-kit/local-server`。
- Modify: `apps/cli/package.json` — add Local Server dependency。
- Modify: `apps/web/package.json` — add Local Server dependency for Vite config。

### Config repository and local settings

- Create: `packages/local-server/src/config/atomicFiles.ts` — atomic single-file and rollback-capable multi-file replacement。
- Create: `packages/local-server/src/config/projectRepository.ts` — snapshot read/save/migration and revision checks。
- Create: `packages/local-server/src/config/localSettings.ts` — strict local parser, serializer and precedence resolver。
- Create: `packages/local-server/tests/atomicFiles.test.ts`。
- Create: `packages/local-server/tests/projectRepository.test.ts`。
- Create: `packages/local-server/tests/localSettings.test.ts`。
- Modify: `.gitignore` — add `.clashroutekit/local.yaml`。

### Runtime loading, validation and generation

- Create: `packages/local-server/src/config/loadExecutableProject.ts` — v1/v2 read, validate, normalize and runtime composition。
- Create: `packages/local-server/src/validation/workspaceValidation.ts` — file/vendor/GEOSITE checks from phase A CLI module。
- Create: `packages/local-server/src/generate/generateOutputs.ts` — template/provider/report filesystem generation。
- Create: `packages/local-server/tests/loadExecutableProject.test.ts`。
- Create: `packages/local-server/tests/workspaceValidation.test.ts`。
- Create: `packages/local-server/tests/generateOutputs.test.ts`。

### Catalog, vendor and rule files

- Create: `packages/local-server/src/catalog/origins.ts` — config-derived Catalog origins。
- Create: `packages/local-server/src/catalog/indexCatalog.ts` — list/search/read/template behavior。
- Create: `packages/local-server/src/vendor/syncVendor.ts` — isolated clone/pull results。
- Create: `packages/local-server/src/rules/ruleFileRepository.ts` — safe `config/rules/*.list` CRUD。
- Create: `packages/local-server/tests/catalog.test.ts`。
- Create: `packages/local-server/tests/syncVendor.test.ts`。
- Create: `packages/local-server/tests/ruleFileRepository.test.ts`。

### Git and HTTP

- Create: `packages/local-server/src/git/gitRepository.ts` — status/remote/stage/commit/push adapter。
- Create: `packages/local-server/tests/gitRepository.test.ts`。
- Create: `packages/local-server/src/http/httpTypes.ts` — route contract and JSON helpers。
- Create: `packages/local-server/src/http/projectRoutes.ts`。
- Create: `packages/local-server/src/http/catalogRoutes.ts`。
- Create: `packages/local-server/src/http/ruleFileRoutes.ts`。
- Create: `packages/local-server/src/http/actionRoutes.ts`。
- Create: `packages/local-server/src/http/gitRoutes.ts`。
- Create: `packages/local-server/src/http/createApiHandler.ts` — compose focused routes。
- Create: `packages/local-server/src/http/createHostingHandler.ts` — local template/rule hosting。
- Create: `packages/local-server/tests/httpRoutes.test.ts`。

### CLI and Vite migration

- Modify: `apps/cli/src/program.ts` — thin compatibility exports over Local Server use cases。
- Modify: `apps/cli/src/index.ts` — options/command parsing and output only。
- Modify: `apps/cli/src/serve.ts` — compose Local Server handlers。
- Delete: `apps/cli/src/serveApi.ts`。
- Delete: `apps/cli/src/serveHosting.ts`。
- Move behavior tests from: `apps/cli/tests/serveApi.test.ts`, `apps/cli/tests/serveHosting.test.ts` to focused Local Server tests above。
- Modify: `apps/cli/tests/cli.test.ts` — CLI adapter/output behavior only。
- Modify: `apps/cli/tests/serve.test.ts` — server composition only。
- Modify: `apps/web/vite.config.ts` — import public Local Server handlers。
- Modify: `apps/web/tests/viteConfig.test.ts` — assert package boundary。

---

### Task 1: Scaffold the Local Server package and public DTO contracts

**Files:**

- Create: `packages/local-server/package.json`
- Create: `packages/local-server/tsconfig.json`
- Create: `packages/local-server/src/contracts.ts`
- Create: `packages/local-server/src/index.ts`
- Create: `packages/local-server/tests/contracts.test.ts`
- Modify: `tsconfig.json`
- Modify: `vitest.config.ts`
- Modify: `apps/cli/package.json`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces: `ProjectSnapshot`, `SaveProjectInput`, `ApplyMigrationInput`.
- Produces: `LocalSettings`, `ResolvedLocalSettings`, `ResolvedSettingSource`.
- Produces: `RouteKitAction`, `RouteKitActionResult`.
- Establishes: public package name `@clash-route-kit/local-server`.

- [ ] **Step 1: Write the contract import RED test**

Create `packages/local-server/tests/contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  ApplyMigrationInput,
  ProjectSnapshot,
  ResolvedLocalSettings,
  RouteKitActionResult,
} from "../src/index.js";

describe("local-server public contracts", () => {
  it("keeps project, runtime and action states discriminated", () => {
    const snapshot: ProjectSnapshot = { state: "missing", diagnostics: [] };
    const settings: ResolvedLocalSettings = {
      serve: {
        host: "0.0.0.0",
        port: 8787,
        publicBaseUrl: "http://127.0.0.1:8787",
      },
      subconverterUrl: "http://127.0.0.1:25500/sub",
      sources: {
        host: "default",
        port: "default",
        publicBaseUrl: "default",
        subconverterUrl: "default",
      },
    };
    const migration: ApplyMigrationInput = {
      expectedRevision: "abc",
      resolutions: [],
      localSettingsPolicy: "preserve-existing",
    };
    const action: RouteKitActionResult = {
      action: "check",
      ok: true,
      output: "[check] ok",
      diagnostics: [],
    };

    expect(snapshot.state).toBe("missing");
    expect(settings.serve.port).toBe(8787);
    expect(migration.localSettingsPolicy).toBe("preserve-existing");
    expect(action.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
pnpm exec vitest run packages/local-server/tests/contracts.test.ts
```

Expected: FAIL because the package files do not exist.

- [ ] **Step 3: Create package metadata and TypeScript reference**

Create `packages/local-server/package.json`:

```json
{
  "name": "@clash-route-kit/local-server",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "development": "./src/index.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@clash-route-kit/core": "workspace:*",
    "yaml": "^2.8.0"
  }
}
```

Create `packages/local-server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "references": [{ "path": "../core" }],
  "include": ["src/**/*.ts"]
}
```

Add `{ "path": "./packages/local-server" }` after Core in root `tsconfig.json`. Use `apply_patch` to add the following exact dependency entry under `dependencies` in both `apps/cli/package.json` and `apps/web/package.json`:

```json
"@clash-route-kit/local-server": "workspace:*"
```

Then update only the lockfile from the edited manifests:

```powershell
pnpm install --lockfile-only
```

Expected: only the two package manifests and `pnpm-lock.yaml` change.

- [ ] **Step 4: Define exact public contracts**

Create `packages/local-server/src/contracts.ts`:

```ts
import type {
  AuthorProjectConfig,
  Diagnostic,
  MigrationResolution,
  RouteKitProjectConfig,
} from "@clash-route-kit/core";

export type ProjectSnapshot =
  | { state: "missing"; diagnostics: Diagnostic[] }
  | { state: "invalid"; revision: string; yaml: string; diagnostics: Diagnostic[] }
  | {
      state: "legacy";
      revision: string;
      yaml: string;
      config: RouteKitProjectConfig;
      diagnostics: Diagnostic[];
    }
  | {
      state: "ready";
      revision: string;
      yaml: string;
      config: AuthorProjectConfig;
      diagnostics: Diagnostic[];
    };

export interface SaveProjectInput {
  expectedRevision?: string;
  config: AuthorProjectConfig;
}

export interface ApplyMigrationInput {
  expectedRevision: string;
  resolutions: MigrationResolution[];
  localSettingsPolicy: "preserve-existing" | "use-migrated";
}

export interface LocalSettings {
  serve?: {
    host?: string;
    port?: number;
    publicBaseUrl?: string;
  };
  subconverterUrl?: string;
}

export type ResolvedSettingSource = "cli" | "env" | "local" | "default";

export interface ResolvedLocalSettings {
  serve: {
    host: string;
    port: number;
    publicBaseUrl: string;
  };
  subconverterUrl: string;
  sources: {
    host: ResolvedSettingSource;
    port: ResolvedSettingSource;
    publicBaseUrl: ResolvedSettingSource;
    subconverterUrl: ResolvedSettingSource;
  };
}

export type RouteKitAction =
  | "check"
  | "generate"
  | "sync-vendor"
  | "git-status"
  | "git-commit"
  | "git-push";

export interface RouteKitActionResult {
  action: RouteKitAction;
  ok: boolean;
  output: string;
  diagnostics?: Diagnostic[];
}
```

Create `packages/local-server/src/index.ts` exporting these types.

- [ ] **Step 5: Add Vitest alias and run GREEN**

Add to `vitest.config.ts` aliases:

```ts
"@clash-route-kit/local-server": fileURLToPath(
  new URL("./packages/local-server/src/index.ts", import.meta.url),
),
```

Run:

```powershell
pnpm exec vitest run packages/local-server/tests/contracts.test.ts
pnpm --filter @clash-route-kit/local-server typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/local-server pnpm-lock.yaml tsconfig.json vitest.config.ts apps/cli/package.json apps/web/package.json
git commit -m "feat: scaffold local server package"
```

### Task 2: Implement atomic project/config repositories and local settings precedence

**Files:**

- Create: `packages/local-server/src/config/atomicFiles.ts`
- Create: `packages/local-server/src/config/projectRepository.ts`
- Create: `packages/local-server/src/config/localSettings.ts`
- Create: `packages/local-server/tests/atomicFiles.test.ts`
- Create: `packages/local-server/tests/projectRepository.test.ts`
- Create: `packages/local-server/tests/localSettings.test.ts`
- Modify: `packages/local-server/src/index.ts`
- Modify: `.gitignore`

**Interfaces:**

- Produces: `atomicReplaceFile(target, content, io?)`.
- Produces: `atomicReplaceFiles(changes, io?)` with rollback.
- Produces: `ProjectRepository` and `createProjectRepository(options)`.
- Produces: `parseLocalSettings`, `serializeLocalSettings`, `readLocalSettings`, `resolveLocalSettings`.
- Produces: `ProjectRevisionError` and `ProjectWriteError` with diagnostics.

- [ ] **Step 1: Write atomic failure and rollback tests**

Create `packages/local-server/tests/atomicFiles.test.ts` using a fake in-memory IO adapter:

```ts
import { describe, expect, it } from "vitest";
import { atomicReplaceFile, atomicReplaceFiles } from "../src/index.js";

function memoryIo(initial: Record<string, string>, failRenameTarget?: string) {
  const files = new Map(Object.entries(initial));
  return {
    files,
    io: {
      mkdir: async () => {},
      writeFile: async (file: string, content: string) => { files.set(file, content); },
      readFile: async (file: string) => {
        const value = files.get(file);
        if (value === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        return value;
      },
      rename: async (from: string, to: string) => {
        if (to === failRenameTarget) throw new Error(`rename failed: ${to}`);
        const value = files.get(from);
        if (value === undefined) throw new Error(`missing ${from}`);
        files.set(to, value);
        files.delete(from);
      },
      rm: async (file: string) => { files.delete(file); },
      access: async (file: string) => {
        if (!files.has(file)) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      },
    },
  };
}

it("keeps the original single file when replacement rename fails", async () => {
  const state = memoryIo({ "C:/repo/routes.yaml": "old" }, "C:/repo/routes.yaml");
  await expect(atomicReplaceFile("C:/repo/routes.yaml", "new", state.io)).rejects.toThrow("rename failed");
  expect(state.files.get("C:/repo/routes.yaml")).toBe("old");
});

it("rolls back the first target when the second target replacement fails", async () => {
  const state = memoryIo({
    "C:/repo/routes.yaml": "old-routes",
    "C:/repo/local.yaml": "old-local",
  }, "C:/repo/local.yaml");
  await expect(atomicReplaceFiles([
    { target: "C:/repo/routes.yaml", content: "new-routes" },
    { target: "C:/repo/local.yaml", content: "new-local" },
  ], state.io)).rejects.toThrow();
  expect(state.files.get("C:/repo/routes.yaml")).toBe("old-routes");
  expect(state.files.get("C:/repo/local.yaml")).toBe("old-local");
});
```

- [ ] **Step 2: Write project repository state/revision tests**

Create `packages/local-server/tests/projectRepository.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createProjectRepository } from "../src/index.js";

it("returns missing, invalid, legacy and ready snapshots explicitly", async () => {
  const values = new Map<string, string>();
  const repository = createProjectRepository({
    root: "C:/repo",
    configFile: "config/routes.yaml",
    readText: async (file) => {
      const value = values.get(file);
      if (value === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return value;
    },
    replaceFiles: async (changes) => {
      for (const change of changes) values.set(change.target, change.content);
    },
  });

  await expect(repository.read()).resolves.toEqual({ state: "missing", diagnostics: [] });
  values.set("C:\\repo\\config\\routes.yaml", "schemaVersion: 2\nproxyGroups: 42\n");
  expect((await repository.read()).state).toBe("invalid");
});

it("rejects stale revisions before writing", async () => {
  const writes: unknown[] = [];
  const repository = createProjectRepository({
    root: "C:/repo",
    configFile: "config/routes.yaml",
    readText: async () => "schemaVersion: 2\nproject: { template: { output: X.ini } }\nmemberSets: {}\nproxyGroups: []\nroutes: []\nruleProviders: []\nvendorRepos: []\n",
    replaceFiles: async (changes) => { writes.push(changes); },
  });
  await expect(repository.save({
    expectedRevision: "stale",
    config: {
      schemaVersion: 2,
      project: { template: { output: "X.ini" } },
      memberSets: {},
      proxyGroups: [],
      routes: [],
      ruleProviders: [],
      vendorRepos: [],
    },
  })).rejects.toMatchObject({ name: "ProjectRevisionError" });
  expect(writes).toEqual([]);
});
```

Use `path.resolve` in the implementation and derive the test key with `path.resolve("C:/repo", "config/routes.yaml")` to avoid hard-coding slash behavior.

- [ ] **Step 3: Write strict local settings and precedence tests**

Create `packages/local-server/tests/localSettings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseLocalSettings, resolveLocalSettings } from "../src/index.js";

it("rejects subscription secrets in the local settings file", () => {
  expect(() => parseLocalSettings(`
serve: { port: 8787 }
subscriptionUrl: https://example.com/token
`)).toThrow("subscriptionUrl: unknown field");
});

it("resolves cli over env over local over defaults", () => {
  expect(resolveLocalSettings({
    cli: { serve: { port: 9999 } },
    env: {
      CLASH_ROUTE_KIT_HOST: "127.0.0.1",
      CLASH_ROUTE_KIT_SUBCONVERTER_BASE_URL: "http://env:25500/sub",
    },
    local: {
      serve: { host: "0.0.0.0", port: 8788, publicBaseUrl: "http://lan:8788" },
      subconverterUrl: "http://local:25500/sub",
    },
  })).toEqual({
    serve: { host: "127.0.0.1", port: 9999, publicBaseUrl: "http://lan:8788" },
    subconverterUrl: "http://env:25500/sub",
    sources: { host: "env", port: "cli", publicBaseUrl: "local", subconverterUrl: "env" },
  });
});
```

- [ ] **Step 4: Run tests and verify RED**

Run:

```powershell
pnpm exec vitest run packages/local-server/tests/atomicFiles.test.ts packages/local-server/tests/projectRepository.test.ts packages/local-server/tests/localSettings.test.ts
```

Expected: FAIL because repository/atomic/settings implementations do not exist.

- [ ] **Step 5: Implement atomic file replacement**

Create `packages/local-server/src/config/atomicFiles.ts` with an injectable interface:

```ts
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface AtomicFileIo {
  access(file: string): Promise<void>;
  mkdir(dir: string, options: { recursive: true }): Promise<unknown>;
  readFile(file: string, encoding: "utf8"): Promise<string>;
  writeFile(file: string, content: string, encoding: "utf8"): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  rm(file: string, options?: { force?: boolean }): Promise<void>;
}

const defaultIo: AtomicFileIo = { access, mkdir, readFile, writeFile, rename, rm };

function sibling(target: string, suffix: string): string {
  return path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.${suffix}`);
}

async function exists(file: string, io: AtomicFileIo): Promise<boolean> {
  try { await io.access(file); return true; } catch { return false; }
}

export async function atomicReplaceFile(
  target: string,
  content: string,
  io: AtomicFileIo = defaultIo,
): Promise<void> {
  await atomicReplaceFiles([{ target, content }], io);
}
```

Implement `atomicReplaceFiles` with these concrete phases:

```ts
export async function atomicReplaceFiles(
  changes: readonly { target: string; content: string }[],
  io: AtomicFileIo = defaultIo,
): Promise<void> {
  const staged = changes.map((change) => ({
    ...change,
    temp: sibling(change.target, "tmp"),
    backup: sibling(change.target, "bak"),
    existed: false,
  }));
  const replaced: typeof staged = [];
  try {
    for (const item of staged) {
      await io.mkdir(path.dirname(item.target), { recursive: true });
      item.existed = await exists(item.target, io);
      await io.writeFile(item.temp, item.content, "utf8");
    }
    for (const item of staged) {
      if (item.existed) await io.rename(item.target, item.backup);
      try {
        await io.rename(item.temp, item.target);
        replaced.push(item);
      } catch (error: unknown) {
        if (item.existed && await exists(item.backup, io)) {
          await io.rename(item.backup, item.target);
        }
        throw error;
      }
    }
    for (const item of staged) await io.rm(item.backup, { force: true });
  } catch (error: unknown) {
    for (const item of [...replaced].reverse()) {
      await io.rm(item.target, { force: true });
      if (item.existed && await exists(item.backup, io)) {
        await io.rename(item.backup, item.target);
      }
    }
    throw error;
  } finally {
    for (const item of staged) {
      await io.rm(item.temp, { force: true });
      await io.rm(item.backup, { force: true });
    }
  }
}
```

- [ ] **Step 6: Implement local settings parser/resolver**

Create `packages/local-server/src/config/localSettings.ts`. Parse YAML as unknown and reuse Core-style strict checks locally. Enforce HTTP/HTTPS URLs, positive integer port 1–65535, no unknown keys.

The resolver must use a helper returning value and source:

```ts
function resolveValue<T>(
  cli: T | undefined,
  env: T | undefined,
  local: T | undefined,
  fallback: T,
): { value: T; source: ResolvedSettingSource } {
  if (cli !== undefined) return { value: cli, source: "cli" };
  if (env !== undefined) return { value: env, source: "env" };
  if (local !== undefined) return { value: local, source: "local" };
  return { value: fallback, source: "default" };
}
```

Map environment names exactly:

```ts
CLASH_ROUTE_KIT_HOST
CLASH_ROUTE_KIT_PORT
CLASH_ROUTE_KIT_PUBLISH_BASE_URL
CLASH_ROUTE_KIT_SUBCONVERTER_BASE_URL
```

Serialize with `YAML.stringify(settings, { lineWidth: 0 })` and a final newline.

- [ ] **Step 7: Implement project snapshots, save and migration transaction**

Create `packages/local-server/src/config/projectRepository.ts`. Revision is:

```ts
import { createHash } from "node:crypto";

function revisionOf(yaml: string): string {
  return createHash("sha256").update(yaml, "utf8").digest("hex");
}
```

`read()` behavior:

1. `ENOENT` → `{ state: "missing", diagnostics: [] }`.
2. `parseAuthorProjectConfig` failure → `invalid` with raw YAML, revision and diagnostics.
3. v1 → `legacy` with `validateLegacyProjectConfig` diagnostics.
4. v2 → `ready` with `validateAuthorProjectConfig` diagnostics.

`save()` behavior:

```ts
async save(input: SaveProjectInput): Promise<ProjectSnapshot> {
  const current = await this.read();
  const currentRevision = current.state === "missing" ? undefined : current.revision;
  if (input.expectedRevision !== currentRevision) {
    throw new ProjectRevisionError(input.expectedRevision, currentRevision);
  }
  const diagnostics = validateAuthorProjectConfig(input.config);
  if (hasDiagnosticErrors(diagnostics)) throw new ProjectWriteError(diagnostics);
  const yaml = serializeAuthorProjectConfig(input.config);
  await replaceFiles([{ target: configPath, content: yaml }]);
  return { state: "ready", revision: revisionOf(yaml), yaml, config: input.config, diagnostics };
}
```

`applyMigration()` must reread the current legacy snapshot, verify revision, rerun `migrateAuthorProjectConfig`, apply supplied resolutions, require `migrationCanApply`, merge the local-settings patch according to the required policy, and call one `replaceFiles` transaction with project YAML plus local YAML when the latter changes. `preserve-existing` keeps every existing non-undefined local field; `use-migrated` uses migration candidates only for fields included in the preview. Neither policy may introduce subscription keys.

- [ ] **Step 8: Ignore local settings and run GREEN**

Add to `.gitignore`:

```gitignore
.clashroutekit/local.yaml
```

Run:

```powershell
pnpm exec vitest run packages/local-server/tests/atomicFiles.test.ts packages/local-server/tests/projectRepository.test.ts packages/local-server/tests/localSettings.test.ts
pnpm --filter @clash-route-kit/local-server typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add packages/local-server/src/config packages/local-server/src/index.ts packages/local-server/tests/atomicFiles.test.ts packages/local-server/tests/projectRepository.test.ts packages/local-server/tests/localSettings.test.ts .gitignore
git commit -m "feat: add atomic project repositories"
```

### Task 3: Move runtime loading, workspace validation and generation into Local Server

**Files:**

- Create: `packages/local-server/src/config/loadExecutableProject.ts`
- Create: `packages/local-server/src/validation/workspaceValidation.ts`
- Create: `packages/local-server/src/generate/generateOutputs.ts`
- Create: `packages/local-server/tests/loadExecutableProject.test.ts`
- Create: `packages/local-server/tests/workspaceValidation.test.ts`
- Create: `packages/local-server/tests/generateOutputs.test.ts`
- Modify: `packages/local-server/src/index.ts`
- Modify later in Task 6: `apps/cli/src/program.ts`

**Interfaces:**

- Produces: `ExecutableProject` discriminated by `authorVersion`.
- Produces: `loadExecutableProject(options): Promise<ExecutableProject>`.
- Produces: `validateWorkspaceProject(options, project): Promise<Diagnostic[]>`.
- Produces: `GenerateOptions = { root: string; configFile: string; runtime: RuntimeContext }` plus injectable IO fields used by tests.
- Produces: `generateOutputs(options: GenerateOptions): Promise<GenerateResult>` and report types currently defined in CLI.

- [ ] **Step 1: Write v1/v2 runtime loader RED tests**

Create `packages/local-server/tests/loadExecutableProject.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadExecutableProject } from "../src/index.js";

it("loads v1 with the legacy render input and v2 through normalization", async () => {
  const v1 = await loadExecutableProject({
    root: "C:/repo",
    configFile: "routes.yaml",
    runtime: { publishBaseUrl: "http://lan:8787" },
    readText: async () => `
publishBaseUrl: http://old:8787
template: { output: V1.ini }
vendorRepos: []
customProxyGroups: [{ name: Proxy, type: select, options: [DIRECT] }]
ruleSets: [{ id: final, policy: Proxy, source: { type: final } }]
ruleProviders: []
`,
  });
  expect(v1.authorVersion).toBe(1);
  expect(v1.renderProject.routeConfig.publishBaseUrl).toBe("http://lan:8787");

  const v2 = await loadExecutableProject({
    root: "C:/repo",
    configFile: "routes.yaml",
    runtime: { publishBaseUrl: "http://lan:8787" },
    readText: async () => `
schemaVersion: 2
project: { template: { output: V2.ini } }
memberSets: {}
proxyGroups: [{ id: proxy, name: Proxy, type: select, members: [{ builtin: DIRECT }] }]
routes: [{ id: final, policy: { group: proxy }, source: { type: final } }]
ruleProviders: []
vendorRepos: []
`,
  });
  expect(v2.authorVersion).toBe(2);
  expect(v2.renderProject.template.output).toBe("V2.ini");
});
```

- [ ] **Step 2: Move workspace and generation tests before implementation**

Move the complete phase A cases from `apps/cli/tests/workspaceValidation.test.ts` into `packages/local-server/tests/workspaceValidation.test.ts`, changing only the import to `../src/index.js`.

Create `packages/local-server/tests/generateOutputs.test.ts`:

```ts
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateOutputs } from "../src/index.js";

const runtime = { publishBaseUrl: "http://192.168.1.10:8787" };

async function createWorkspace(
  yaml: string,
  ruleFiles: Record<string, string> = {},
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "route-kit-local-server-"));
  await writeFile(path.join(root, "routes.yaml"), yaml, "utf8");
  for (const [name, content] of Object.entries(ruleFiles)) {
    const file = path.join(root, "config/rules", name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, "utf8");
  }
  return root;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

const legacyHeader = `
publishBaseUrl: http://127.0.0.1:8787
template: { output: Custom_Clash.ini }
vendorRepos: []
customProxyGroups:
  - name: Proxy
    type: select
    options: [DIRECT]
ruleSets:
  - id: final
    policy: Proxy
    source: { type: final }
`;

describe("generateOutputs", () => {
  it("writes template, yaml providers and an exact duplicate/overlap report", async () => {
    const root = await createWorkspace(`${legacyHeader}
ruleProviders:
  - name: AI
    output: AI_Domain.yaml
    behavior: domain
    sources:
      - name: AI-A
        type: clash-list
        path: config/rules/AI-A.list
      - name: AI-B
        type: clash-list
        path: config/rules/AI-B.list
  - name: Developer
    output: Developer_Domain.yaml
    behavior: domain
    sources:
      - name: Developer
        type: clash-list
        path: config/rules/Developer.list
`, {
      "AI-A.list": "DOMAIN-SUFFIX,shared.example\nDOMAIN-SUFFIX,dup.example\n",
      "AI-B.list": "DOMAIN-SUFFIX,dup.example\nDOMAIN,exact.example\n",
      "Developer.list": "DOMAIN-SUFFIX,shared.example\n",
    });

    const result = await generateOutputs({ root, configFile: "routes.yaml", runtime });

    expect(result.templatePath).toBe(path.join(root, "output/templates/Custom_Clash.ini"));
    expect(result.rulePaths).toEqual([
      path.join(root, "output/rules/AI_Domain.yaml"),
      path.join(root, "output/rules/Developer_Domain.yaml"),
    ]);
    expect(result.duplicates).toEqual([{
      provider: "AI",
      rules: [{ rule: "DOMAIN-SUFFIX,dup.example", sources: ["AI-A", "AI-B"] }],
    }]);
    expect(result.overlaps).toEqual([{
      rule: "DOMAIN-SUFFIX,shared.example",
      providers: ["AI", "Developer"],
    }]);
    expect(JSON.parse(await readFile(result.reportPath, "utf8"))).toMatchObject({
      duplicates: result.duplicates,
      overlaps: result.overlaps,
    });
  });

  it("does not create output for either pure or workspace errors", async () => {
    const pureRoot = await createWorkspace(`${legacyHeader.replace(
      "    options: [DIRECT]",
      "    options: [DIRECT]\n    nodeFilters: [https://probe.example/204]",
    )}\nruleProviders: []\n`);
    await expect(generateOutputs({
      root: pureRoot,
      configFile: "routes.yaml",
      runtime,
    })).rejects.toMatchObject({ name: "ConfigDiagnosticError" });
    expect(await exists(path.join(pureRoot, "output"))).toBe(false);

    const workspaceRoot = await createWorkspace(`${legacyHeader}
ruleProviders:
  - name: Missing
    output: Missing_Domain.yaml
    behavior: domain
    sources:
      - name: Missing
        type: clash-list
        path: config/rules/Missing.list
`);
    await expect(generateOutputs({
      root: workspaceRoot,
      configFile: "routes.yaml",
      runtime,
    })).rejects.toMatchObject({ name: "ConfigDiagnosticError" });
    expect(await exists(path.join(workspaceRoot, "output"))).toBe(false);
  });

  it("skips disabled providers", async () => {
    const root = await createWorkspace(`${legacyHeader}
ruleProviders:
  - name: Draft
    output: Draft.mrs
    behavior: domain
    enabled: false
    sources: []
`);
    const result = await generateOutputs({ root, configFile: "routes.yaml", runtime });
    expect(result.rulePaths).toEqual([]);
    expect(await exists(path.join(root, "output/rules/Draft.mrs"))).toBe(false);
  });

  it("renders v1 and v2 projects through one generate entry", async () => {
    const v1Root = await createWorkspace(`${legacyHeader}\nruleProviders: []\n`);
    const v2Root = await createWorkspace(`
schemaVersion: 2
project: { template: { output: V2.ini } }
memberSets: {}
proxyGroups:
  - id: proxy
    name: Proxy
    type: select
    members: [{ builtin: DIRECT }]
routes:
  - id: final
    policy: { group: proxy }
    source: { type: final }
ruleProviders: []
vendorRepos: []
`);

    const v1 = await generateOutputs({ root: v1Root, configFile: "routes.yaml", runtime });
    const v2 = await generateOutputs({ root: v2Root, configFile: "routes.yaml", runtime });
    expect(await readFile(v1.templatePath, "utf8")).toContain("custom_proxy_group=Proxy");
    expect(await readFile(v2.templatePath, "utf8")).toContain("custom_proxy_group=Proxy");
    expect(path.basename(v2.templatePath)).toBe("V2.ini");
  });
});
```

- [ ] **Step 3: Run the three suites and verify RED**

Run:

```powershell
pnpm exec vitest run packages/local-server/tests/loadExecutableProject.test.ts packages/local-server/tests/workspaceValidation.test.ts packages/local-server/tests/generateOutputs.test.ts
```

Expected: FAIL because Local Server does not yet export these use cases.

- [ ] **Step 4: Implement executable loading**

Create `packages/local-server/src/config/loadExecutableProject.ts`:

```ts
export type ExecutableProject =
  | {
      authorVersion: 1;
      config: RouteKitProjectConfig;
      renderProject: RenderProject;
      diagnostics: Diagnostic[];
    }
  | {
      authorVersion: 2;
      config: AuthorProjectConfig;
      normalized: NormalizedProject;
      renderProject: RenderProject;
      diagnostics: Diagnostic[];
    };

export async function loadExecutableProject(
  options: LoadExecutableProjectOptions,
): Promise<ExecutableProject> {
  const yaml = await (options.readText ?? readFile)(
    path.resolve(options.root, options.configFile),
    "utf8",
  );
  const parsed = parseAuthorProjectConfig(yaml);
  if (!parsed.ok) throw new ConfigDiagnosticError(parsed.diagnostics);
  if (parsed.value.version === 1) {
    const diagnostics = validateLegacyProjectConfig(parsed.value.config);
    if (hasDiagnosticErrors(diagnostics)) throw new ConfigDiagnosticError(diagnostics);
    return {
      authorVersion: 1,
      config: parsed.value.config,
      renderProject: legacyRenderProject(parsed.value.config, options.runtime),
      diagnostics,
    };
  }
  const normalized = normalizeProjectConfig(parsed.value.config);
  if (!normalized.ok) throw new ConfigDiagnosticError(normalized.diagnostics);
  return {
    authorVersion: 2,
    config: parsed.value.config,
    normalized: normalized.project,
    renderProject: createRenderProject(normalized.project, options.runtime),
    diagnostics: normalized.diagnostics,
  };
}
```

`legacyRenderProject` maps v1 fields into `RenderProject` without mutating the v1 config and applies runtime URLs over author URLs.

- [ ] **Step 5: Move workspace validation and generation code by responsibility**

Move phase A workspace validation into `packages/local-server/src/validation/workspaceValidation.ts`; accept `ExecutableProject` and inspect:

- v1 provider sources from `config.ruleProviders`;
- v2 provider sources from `renderProject.ruleProviders`;
- GEOSITE values from v1 `ruleSets` or normalized `routes`;
- enabled items only.

Move provider reading, rule collection, output/report writes and result types from `apps/cli/src/program.ts` into `packages/local-server/src/generate/generateOutputs.ts`. The public preflight is:

```ts
const project = await loadExecutableProject(options);
const diagnostics = [
  ...project.diagnostics,
  ...await validateWorkspaceProject(options, project),
];
if (hasDiagnosticErrors(diagnostics)) throw new ConfigDiagnosticError(diagnostics);
```

No `mkdir` or `writeFile` may occur before this block completes. Use `project.renderProject.template`, `.routeConfig`, `.ruleProviders`, `.globalRemove`, and provider source paths for generation.

- [ ] **Step 6: Run GREEN**

Run:

```powershell
pnpm exec vitest run packages/local-server/tests/loadExecutableProject.test.ts packages/local-server/tests/workspaceValidation.test.ts packages/local-server/tests/generateOutputs.test.ts
pnpm --filter @clash-route-kit/local-server typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add packages/local-server/src/config/loadExecutableProject.ts packages/local-server/src/validation packages/local-server/src/generate packages/local-server/src/index.ts packages/local-server/tests/loadExecutableProject.test.ts packages/local-server/tests/workspaceValidation.test.ts packages/local-server/tests/generateOutputs.test.ts
git commit -m "refactor: move generation into local server"
```

### Task 4: Split Catalog, Vendor and rule-file IO into focused modules

**Files:**

- Create: `packages/local-server/src/catalog/origins.ts`
- Create: `packages/local-server/src/catalog/indexCatalog.ts`
- Create: `packages/local-server/src/vendor/syncVendor.ts`
- Create: `packages/local-server/src/rules/ruleFileRepository.ts`
- Create: `packages/local-server/tests/catalog.test.ts`
- Create: `packages/local-server/tests/syncVendor.test.ts`
- Create: `packages/local-server/tests/ruleFileRepository.test.ts`
- Modify: `packages/local-server/src/index.ts`

**Interfaces:**

- Produces: `catalogOriginsFromProject`, `listCatalogSources`, `listCatalogEntries`, `searchCatalog`, `readCatalogEntryDomains`, `readCatalogTemplate`.
- Produces: `VendorSyncResult = { id: string; name: string; action: "clone" | "pull" | "error"; path: string; error?: string }`.
- Produces: `syncVendor({ root, repos, onlyId?, directoryExists?, runGit }): Promise<VendorSyncResult[]>`.
- Produces: `RuleFileRepository` with list/read/write/delete restricted to `config/rules/*.list`.

- [ ] **Step 1: Move current behavior assertions into focused RED tests**

Create `packages/local-server/tests/catalog.test.ts` by moving complete current cases for:

- config-derived origins and template origins;
- list-dir `.list` stripping;
- provider YAML payload reading;
- domain-list-community include expansion;
- source counts/sync time;
- template listing/reading;
- search metadata.

Create `packages/local-server/tests/syncVendor.test.ts`:

```ts
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AuthorVendorRepo } from "@clash-route-kit/core";
import { syncVendor } from "../src/index.js";

const repos: AuthorVendorRepo[] = [
  { id: "alpha", name: "Alpha", url: "https://example.com/alpha.git", path: "vendor/alpha" },
  { id: "beta", name: "Beta", url: "https://example.com/beta.git", path: "vendor/beta" },
];

it("clones missing repos and pulls existing repos independently", async () => {
  const calls: Array<{ args: string[]; cwd: string }> = [];
  const result = await syncVendor({
    root: "C:/repo",
    repos,
    directoryExists: async (file) => file.endsWith("vendor\\beta\\.git"),
    runGit: async (args, cwd) => { calls.push({ args, cwd }); },
  });

  expect(result).toEqual([
    { id: "alpha", name: "Alpha", action: "clone", path: path.resolve("C:/repo", "vendor/alpha") },
    { id: "beta", name: "Beta", action: "pull", path: path.resolve("C:/repo", "vendor/beta") },
  ]);
  expect(calls).toEqual([
    {
      args: ["clone", "--depth", "1", "https://example.com/alpha.git", path.resolve("C:/repo", "vendor/alpha")],
      cwd: path.resolve("C:/repo"),
    },
    {
      args: ["-C", path.resolve("C:/repo", "vendor/beta"), "pull", "--ff-only"],
      cwd: path.resolve("C:/repo"),
    },
  ]);
});

it("returns an error result for one repo without aborting the next repo", async () => {
  const runGit = vi.fn(async (args: string[]) => {
    if (args.includes("https://example.com/alpha.git")) throw new Error("repository unavailable");
  });
  const result = await syncVendor({
    root: "C:/repo",
    repos,
    directoryExists: async () => false,
    runGit,
  });

  expect(result[0]).toMatchObject({ id: "alpha", action: "error", error: "repository unavailable" });
  expect(result[1]).toMatchObject({ id: "beta", action: "clone" });
  expect(runGit).toHaveBeenCalledTimes(2);
});
```

Create `packages/local-server/tests/ruleFileRepository.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRuleFileRepository } from "../src/index.js";

function memoryRuleIo() {
  const files = new Map<string, string>();
  return {
    files,
    io: {
      listNames: async () => [...files.keys()].map((file) => file.split(/[\\/]/).pop()!),
      readText: async (file: string) => {
        const value = files.get(file);
        if (value === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        return value;
      },
      replaceFile: async (file: string, content: string) => { files.set(file, content); },
      removeFile: async (file: string) => { files.delete(file); },
    },
  };
}

it("accepts only one-level config/rules/*.list names", async () => {
  const state = memoryRuleIo();
  const repository = createRuleFileRepository({ root: "C:/repo", io: state.io });
  await expect(repository.write("Custom.list", "DOMAIN,example.com\n")).resolves.toBeDefined();
  await expect(repository.read("Custom.list")).resolves.toBe("DOMAIN,example.com\n");
  await expect(repository.write("../secret.list", "x")).rejects.toThrow("invalid rule file name");
  await expect(repository.write("nested/Bad.list", "x")).rejects.toThrow("invalid rule file name");
  await expect(repository.write("Bad.yaml", "x")).rejects.toThrow("invalid rule file name");
  expect([...state.files.keys()]).toHaveLength(1);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
pnpm exec vitest run packages/local-server/tests/catalog.test.ts packages/local-server/tests/syncVendor.test.ts packages/local-server/tests/ruleFileRepository.test.ts
```

Expected: FAIL because the focused modules do not exist.

- [ ] **Step 3: Implement Catalog origin and index services**

Move only pure origin derivation into `catalog/origins.ts`:

```ts
export interface CatalogOrigin {
  id: string;
  label: string;
  kind: "domain-list" | "list-dir" | "provider-yaml" | "ini-template";
  dir: string;
}

export function catalogOriginsFromProject(
  project: ExecutableProject,
): CatalogOrigin[] {
  const repos = project.renderProject.vendorRepos;
  return repos.flatMap((repo) => {
    const origins: CatalogOrigin[] = [];
    if (repo.catalog) origins.push({
      id: repo.id,
      label: repo.name,
      kind: repo.catalog.kind,
      dir: repo.catalog.dir,
    });
    if (repo.templateDir) origins.push({
      id: `${repo.id}::templates`,
      label: `${repo.name} · 模板`,
      kind: "ini-template",
      dir: repo.templateDir,
    });
    return origins;
  });
}
```

For v1 vendor repos without IDs, `loadExecutableProject` must expose render vendor IDs generated deterministically from repo names, so Catalog no longer keys by display name.

Move index caching/search/read logic into `indexCatalog.ts`; the module may import Node IO but may not import HTTP types.

- [ ] **Step 4: Implement isolated vendor sync and safe rule files**

`syncVendor` accepts the resolved vendor repo array and injected `runGit(args, cwd)`/`directoryExists(path)` functions shown in the tests. Resolve every repo path under `root`, wrap each repo in its own `try/catch`, append one `VendorSyncResult`, then continue to the next repo. `onlyId` filters by stable repo ID before any command runs.

`createRuleFileRepository` must resolve names with:

```ts
function ruleFilePath(root: string, name: string): string {
  if (!/^[^\\/]+\.list$/i.test(name) || name === ".list") {
    throw new Error(`invalid rule file name: ${name}`);
  }
  return path.join(root, "config/rules", name);
}
```

The default Rule File IO adapts `readdir`, `readFile`, `atomicReplaceFile`, and `rm` to the `listNames/readText/replaceFile/removeFile` test interface. Deletes call `removeFile` only after `ruleFilePath` validation.

- [ ] **Step 5: Run GREEN and commit**

Run:

```powershell
pnpm exec vitest run packages/local-server/tests/catalog.test.ts packages/local-server/tests/syncVendor.test.ts packages/local-server/tests/ruleFileRepository.test.ts
pnpm --filter @clash-route-kit/local-server typecheck
```

Expected: PASS.

```powershell
git add packages/local-server/src/catalog packages/local-server/src/vendor packages/local-server/src/rules packages/local-server/src/index.ts packages/local-server/tests/catalog.test.ts packages/local-server/tests/syncVendor.test.ts packages/local-server/tests/ruleFileRepository.test.ts
git commit -m "refactor: split local workspace services"
```

### Task 5: Add Git adapter and compose focused HTTP routes

**Files:**

- Create: `packages/local-server/src/git/gitRepository.ts`
- Create: `packages/local-server/tests/gitRepository.test.ts`
- Create: `packages/local-server/src/http/httpTypes.ts`
- Create: `packages/local-server/src/http/projectRoutes.ts`
- Create: `packages/local-server/src/http/catalogRoutes.ts`
- Create: `packages/local-server/src/http/ruleFileRoutes.ts`
- Create: `packages/local-server/src/http/actionRoutes.ts`
- Create: `packages/local-server/src/http/gitRoutes.ts`
- Create: `packages/local-server/src/http/createApiHandler.ts`
- Create: `packages/local-server/src/http/createHostingHandler.ts`
- Create: `packages/local-server/tests/httpRoutes.test.ts`
- Modify: `packages/local-server/src/index.ts`

**Interfaces:**

- Produces: `GitRepository` and `createGitRepository`.
- Produces: `HttpRoute = (context) => Promise<boolean>`.
- Produces: `createApiHandler(routes)` for focused route/error-mapping tests.
- Produces: `createRouteKitApiHandler(options)` and `createHostingHandler(options)` public entries.
- Preserves: existing `/api/project/config`, `/api/catalog/*`, `/api/rules/*`, `/api/actions/*`, `/api/git/remote` paths.
- Adds: `/api/project/snapshot` and `/api/project/migrate`.

- [ ] **Step 1: Write Git adapter RED tests**

Create `packages/local-server/tests/gitRepository.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createGitRepository } from "../src/index.js";

it("reads branch, sha, origin and porcelain paths", async () => {
  const run = vi.fn(async (_command: string, args: string[]) => {
    if (args.join(" ") === "branch --show-current") return "main\n";
    if (args.join(" ") === "rev-parse HEAD") return "abc123\n";
    if (args.join(" ") === "remote get-url origin") return "git@github.com:acme/routes.git\n";
    if (args.join(" ") === "status --porcelain=v1") return " M config/routes.yaml\n?? config/rules/New.list\n";
    if (args.join(" ") === "rev-list --left-right --count origin/main...main") return "0\t0\n";
    throw new Error(`unexpected ${args.join(" ")}`);
  });
  const git = createGitRepository({ root: "C:/repo", runCommand: run });
  await expect(git.status()).resolves.toEqual({
    branch: "main",
    headSha: "abc123",
    origin: "git@github.com:acme/routes.git",
    dirtyPaths: ["config/routes.yaml", "config/rules/New.list"],
    ahead: 0,
    behind: 0,
  });
});

it("stages only route author files before commit", async () => {
  const calls: string[][] = [];
  const git = createGitRepository({
    root: "C:/repo",
    runCommand: async (_command, args) => { calls.push(args); return ""; },
  });
  await git.commitRouteChanges("chore: update route config");
  expect(calls[0]).toEqual(["add", "config/routes.yaml", "config/rules"]);
  expect(calls[1]).toEqual(["commit", "-m", "chore: update route config"]);
});
```

- [ ] **Step 2: Write route composition RED tests**

Create `packages/local-server/tests/httpRoutes.test.ts` with injected repositories/use cases and Node-compatible request/response doubles:

```ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { AuthorProjectConfig } from "@clash-route-kit/core";
import {
  ProjectRevisionError,
  ProjectWriteError,
  createApiHandler,
  createCatalogRoutes,
  createProjectRoutes,
  type ProjectRepository,
} from "../src/index.js";

const readyConfig: AuthorProjectConfig = {
  schemaVersion: 2,
  project: { template: { output: "Custom_Clash.ini" } },
  memberSets: {},
  proxyGroups: [{ id: "proxy", name: "Proxy", type: "select", members: [{ builtin: "DIRECT" }] }],
  routes: [{ id: "final", policy: { group: "proxy" }, source: { type: "final" } }],
  ruleProviders: [],
  vendorRepos: [],
};

function projectRepository(
  patch: Partial<ProjectRepository> = {},
): ProjectRepository {
  const snapshot = {
    state: "ready" as const,
    revision: "revision",
    yaml: "schemaVersion: 2\n",
    config: readyConfig,
    diagnostics: [],
  };
  return {
    read: async () => snapshot,
    save: async () => snapshot,
    applyMigration: async () => snapshot,
    ...patch,
  };
}

async function invoke(
  handler: ReturnType<typeof createApiHandler>,
  input: { method: string; path: string; body?: unknown },
): Promise<{ statusCode: number; headers: Record<string, string>; body: string; nextCount: number }> {
  const request = Readable.from(
    input.body === undefined ? [] : [JSON.stringify(input.body)],
  ) as unknown as IncomingMessage;
  Object.assign(request, {
    method: input.method,
    url: input.path,
    headers: input.body === undefined ? {} : { "content-type": "application/json" },
  });

  return new Promise((resolve, reject) => {
    const state = { statusCode: 200, headers: {} as Record<string, string>, body: "", nextCount: 0 };
    const response = {
      statusCode: 200,
      setHeader(name: string, value: string | number | readonly string[]) {
        state.headers[name.toLowerCase()] = String(value);
      },
      end(chunk?: string | Uint8Array) {
        state.statusCode = this.statusCode;
        if (chunk !== undefined) state.body += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
        resolve(state);
      },
    } as unknown as ServerResponse;
    void handler(request, response, () => {
      state.nextCount += 1;
      resolve(state);
    }).catch(reject);
  });
}

it("GET /api/project/snapshot returns the repository snapshot", async () => {
  const response = await invoke(
    createApiHandler([createProjectRoutes(projectRepository())]),
    { method: "GET", path: "/api/project/snapshot" },
  );
  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body)).toEqual({
    state: "ready",
    revision: "revision",
    yaml: "schemaVersion: 2\n",
    config: readyConfig,
    diagnostics: [],
  });
});

it("PUT /api/project/config maps revision conflicts to 409", async () => {
  const repository = projectRepository({
    save: async () => { throw new ProjectRevisionError("stale", "revision"); },
  });
  const response = await invoke(
    createApiHandler([createProjectRoutes(repository)]),
    { method: "PUT", path: "/api/project/config", body: { expectedRevision: "stale", config: readyConfig } },
  );
  expect(response.statusCode).toBe(409);
  expect(JSON.parse(response.body)).toMatchObject({ code: "project.revision-conflict" });
});

it("POST /api/project/migrate maps unresolved diagnostics to 422", async () => {
  const diagnostics = [{
    code: "migration.provider.sources-empty",
    severity: "error" as const,
    path: "ruleProviders[0].sources",
    message: "规则源为空",
  }];
  const repository = projectRepository({
    applyMigration: async () => { throw new ProjectWriteError(diagnostics); },
  });
  const response = await invoke(
    createApiHandler([createProjectRoutes(repository)]),
    {
      method: "POST",
      path: "/api/project/migrate",
      body: { expectedRevision: "revision", resolutions: [], localSettingsPolicy: "preserve-existing" },
    },
  );
  expect(response.statusCode).toBe(422);
  expect(JSON.parse(response.body)).toEqual({
    code: "project.write-blocked",
    message: "配置仍有阻断问题",
    diagnostics,
  });
});

it("a catalog route delegates to the catalog service", async () => {
  const listSources = vi.fn(async () => [{ id: "dlc", label: "DLC", kind: "domain-list", count: 10 }]);
  const response = await invoke(
    createApiHandler([createCatalogRoutes({ listSources })]),
    { method: "GET", path: "/api/catalog/sources" },
  );
  expect(listSources).toHaveBeenCalledTimes(1);
  expect(JSON.parse(response.body)).toEqual([{ id: "dlc", label: "DLC", kind: "domain-list", count: 10 }]);
});

it("unknown paths call next exactly once", async () => {
  const response = await invoke(
    createApiHandler([createProjectRoutes(projectRepository())]),
    { method: "GET", path: "/not-an-api" },
  );
  expect(response.nextCount).toBe(1);
  expect(response.body).toBe("");
});
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
pnpm exec vitest run packages/local-server/tests/gitRepository.test.ts packages/local-server/tests/httpRoutes.test.ts
```

Expected: FAIL because Git and HTTP modules do not exist.

- [ ] **Step 4: Implement the Git command adapter**

Create `packages/local-server/src/git/gitRepository.ts`:

```ts
export interface GitStatus {
  branch: string;
  headSha: string;
  origin: string;
  dirtyPaths: string[];
  ahead: number;
  behind: number;
}

export interface GitRepository {
  status(): Promise<GitStatus>;
  commitRouteChanges(message: string): Promise<string>;
  pushCurrent(): Promise<string>;
}
```

The default command runner uses `execFile("git", args, { cwd: root })`, never concatenates a shell command, trims stdout, and lets stderr propagate. Parse porcelain paths by removing the first three status characters; preserve spaces in filenames. Read ahead/behind with `git rev-list --left-right --count origin/main...main`; if the remote ref is absent, return `ahead: 0`, `behind: 0` and let the later workspace/publish review add a warning.

- [ ] **Step 5: Implement thin route functions and composition**

Create `packages/local-server/src/http/httpTypes.ts`:

```ts
export interface HttpContext {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
}

export type HttpRoute = (context: HttpContext) => Promise<boolean>;

export function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}
```

In the same file, implement JSON reading and handler-level error mapping:

```ts
export async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
  try {
    return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks))) as T;
  } catch {
    throw new BadJsonError();
  }
}

export class BadJsonError extends Error {
  constructor() {
    super("invalid JSON request");
    this.name = "BadJsonError";
  }
}

export function createApiHandler(routes: readonly HttpRoute[]) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
    next?: () => void,
  ): Promise<void> => {
    const context = { request, response, url: new URL(request.url ?? "/", "http://127.0.0.1") };
    try {
      for (const route of routes) if (await route(context)) return;
      next?.();
    } catch (error: unknown) {
      if (error instanceof ProjectRevisionError) {
        writeJson(response, 409, { code: "project.revision-conflict", message: "项目已被其它操作修改" });
      } else if (error instanceof ProjectWriteError) {
        writeJson(response, 422, { code: "project.write-blocked", message: "配置仍有阻断问题", diagnostics: error.diagnostics });
      } else if (error instanceof BadJsonError) {
        writeJson(response, 400, { code: "request.invalid-json", message: "请求 JSON 无法解析" });
      } else {
        writeJson(response, 500, { code: "internal", message: "本地服务处理请求失败" });
      }
    }
  };
}
```

Each route file exports one factory accepting only the use cases it calls. Example `projectRoutes.ts`:

```ts
export function createProjectRoutes(repository: ProjectRepository): HttpRoute {
  return async ({ request, response, url }) => {
    if (request.method === "GET" && url.pathname === "/api/project/snapshot") {
      writeJson(response, 200, await repository.read());
      return true;
    }
    if (request.method === "PUT" && url.pathname === "/api/project/config") {
      const body = await readJson<SaveProjectInput>(request);
      writeJson(response, 200, await repository.save(body));
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/project/migrate") {
      const body = await readJson<ApplyMigrationInput>(request);
      writeJson(response, 200, await repository.applyMigration(body));
      return true;
    }
    return false;
  };
}
```

The compatibility `/api/project/config` GET response may project the new snapshot into `{ yaml, config }` only for `legacy`/`ready`; invalid/missing return 404/422 with diagnostics.

`createRouteKitApiHandler(options)` constructs the project, catalog, rule-file, action and Git routes from its dependencies, then delegates to `createApiHandler(routes)`. Route files never duplicate error mapping.

```ts
return createApiHandler([
  createProjectRoutes(options.projectRepository),
  createCatalogRoutes(options.catalog),
  createRuleFileRoutes(options.ruleFiles),
  createActionRoutes(options.actions),
  createGitRoutes(options.git),
]);
```

Move existing static template/rule hosting into `createHostingHandler.ts`; it only serves files under resolved `output/templates` and `output/rules` and rejects traversal.

- [ ] **Step 6: Run GREEN and commit**

Run:

```powershell
pnpm exec vitest run packages/local-server/tests/gitRepository.test.ts packages/local-server/tests/httpRoutes.test.ts
pnpm --filter @clash-route-kit/local-server typecheck
```

Expected: PASS.

```powershell
git add packages/local-server/src/git packages/local-server/src/http packages/local-server/src/index.ts packages/local-server/tests/gitRepository.test.ts packages/local-server/tests/httpRoutes.test.ts
git commit -m "feat: expose local server http adapters"
```

### Task 6: Reduce CLI to adapters and make Vite import the public package

**Files:**

- Modify: `apps/cli/src/program.ts`
- Modify: `apps/cli/src/index.ts`
- Modify: `apps/cli/src/serve.ts`
- Delete: `apps/cli/src/serveApi.ts`
- Delete: `apps/cli/src/serveHosting.ts`
- Modify: `apps/cli/tests/cli.test.ts`
- Modify: `apps/cli/tests/serve.test.ts`
- Delete: `apps/cli/tests/serveApi.test.ts`
- Delete: `apps/cli/tests/serveHosting.test.ts`
- Modify: `apps/web/vite.config.ts:1-59`
- Modify: `apps/web/tests/viteConfig.test.ts`

**Interfaces:**

- Consumes: all Local Server public entries.
- Preserves CLI commands: `generate`, `preview`, `check`, `sync-vendor`, `subconvert-url`, `import`, `serve`.
- Preserves exported compatibility wrappers used by CLI tests while moving actual IO implementations.
- Guarantees: Web Vite config imports only `@clash-route-kit/local-server`.

- [ ] **Step 1: Rewrite CLI tests around delegated use cases**

Keep CLI tests only for command/output concerns. Add an injectable command runner exported from `apps/cli/src/program.ts`:

```ts
export interface CliUseCases {
  check(options: ProgramOptions): Promise<Diagnostic[]>;
  generate(options: ProgramOptions): Promise<GenerateResult>;
  syncVendor(options: ProgramOptions): Promise<VendorSyncResult[]>;
  preview(options: ProgramOptions): Promise<string[]>;
  importIni(options: ProgramOptions & { iniFile: string }): Promise<ImportResult>;
  buildSubconverterUrl(options: SubconverterUrlOptions): Promise<string>;
}
```

Add a test:

```ts
it("prints warning diagnostics but exits successfully", async () => {
  const stderr: string[] = [];
  const exitCode = await runCli(["check"], {
    useCases: {
      ...fakeUseCases,
      check: async () => [{ code: "catalog.missing", severity: "warning", message: "missing gfw" }],
    },
    stdout: () => {},
    stderr: (line) => stderr.push(line),
  });
  expect(exitCode).toBe(0);
  expect(stderr.join("\n")).toContain("missing gfw");
});
```

Update `apps/web/tests/viteConfig.test.ts` to read `apps/web/vite.config.ts` source and assert:

```ts
expect(source).toContain('from "@clash-route-kit/local-server"');
expect(source).not.toContain("../cli/src");
```

- [ ] **Step 2: Run adapter tests and verify RED**

Run:

```powershell
pnpm exec vitest run apps/cli/tests/cli.test.ts apps/cli/tests/serve.test.ts apps/web/tests/viteConfig.test.ts
```

Expected: FAIL because CLI and Vite still import/own old implementations.

- [ ] **Step 3: Replace `program.ts` implementations with Local Server delegates**

Keep public result/type exports needed by existing callers, but implement wrappers as imports:

```ts
export {
  generateOutputs,
  syncVendor,
  validateWorkspaceProject,
} from "@clash-route-kit/local-server";

export async function checkConfig(options: ProgramOptions): Promise<Diagnostic[]> {
  const settings = await readResolvedLocalSettings(options);
  const project = await loadExecutableProject({
    ...options,
    runtime: {
      publishBaseUrl: settings.serve.publicBaseUrl,
      subconverterUrl: settings.subconverterUrl,
    },
  });
  return [
    ...project.diagnostics,
    ...await validateWorkspaceProject(options, project),
  ];
}
```

Move preview/import/SubConverter URL pure orchestration either into Core or Local Server according to IO needs; `program.ts` itself must contain no `readFile`, `writeFile`, `readdir`, `execFile`, `YAML.parse`, provider collection or Git code.

Refactor `index.ts` into `runCli(argv, dependencies)` plus the production call. `runCli` returns numeric exit code instead of assigning global state inside branches; production assigns `process.exitCode` once.

- [ ] **Step 4: Compose serve and remove CLI HTTP source files**

`apps/cli/src/serve.ts` imports:

```ts
import {
  createHostingHandler,
  createRouteKitApiHandler,
} from "@clash-route-kit/local-server";
```

Delete `apps/cli/src/serveApi.ts` and `serveHosting.ts` after all behavior tests have moved and passed in Local Server. Delete their old test files; do not delete `serve.test.ts`.

- [ ] **Step 5: Update Vite to the package boundary**

Change `apps/web/vite.config.ts` imports to:

```ts
import {
  createHostingHandler,
  createRouteKitApiHandler,
} from "@clash-route-kit/local-server";
```

Add the development alias:

```ts
"@clash-route-kit/local-server": path.resolve(root, "packages/local-server/src/index.ts"),
```

Retain the existing Core alias, project-root resolution and config watch ignore behavior.

- [ ] **Step 6: Run GREEN, boundary search and build**

Run:

```powershell
pnpm exec vitest run packages/local-server/tests apps/cli/tests apps/web/tests/viteConfig.test.ts
pnpm typecheck
pnpm build
rg -n "apps/cli/src|\.\./cli/src" apps/web packages/local-server
```

Expected: tests/typecheck/build pass; `rg` exits 1 with no matches.

- [ ] **Step 7: Commit**

```powershell
git add apps/cli apps/web/vite.config.ts apps/web/tests/viteConfig.test.ts packages/local-server
git commit -m "refactor: make cli a local server adapter"
```

### Task 7: Run full boundary and failure-mode acceptance

**Files:**

- Review: `packages/local-server/`
- Review: `apps/cli/`
- Review: `apps/web/vite.config.ts`
- Review: `.gitignore`

**Interfaces:**

- Verifies: one owner for Node IO and HTTP behavior.
- Verifies: atomic save and migration failure preserve source files.
- Verifies: local settings never enter author config or Git staging.

- [ ] **Step 1: Search dependency and ownership violations**

Run:

```powershell
rg -n "node:fs|node:http|node:child_process|YAML\.parse" apps/cli/src apps/web/src packages/core/src
rg -n "createRouteKitApiHandler|createHostingHandler" apps/cli/src apps/web/vite.config.ts packages/local-server/src
```

Expected: the first search has no Core/Web runtime IO matches and only acceptable CLI entry parsing; handler definitions exist only in Local Server.

- [ ] **Step 2: Verify local settings ignore and author separation**

Run:

```powershell
git check-ignore .clashroutekit/local.yaml
rg -n "publishBaseUrl|subconverterUrl" packages/core/src/config/authorTypes.ts config/routes.yaml
```

Expected: local settings file is ignored; v2 author types do not contain runtime URL fields. A still-unmigrated v1 repository config may contain them until the explicit migration plan is executed through the UI.

- [ ] **Step 3: Run the complete gate**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm check
pnpm generate
```

Expected: every command exits 0.

- [ ] **Step 4: Manually inject a migration write failure in the focused test**

Run:

```powershell
pnpm exec vitest run packages/local-server/tests/projectRepository.test.ts -t "migration"
```

Expected: the rollback test proves both original project and local settings content remain byte-identical.

- [ ] **Step 5: Inspect final worktree scope**

Run:

```powershell
git status --short
git diff --check
git diff --stat
```

Expected: no generated output or ignored local settings are tracked; only intended phase files and known user-owned changes remain.

- [ ] **Step 6: Commit final test-only corrections if present**

```powershell
git add packages/local-server/tests apps/cli/tests apps/web/tests/viteConfig.test.ts
git commit -m "test: verify local server boundaries"
```

Skip this commit when no corrections were required.
