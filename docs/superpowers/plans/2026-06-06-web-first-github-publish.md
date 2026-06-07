# Local-First GitHub 模板实施计划

> **给 agentic worker 的说明：** 必须按任务逐项执行本计划，并使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans。步骤使用 checkbox（`- [ ]`）语法追踪进度。

**目标：** 将 ClashRouteKit 改造成 local-first 仓库模板。用户可以 fork 或 clone 项目，通过本地 Web UI 编辑路由配置，并通过自己的 GitHub Actions `publish` 分支发布稳定的 INI/YAML 链接。

**架构：** `config/modules.yaml` 继续作为本地 Git checkout 中的唯一事实来源。浏览器 UI 只与本地 Vite dev server API 通信；该 API 读取/写入固定项目文件、运行现有校验/生成命令，并可调用本地 Git 命令。浏览器不调用 GitHub API，也不保存 GitHub token；GitHub 认证交给用户已有的本地 Git 设置。

**技术栈：** TypeScript、React 19、Vite dev server middleware、Node.js `fs`/`child_process`、Vitest、`yaml`、GitHub Actions。

---

## 产品形态

ClashRouteKit 应以 GitHub 仓库模板的方式呈现：

- 用户 fork 此仓库，或从模板创建新仓库。
- 用户将仓库 clone 到本地。
- 用户运行 `pnpm install` 和 `pnpm dev`。
- 本地 Web UI 通过本地 API 编辑 `config/modules.yaml` 和规则列表文件。
- 本地 Web UI 触发 `check`、`generate`、`git status`、`git commit` 和 `git push`。
- GitHub Actions 将生成输出发布到用户自己的 `publish` 分支。
- 用户的稳定 URL 保持为 `https://raw.githubusercontent.com/<owner>/<repo>/publish/templates/Custom_Clash.ini` 和 `https://raw.githubusercontent.com/<owner>/<repo>/publish/rules/<file>.yaml`。

这种方式避免了 Docker、Vercel、GitHub OAuth、浏览器持有 GitHub token，以及托管后端。

## 范围

范围内：

- 为 `RouteKitProjectConfig` 提供浏览器安全的 YAML parse/serialize helper。
- 为读取和写入 `config/modules.yaml` 提供本地 dev server API。
- Web UI 基于本地文件状态，而不是打包进来的只读 import。
- 模块启用/禁用变更可以持久化到 `config/modules.yaml`。
- 保留现有 `check` 和 `generate` 本地操作。
- 本地 Git 操作面板，支持 status、commit 和 push。
- 文档解释 fork/clone/run/edit/push/publish 工作流。

范围外：

- 公共托管 Web app。
- Vercel 部署。
- GitHub OAuth 或 PAT 流程。
- Docker image。
- 多用户编辑。
- GitHub raw URL 之外的动态服务端 INI/YAML endpoint。

## 文件结构

- 创建 `packages/core/src/configDocument.ts`
  浏览器安全的 `RouteKitProjectConfig` parse 和 serialize 工具。
- 修改 `packages/core/src/index.ts`
  导出 config document 工具。
- 创建 `packages/core/tests/configDocument.test.ts`
  验证解析、序列化和基础结构校验。
- 创建 `apps/web/src/projectState.ts`
  用于在不修改原始 config 的情况下切换模块 enabled 状态的纯 helper。
- 创建 `apps/web/tests/projectState.test.ts`
  验证状态 helper。
- 创建 `apps/web/src/localProject.ts`
  本地项目 API 的浏览器客户端。
- 创建 `apps/web/tests/localProject.test.ts`
  验证 API 请求/响应处理。
- 修改 `apps/web/dev/routeKitApi.ts`
  添加本地项目 config 读写 endpoint 和 Git 命令 endpoint。
- 修改 `apps/web/tests/routeKitApi.test.ts`
  使用注入依赖覆盖 config 读写和 Git 操作。
- 修改 `apps/web/src/actions.ts`
  扩展本地 action client 以支持 Git 命令。
- 修改 `apps/web/tests/actions.test.ts`
  验证 Git action 请求。
- 修改 `apps/web/src/config.ts`
  仅将打包 config 保留为启动 fallback。
- 修改 `apps/web/src/App.tsx`
  从本地 API 加载 config，持久化模块切换，并暴露 save/check/generate/git 控件。
- 修改 `apps/web/src/styles.css`
  为本地项目和 Git 控件添加样式。
- 修改 `README.md`
  记录仓库模板使用流程。

---

### 任务 1：添加浏览器安全的 Config Document 工具

**文件：**
- 创建：`packages/core/src/configDocument.ts`
- 修改：`packages/core/src/index.ts`
- 测试：`packages/core/tests/configDocument.test.ts`

- [x] **步骤 1：编写失败测试**

创建 `packages/core/tests/configDocument.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import {
  parseRouteKitConfig,
  serializeRouteKitConfig,
} from "../src/index.js";

describe("config document utilities", () => {
  const yaml = [
    "publishBaseUrl: http://127.0.0.1:8787",
    "",
    "template:",
    "  output: Custom_Clash.ini",
    "",
    "vendorRepos: []",
    "",
    "proxyGroups:",
    "  - name: Proxy",
    "    type: select",
    "    options:",
    "      - DIRECT",
    "",
    "modules:",
    "  - id: developer",
    "    policy: Proxy",
    "    geosite:",
    "      - github",
    "",
    "final:",
    "  policy: Proxy",
    "",
    "ruleProviders: []",
    "",
  ].join("\n");

  it("parses modules.yaml into a project config", () => {
    const config = parseRouteKitConfig(yaml);

    expect(config.template.output).toBe("Custom_Clash.ini");
    expect(config.proxyGroups[0]?.name).toBe("Proxy");
    expect(config.modules[0]?.id).toBe("developer");
    expect(config.final.policy).toBe("Proxy");
  });

  it("serializes project config with a trailing newline", () => {
    const serialized = serializeRouteKitConfig(parseRouteKitConfig(yaml));

    expect(serialized).toContain("publishBaseUrl: http://127.0.0.1:8787");
    expect(serialized).toContain("template:");
    expect(serialized.endsWith("\n")).toBe(true);
  });

  it("rejects documents that are not route kit project configs", () => {
    expect(() => parseRouteKitConfig("modules: nope\n")).toThrow("Invalid RouteKit project config");
  });
});
```

- [x] **步骤 2：运行聚焦测试并确认失败**

运行：`pnpm test -- packages/core/tests/configDocument.test.ts`

预期：失败，因为导出的函数尚不存在。

- [x] **步骤 3：实现 config document 工具**

创建 `packages/core/src/configDocument.ts`：

```ts
import YAML from "yaml";
import type { RouteKitProjectConfig } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRouteKitProjectConfig(value: unknown): asserts value is RouteKitProjectConfig {
  if (!isRecord(value)) {
    throw new Error("Invalid RouteKit project config: expected object");
  }

  const template = value.template;
  const final = value.final;
  if (
    typeof value.publishBaseUrl !== "string" ||
    !isRecord(template) ||
    typeof template.output !== "string" ||
    !Array.isArray(value.vendorRepos) ||
    !Array.isArray(value.proxyGroups) ||
    !Array.isArray(value.modules) ||
    !isRecord(final) ||
    typeof final.policy !== "string"
  ) {
    throw new Error("Invalid RouteKit project config");
  }
}

export function parseRouteKitConfig(text: string): RouteKitProjectConfig {
  const parsed = YAML.parse(text) as unknown;
  assertRouteKitProjectConfig(parsed);
  return parsed;
}

export function serializeRouteKitConfig(config: RouteKitProjectConfig): string {
  return YAML.stringify(config, { lineWidth: 0 }).replace(/\n?$/, "\n");
}
```

修改 `packages/core/src/index.ts`：

```ts
export {
  parseRouteKitConfig,
  serializeRouteKitConfig,
} from "./configDocument.js";
export { renderIni } from "./ini.js";
export {
  collectDomainProviderRules,
  convertDomainListCommunity,
  generateDomainProvider,
  summarizeDomainProvider,
} from "./rules.js";
export type {
  DomainListCommunityOptions,
  DomainProviderInput,
  DomainProviderRule,
  DomainProviderSummary,
  DomainListCommunitySource,
  ClashListSource,
  ClashProviderSource,
  ProviderBehavior,
  ProviderReference,
  ProxyGroup,
  RouteKitProjectConfig,
  RouteKitConfig,
  RouteModule,
  RuleProviderConfig,
  RuleProviderSource,
  SourceBase,
  VendorRepoConfig,
} from "./types.js";
```

- [x] **步骤 4：确认测试通过**

运行：`pnpm test -- packages/core/tests/configDocument.test.ts`

预期：通过。

- [x] **步骤 5：记录进度**

验证命令通过后，将任务 1 标记为完成。

---

### 任务 2：添加纯 Project State Helper

**文件：**
- 创建：`apps/web/src/projectState.ts`
- 测试：`apps/web/tests/projectState.test.ts`

- [x] **步骤 1：编写失败的 project state 测试**

创建 `apps/web/tests/projectState.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import {
  setModuleEnabled,
  toggleModuleEnabled,
} from "../src/projectState.js";

describe("project state helpers", () => {
  const config: RouteKitProjectConfig = {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    proxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
    modules: [
      { id: "developer", policy: "Proxy" },
      { id: "streaming", enabled: false, policy: "Proxy" },
    ],
    final: { policy: "Proxy" },
    ruleProviders: [],
  };

  it("sets module enabled state without mutating the original config", () => {
    const next = setModuleEnabled(config, "developer", false);

    expect(next.modules[0]).toEqual({ id: "developer", enabled: false, policy: "Proxy" });
    expect(config.modules[0]).toEqual({ id: "developer", policy: "Proxy" });
  });

  it("toggles missing enabled flags as enabled by default", () => {
    const next = toggleModuleEnabled(config, "developer");

    expect(next.modules[0]).toEqual({ id: "developer", enabled: false, policy: "Proxy" });
  });

  it("toggles explicit disabled modules to enabled", () => {
    const next = toggleModuleEnabled(config, "streaming");

    expect(next.modules[1]).toEqual({ id: "streaming", enabled: true, policy: "Proxy" });
  });
});
```

- [x] **步骤 2：运行聚焦测试并确认失败**

运行：`pnpm test -- apps/web/tests/projectState.test.ts`

预期：失败，因为 `projectState.ts` 不存在。

- [x] **步骤 3：实现 project state helper**

创建 `apps/web/src/projectState.ts`：

```ts
import type { RouteKitProjectConfig, RouteModule } from "@clash-route-kit/core";

function isModuleEnabled(module: RouteModule): boolean {
  return module.enabled !== false;
}

export function setModuleEnabled(
  config: RouteKitProjectConfig,
  moduleId: string,
  enabled: boolean,
): RouteKitProjectConfig {
  return {
    ...config,
    modules: config.modules.map((module) =>
      module.id === moduleId ? { ...module, enabled } : module,
    ),
  };
}

export function toggleModuleEnabled(
  config: RouteKitProjectConfig,
  moduleId: string,
): RouteKitProjectConfig {
  const module = config.modules.find((item) => item.id === moduleId);
  if (!module) return config;
  return setModuleEnabled(config, moduleId, !isModuleEnabled(module));
}
```

- [x] **步骤 4：确认测试通过**

运行：`pnpm test -- apps/web/tests/projectState.test.ts`

预期：通过。

- [x] **步骤 5：记录进度**

验证命令通过后，将任务 2 标记为完成。

---

### 任务 3：添加本地项目 API Client

**文件：**
- 创建：`apps/web/src/localProject.ts`
- 测试：`apps/web/tests/localProject.test.ts`

- [x] **步骤 1：编写失败的本地项目 client 测试**

创建 `apps/web/tests/localProject.test.ts`：

```ts
import { describe, expect, it, vi } from "vitest";
import {
  loadLocalProjectConfig,
  saveLocalProjectConfig,
} from "../src/localProject.js";

describe("local project client", () => {
  const config = {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    proxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
    modules: [{ id: "ai", policy: "Proxy" }],
    final: { policy: "Proxy" },
    ruleProviders: [],
  };

  it("loads config from the local project endpoint", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          yaml: "publishBaseUrl: http://127.0.0.1:8787\n",
          config,
        }),
        { status: 200 },
      ),
    );

    await expect(loadLocalProjectConfig(fetcher)).resolves.toEqual({
      yaml: "publishBaseUrl: http://127.0.0.1:8787\n",
      config,
    });
    expect(fetcher).toHaveBeenCalledWith("/api/project/config");
  });

  it("saves config to the local project endpoint", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          yaml: "publishBaseUrl: http://127.0.0.1:8787\n",
          config,
        }),
        { status: 200 },
      ),
    );

    await expect(saveLocalProjectConfig(config, fetcher)).resolves.toEqual({
      yaml: "publishBaseUrl: http://127.0.0.1:8787\n",
      config,
    });
    expect(fetcher).toHaveBeenCalledWith("/api/project/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config }),
    });
  });

  it("throws when the local API returns an invalid payload", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 500 }));

    await expect(loadLocalProjectConfig(fetcher)).rejects.toThrow("Invalid local project response");
  });
});
```

- [x] **步骤 2：运行聚焦测试并确认失败**

运行：`pnpm test -- apps/web/tests/localProject.test.ts`

预期：失败，因为 `localProject.ts` 不存在。

- [x] **步骤 3：实现本地项目 client**

创建 `apps/web/src/localProject.ts`：

```ts
import type { RouteKitProjectConfig } from "@clash-route-kit/core";

export interface LocalProjectConfigResponse {
  yaml: string;
  config: RouteKitProjectConfig;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isLocalProjectConfigResponse(value: unknown): value is LocalProjectConfigResponse {
  const candidate = value as LocalProjectConfigResponse;
  return (
    typeof candidate?.yaml === "string" &&
    typeof candidate.config === "object" &&
    candidate.config !== null
  );
}

async function readProjectResponse(response: Response): Promise<LocalProjectConfigResponse> {
  const payload = (await response.json()) as unknown;
  if (!response.ok || !isLocalProjectConfigResponse(payload)) {
    throw new Error("Invalid local project response");
  }
  return payload;
}

export async function loadLocalProjectConfig(
  fetcher: Fetcher = globalThis.fetch,
): Promise<LocalProjectConfigResponse> {
  return readProjectResponse(await fetcher("/api/project/config"));
}

export async function saveLocalProjectConfig(
  config: RouteKitProjectConfig,
  fetcher: Fetcher = globalThis.fetch,
): Promise<LocalProjectConfigResponse> {
  return readProjectResponse(
    await fetcher("/api/project/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config }),
    }),
  );
}
```

- [x] **步骤 4：确认测试通过**

运行：`pnpm test -- apps/web/tests/localProject.test.ts`

预期：通过。

- [x] **步骤 5：记录进度**

验证命令通过后，将任务 3 标记为完成。

---

### 任务 4：添加本地 Config 读写 API

**文件：**
- 修改：`apps/web/dev/routeKitApi.ts`
- 修改：`apps/web/tests/routeKitApi.test.ts`

- [x] **步骤 1：为 config 读写 helper 添加 routeKitApi 测试**

追加到 `apps/web/tests/routeKitApi.test.ts`：

```ts
import {
  readProjectConfigFile,
  writeProjectConfigFile,
} from "../dev/routeKitApi.js";

describe("project config file helpers", () => {
  const configYaml = [
    "publishBaseUrl: http://127.0.0.1:8787",
    "template:",
    "  output: Custom_Clash.ini",
    "vendorRepos: []",
    "proxyGroups:",
    "  - name: Proxy",
    "    type: select",
    "    options:",
    "      - DIRECT",
    "modules:",
    "  - id: ai",
    "    policy: Proxy",
    "final:",
    "  policy: Proxy",
    "ruleProviders: []",
    "",
  ].join("\n");

  it("reads and parses config/modules.yaml", async () => {
    const result = await readProjectConfigFile({
      root: "E:/repo",
      configFile: "config/modules.yaml",
      readText: async (filePath) => {
        expect(filePath).toBe("E:\\repo\\config\\modules.yaml");
        return configYaml;
      },
    });

    expect(result.yaml).toBe(configYaml);
    expect(result.config.modules[0]?.id).toBe("ai");
  });

  it("serializes and writes config/modules.yaml", async () => {
    const writes: Array<{ filePath: string; text: string }> = [];
    const result = await writeProjectConfigFile({
      root: "E:/repo",
      configFile: "config/modules.yaml",
      config: {
        publishBaseUrl: "http://127.0.0.1:8787",
        template: { output: "Custom_Clash.ini" },
        vendorRepos: [],
        proxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
        modules: [{ id: "ai", policy: "Proxy" }],
        final: { policy: "Proxy" },
        ruleProviders: [],
      },
      writeText: async (filePath, text) => {
        writes.push({ filePath, text });
      },
    });

    expect(writes[0]?.filePath).toBe("E:\\repo\\config\\modules.yaml");
    expect(writes[0]?.text).toContain("modules:");
    expect(result.config.modules[0]?.id).toBe("ai");
  });
});
```

- [x] **步骤 2：运行聚焦测试并确认失败**

运行：`pnpm test -- apps/web/tests/routeKitApi.test.ts`

预期：失败，因为 project config helper 还没有导出。

- [x] **步骤 3：实现 config file helper**

修改 `apps/web/dev/routeKitApi.ts` 中的 import：

```ts
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseRouteKitConfig,
  serializeRouteKitConfig,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";
```

在 `runRouteKitAction` 上方添加这些接口和函数：

```ts
type ReadText = (filePath: string) => Promise<string>;
type WriteText = (filePath: string, text: string) => Promise<void>;

export interface ProjectConfigFileOptions extends ProgramOptions {
  readText?: ReadText;
}

export interface WriteProjectConfigFileOptions extends ProgramOptions {
  config: RouteKitProjectConfig;
  writeText?: WriteText;
}

export interface ProjectConfigFileResult {
  yaml: string;
  config: RouteKitProjectConfig;
}

function projectConfigPath(options: ProgramOptions): string {
  return path.resolve(options.root, options.configFile);
}

export async function readProjectConfigFile(
  options: ProjectConfigFileOptions,
): Promise<ProjectConfigFileResult> {
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  const yaml = await readText(projectConfigPath(options));
  return {
    yaml,
    config: parseRouteKitConfig(yaml),
  };
}

export async function writeProjectConfigFile(
  options: WriteProjectConfigFileOptions,
): Promise<ProjectConfigFileResult> {
  const writeText = options.writeText ?? ((filePath: string, text: string) => writeFile(filePath, text, "utf8"));
  const yaml = serializeRouteKitConfig(options.config);
  await writeText(projectConfigPath(options), yaml);
  return {
    yaml,
    config: options.config,
  };
}
```

- [x] **步骤 4：添加 project config HTTP routes**

在 `createRouteKitApiHandler` 内、`/api/actions/` 分支之前添加：

```ts
if (url.pathname === "/api/project/config") {
  if (request.method === "GET") {
    void readProjectConfigFile(options)
      .then((result) => writeJson(response, 200, result))
      .catch((error: unknown) => {
        writeJson(response, 500, {
          ok: false,
          output: error instanceof Error ? error.message : String(error),
        });
      });
    return;
  }

  if (request.method === "PUT") {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    request.on("end", () => {
      void Promise.resolve()
        .then(() => JSON.parse(body) as { config?: RouteKitProjectConfig })
        .then((payload) => {
          if (!payload.config) {
            throw new Error("Missing config");
          }
          return writeProjectConfigFile({ ...options, config: payload.config });
        })
        .then((result) => writeJson(response, 200, result))
        .catch((error: unknown) => {
          writeJson(response, 400, {
            ok: false,
            output: error instanceof Error ? error.message : String(error),
          });
        });
    });
    return;
  }

  writeJson(response, 405, { ok: false, output: "Method not allowed" });
  return;
}
```

- [x] **步骤 5：确认 routeKitApi 测试通过**

运行：`pnpm test -- apps/web/tests/routeKitApi.test.ts`

预期：通过。

- [x] **步骤 6：记录进度**

验证命令通过后，将任务 4 标记为完成。

---

### 任务 5：添加本地 Git Actions

**文件：**
- 修改：`apps/web/dev/routeKitApi.ts`
- 修改：`apps/web/src/actions.ts`
- 修改：`apps/web/tests/actions.test.ts`
- 修改：`apps/web/tests/routeKitApi.test.ts`

- [x] **步骤 1：扩展 action client 测试**

追加到 `apps/web/tests/actions.test.ts`：

```ts
it("posts to the local git status endpoint", async () => {
  const fetcher = vi.fn(async () =>
    new Response(JSON.stringify({ action: "git-status", ok: true, output: "clean" }), {
      headers: { "content-type": "application/json" },
      status: 200,
    }),
  );

  await expect(requestLocalAction("git-status", fetcher)).resolves.toEqual({
    action: "git-status",
    ok: true,
    output: "clean",
  });
  expect(fetcher).toHaveBeenCalledWith("/api/actions/git-status", { method: "POST" });
});
```

- [x] **步骤 2：运行 action 测试并确认失败**

运行：`pnpm test -- apps/web/tests/actions.test.ts`

预期：失败，因为 `git-status` 还不是有效 action。

- [x] **步骤 3：扩展 action 类型**

修改 `apps/web/src/actions.ts`：

```ts
export type LocalRouteKitAction = "check" | "generate" | "git-status" | "git-commit" | "git-push";
```

更新 `isLocalActionResponse`：

```ts
const actions: LocalRouteKitAction[] = ["check", "generate", "git-status", "git-commit", "git-push"];
return (
  actions.includes(candidate?.action) &&
  typeof candidate.ok === "boolean" &&
  typeof candidate.output === "string"
);
```

- [x] **步骤 4：为 Git actions 添加 routeKitApi 测试**

追加到 `apps/web/tests/routeKitApi.test.ts`：

```ts
describe("git route kit actions", () => {
  const baseOptions = {
    root: "E:/repo",
    configFile: "config/modules.yaml",
  };

  it("runs git status through injected command runner", async () => {
    const result = await runRouteKitAction("git-status", {
      ...baseOptions,
      runCommand: async (command, args, cwd) => {
        expect(command).toBe("git");
        expect(args).toEqual(["status", "--short"]);
        expect(cwd).toBe("E:/repo");
        return " M config/modules.yaml\n";
      },
    });

    expect(result).toEqual({
      action: "git-status",
      ok: true,
      output: " M config/modules.yaml\n",
    });
  });

  it("commits config changes through injected command runner", async () => {
    const commands: string[] = [];
    const result = await runRouteKitAction("git-commit", {
      ...baseOptions,
      runCommand: async (command, args) => {
        commands.push([command, ...args].join(" "));
        return "";
      },
    });

    expect(commands).toEqual([
      "git add config/modules.yaml config/rules",
      "git commit -m chore: update route config",
    ]);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("[git] committed route config");
  });
});
```

- [x] **步骤 5：实现 Git action runner**

在 `apps/web/dev/routeKitApi.ts` 中添加 import：

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
```

添加类型：

```ts
const execFileAsync = promisify(execFile);

type RunCommand = (command: string, args: string[], cwd: string) => Promise<string>;

async function defaultRunCommand(command: string, args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync(command, args, { cwd });
  return [result.stdout, result.stderr].filter(Boolean).join("");
}
```

扩展 `RouteKitAction`：

```ts
export type RouteKitAction = "check" | "generate" | "git-status" | "git-commit" | "git-push";
```

扩展 `RouteKitActionDependencies`：

```ts
interface RouteKitActionDependencies {
  checkConfig?: typeof checkConfig;
  generateOutputs?: typeof generateOutputs;
  runCommand?: RunCommand;
}
```

在 generate 处理前添加 Git 分支：

```ts
const runCommand = options.runCommand ?? defaultRunCommand;

if (action === "git-status") {
  const output = await runCommand("git", ["status", "--short"], options.root);
  return {
    action,
    ok: true,
    output: output || "[git] working tree clean",
  };
}

if (action === "git-commit") {
  await runCommand("git", ["add", "config/modules.yaml", "config/rules"], options.root);
  const output = await runCommand("git", ["commit", "-m", "chore: update route config"], options.root);
  return {
    action,
    ok: true,
    output: output || "[git] committed route config",
  };
}

if (action === "git-push") {
  const output = await runCommand("git", ["push"], options.root);
  return {
    action,
    ok: true,
    output: output || "[git] pushed current branch",
  };
}
```

更新 `parseRouteKitAction`：

```ts
function parseRouteKitAction(pathname: string): RouteKitAction | null {
  if (pathname === "/api/actions/check") return "check";
  if (pathname === "/api/actions/generate") return "generate";
  if (pathname === "/api/actions/git-status") return "git-status";
  if (pathname === "/api/actions/git-commit") return "git-commit";
  if (pathname === "/api/actions/git-push") return "git-push";
  return null;
}
```

- [x] **步骤 6：确认 Git action 测试通过**

运行：

```powershell
pnpm test -- apps/web/tests/actions.test.ts apps/web/tests/routeKitApi.test.ts
```

预期：通过。

- [x] **步骤 7：记录进度**

验证命令通过后，将任务 5 标记为完成。

---

### 任务 6：让 Web UI 加载并保存本地 Config

**文件：**
- 修改：`apps/web/src/config.ts`
- 修改：`apps/web/src/App.tsx`
- 修改：`apps/web/src/styles.css`

- [x] **步骤 1：仅将打包 config 保留为 fallback**

修改 `apps/web/src/config.ts`：

```ts
import { parseRouteKitConfig } from "@clash-route-kit/core";
import modulesYaml from "../../../config/modules.yaml?raw";

export const bundledProjectConfig = parseRouteKitConfig(modulesYaml);
export const bundledProjectConfigYaml = modulesYaml;
```

- [x] **步骤 2：更新 App imports**

在 `apps/web/src/App.tsx` 中替换 config import：

```ts
import { bundledProjectConfig, bundledProjectConfigYaml } from "./config.js";
```

添加 import：

```ts
import { loadLocalProjectConfig, saveLocalProjectConfig } from "./localProject.js";
import { toggleModuleEnabled } from "./projectState.js";
```

- [x] **步骤 3：添加本地项目状态**

在 `App` 内替换 config 和 enabled 初始化：

```ts
const [config, setConfig] = useState<RouteKitProjectConfig>(bundledProjectConfig);
const [configYaml, setConfigYaml] = useState(bundledProjectConfigYaml);
const [projectState, setProjectState] = useState<{
  status: "loading" | "ready" | "saving" | "error";
  message: string;
}>({
  status: "loading",
  message: "正在读取本地 config/modules.yaml",
});
const [selectedModuleId, setSelectedModuleId] = useState(bundledProjectConfig.modules[0]?.id ?? "");
```

移除旧的 `enabled` state、`defaultEnabled` 和 `activeProjectConfig`。

- [x] **步骤 4：启动时加载本地 config**

在 `App` 内添加此 effect：

```ts
useEffect(() => {
  let alive = true;

  void loadLocalProjectConfig()
    .then((result) => {
      if (!alive) return;
      setConfig(result.config);
      setConfigYaml(result.yaml);
      setSelectedModuleId(result.config.modules[0]?.id ?? "");
      setProjectState({
        status: "ready",
        message: "已读取本地 config/modules.yaml",
      });
    })
    .catch((error: unknown) => {
      if (!alive) return;
      setProjectState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    });

  return () => {
    alive = false;
  };
}, []);
```

- [x] **步骤 5：将模块切换持久化到本地 config state**

替换模块切换 callback：

```tsx
onToggle={() => {
  setConfig((current) => toggleModuleEnabled(current, module.id));
  setProjectState({
    status: "ready",
    message: "有未保存的本地配置修改",
  });
}}
```

- [x] **步骤 6：添加保存 handler**

在 `App` 内添加此函数：

```ts
async function saveLocalProject() {
  setProjectState({
    status: "saving",
    message: "正在写入 config/modules.yaml",
  });

  try {
    const result = await saveLocalProjectConfig(config);
    setConfig(result.config);
    setConfigYaml(result.yaml);
    setProjectState({
      status: "ready",
      message: "已保存 config/modules.yaml，可运行检查、生成和提交",
    });
  } catch (error: unknown) {
    setProjectState({
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
```

- [x] **步骤 7：将本地项目控件添加到 UI**

在右侧栏顶部附近添加一个 panel：

```tsx
<section className="panel local-project-panel">
  <div className="panel-heading">
    <div>
      <h2>本地项目</h2>
      <span>{projectState.status}</span>
    </div>
    <Settings2 size={18} />
  </div>
  <div className="local-project-actions">
    <button
      className="command-button"
      disabled={projectState.status === "saving"}
      type="button"
      onClick={saveLocalProject}
    >
      保存配置
    </button>
    <p className={`project-message ${projectState.status}`}>{projectState.message}</p>
  </div>
</section>
```

- [x] **步骤 8：添加本地项目样式**

追加到 `apps/web/src/styles.css`：

```css
.local-project-actions {
  display: grid;
  gap: 12px;
}

.project-message {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
}

.project-message.error {
  color: #b42318;
}
```

- [x] **步骤 9：验证 Web 测试和 typecheck**

运行：

```powershell
pnpm test -- apps/web/tests/localProject.test.ts apps/web/tests/projectState.test.ts apps/web/tests/routeSummary.test.ts
pnpm typecheck
```

预期：全部测试通过，typecheck 成功。

- [x] **步骤 10：记录进度**

验证命令通过后，将任务 6 标记为完成。

---

### 任务 7：在 Web UI 中暴露 Git 工作流

**文件：**
- 修改：`apps/web/src/App.tsx`
- 修改：`apps/web/src/styles.css`

- [x] **步骤 1：向现有 operations panel 添加 Git actions**

在 `LocalActionsPanel` 中，把按钮添加到 check/generate 旁边：

```tsx
<button className="command-button" disabled={running} type="button" onClick={() => onRun("git-status")}>
  <Play size={16} />
  Git 状态
</button>
<button className="command-button" disabled={running} type="button" onClick={() => onRun("git-commit")}>
  <Play size={16} />
  提交配置
</button>
<button className="command-button" disabled={running} type="button" onClick={() => onRun("git-push")}>
  <Play size={16} />
  推送发布
</button>
```

- [x] **步骤 2：为发布流程添加 helper text**

在 action toolbar 下方添加：

```tsx
<p className="operation-hint">
  推荐顺序：保存配置 -> 运行检查 -> 生成输出 -> 提交配置 -> 推送发布。推送后 GitHub Actions 会生成 publish 分支。
</p>
```

- [x] **步骤 3：设置 operation hint 样式**

追加到 `apps/web/src/styles.css`：

```css
.operation-hint {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
}
```

- [x] **步骤 4：确认 typecheck**

运行：`pnpm typecheck`

预期：通过。

- [x] **步骤 5：记录进度**

验证命令通过后，将任务 7 标记为完成。

---

### 任务 8：更新产品文档

**文件：**
- 修改：`README.md`

- [x] **步骤 1：更新 README quickstart**

将此章节添加到 `README.md`：

````md
## Local-first usage

ClashRouteKit is intended to be used as a repository template.

1. Fork this repository or create a new repository from the template.
2. Clone your repository locally.
3. Install dependencies with `pnpm install`.
4. Start the local Web editor with `pnpm dev`.
5. Edit route modules in the Web UI.
6. Click `保存配置`, then run `检查`, `生成输出`, `提交配置`, and `推送发布`.
7. Wait for GitHub Actions to publish the `publish` branch.

Published files are available at:

```text
https://raw.githubusercontent.com/<owner>/<repo>/publish/templates/Custom_Clash.ini
https://raw.githubusercontent.com/<owner>/<repo>/publish/rules/<Provider_File>.yaml
```

The Web UI does not require GitHub OAuth or a browser token. It uses the local dev server to write files and relies on your local Git credentials for `git push`.
````

- [x] **步骤 2：移除过时的项目状态依赖**

保持 `docs/project-status.md` 已删除。正式项目方向现在位于本计划和 `README.md`。

- [x] **步骤 3：确认 docs 按预期被 Git 跟踪**

运行：

```powershell
git status --short --untracked-files=all
git check-ignore -q docs/superpowers/plans/2026-06-06-web-first-github-publish.md; if ($LASTEXITCODE -eq 0) { "plan ignored" } else { "plan tracked or unignored" }
```

预期：

```text
plan tracked or unignored
```

- [x] **步骤 4：记录进度**

验证命令通过后，将任务 8 标记为完成。

---

### 任务 9：完整验证

**文件：**
- 无新增文件。

- [x] **步骤 1：运行完整测试**

运行：`pnpm test`

预期：全部 Vitest suites 通过。

- [x] **步骤 2：运行完整 typecheck**

运行：`pnpm typecheck`

预期：所有 workspace TypeScript 检查通过。

- [x] **步骤 3：运行完整 build**

运行：`pnpm build`

预期：core、CLI 和 Web 构建成功。

- [x] **步骤 4：验证本地生成**

运行：

```powershell
pnpm check
pnpm generate
```

预期：`pnpm check` 不报告诊断，`pnpm generate` 在 `output/` 下写入模板、rule provider YAML 和 report 文件。

- [x] **步骤 5：手动本地 Web 验证**

运行：`pnpm dev`

打开本地 Vite URL 并验证：

- 应用从 `/api/project/config` 加载 `config/modules.yaml`。
- 切换模块会改变预览。
- 点击 `保存配置` 会写入 `config/modules.yaml`。
- 点击 `运行检查` 返回 check 输出。
- 点击 `生成输出` 写入 output。
- 点击 `Git 状态` 显示 changed files。
- `提交配置` 和 `推送发布` 按钮可见；自动验证期间不要点击它们，除非用户明确要求创建 commit 或 push。
- 浏览器不会请求或保存 GitHub token。

- [x] **步骤 6：记录验证状态**

最终验证通过后，不需要额外 fix commit。

---

## 操作说明

- 该设计有意不解决托管编辑。用户从自己的本地 clone 中编辑。
- 本地 dev server API 必须只操作固定项目路径和固定命令集合。
- 浏览器不得接受任意文件系统路径或任意 shell 命令。
- Git 认证由用户机器通过 Git Credential Manager、GitHub CLI 或 SSH 处理。
- `output/` 在 `main` 上保持 ignored；GitHub Actions 仍然负责发布生成的 raw URL。
- CLI 对 CI 和直接本地脚本仍然有用，但主要用户体验是 Web UI。

## 自检

- Spec 覆盖：计划覆盖 fork/clone 本地使用、本地 Web 编辑、本地文件持久化、本地 Git actions、GitHub Actions 发布和稳定 raw URL。
- 占位符扫描：计划不包含未解决的占位说明。
- 类型一致性：`RouteKitProjectConfig`、本地 action 名称、本地 API payload 和 route path 在各任务中保持一致。
