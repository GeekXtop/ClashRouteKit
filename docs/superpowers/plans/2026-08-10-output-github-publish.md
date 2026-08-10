# Device Output and GitHub Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将“输出”页完成为默认本地设备配置与可选 GitHub 发布双标签闭环，让用户无需 GitHub 即可生成/下载配置，并让 GitHub 发布文案、分支流向和 Actions 状态与真实行为一致。

**Architecture:** Output 页共享 `TemplateSourceStatus`，Device Config tab 只依赖一个可访问模板 URL，默认使用本地实时模板；必要的订阅数据只保留在组件 state 和瞬时转换请求中。GitHub tab 从 Local Server 获取结构化复核，服务端强制 `main`、统一校验、限定 staging、提交推送并查询 Actions；只有匹配 source SHA 的 workflow 成功后远程模板才标记为最新。

**Tech Stack:** React 19、Ant Design 5、QRCode、TypeScript 5.8、Node.js 22 `fetch`/Git adapter、GitHub REST Actions API、GitHub Actions、Vitest 3.2、Testing Library、pnpm 9.1.4。

## Global Constraints

- “输出”是一级页面；内部标签固定为默认 `设备配置` 与带“可选”标记的 `GitHub 发布`。
- 设备配置依赖“SubConverter 可访问的模板 URL”，不依赖 GitHub 发布完成。
- 本地实时模板是默认来源；GitHub 远程模板仅在匹配当前 source SHA 的 Actions 成功后标记最新。
- 页面顶部共享显示 Schema/校验、本地模板 URL/可用状态、GitHub 远程模板/最后发布时间。
- 设备配置支持一条或多条订阅、配置名称、SubConverter 端点、下载、复制链接和二维码。
- User-Agent、Emoji、UDP、跳过证书、排序、附加类型、规则集、包含/排除、自定义参数默认收在折叠的高级转换选项中。
- 订阅 URL/Token 只存在 React 组件会话 state、生成链接/二维码和必要的瞬时转换 HTTP 请求中。
- 订阅 URL/Token 不得写入 `AuthorProjectConfig`、`.clashroutekit/local.yaml`、Git、日志、错误消息、localStorage、sessionStorage、IndexedDB 或 Service Worker cache。
- Local Server 不记录设备配置请求 body；任何错误对象只返回错误码和脱敏消息。
- SubConverter 临时覆盖只保存在当前 Output 页面 state；刷新恢复本地设置值。
- 设备生成失败必须区分 `input-invalid`、`template-unreachable`、`subconverter-unreachable` 和 `conversion-rejected`，并保留表单。
- 模板 URL 必须来自服务端计算的 local/GitHub source status；设备生成 API 不接受任意模板 URL。
- SubConverter 端点仅允许 HTTP/HTTPS；请求设置超时并限制响应体大小，避免本地进程无限等待或占用内存。
- GitHub origin 必须可解析为 github.com 仓库；非 GitHub remote 只影响可选发布，不影响本地设备配置。
- GitHub 发布流程固定为：复核 → 统一校验 → 提交并推送 `main` → Actions 生成 `publish` → 状态成功后远程模板最新。
- 当前分支不是 `main` 时，在 `git add` 前阻断并返回 `git.branch.not-main`。
- Git staging 只包含 `config/routes.yaml` 和 `config/rules`；不得提交 `.clashroutekit/local.yaml`、订阅数据、`output/` 或其它用户改动。
- 本地主按钮文案固定为“提交并推送 main”；不得再出现“构建并推送 publish 分支”。
- 本地发布用例不直接写 `publish` 分支；`.github/workflows/publish.yml` 是唯一发布分支写入者。
- workflow concurrency 固定取消同一仓库/main 发布目标的旧运行。
- generate/commit/push/Actions 每个步骤单独报告；失败不得合并成泛化“发布失败”。
- 默认只显示结构化实体变更摘要；完整规范化 INI diff 仅在用户展开后请求/渲染。
- Actions 查询使用公共 API或仅从环境变量读取的 `GITHUB_TOKEN`；Token 不进入本地设置或项目配置。
- 独立状态请求并行执行；列表/state 更新使用函数式 setState，不用 effect 保存可派生状态。
- 1200px 与 360px 都保留同页双标签；移动端订阅行垂直排列，不隐藏 GitHub 入口。
- 修改使用 `apply_patch`；不覆盖用户配置和无关工作树修改。

---

## File Structure

### Shared output contracts and status

- Create: `packages/local-server/src/output/outputContracts.ts` — status, device request/result/error, publish review/result DTOs。
- Create: `packages/local-server/src/output/templateSourceStatus.ts` — local/GitHub template status computation。
- Create: `packages/local-server/tests/templateSourceStatus.test.ts`。
- Modify: `packages/local-server/src/contracts.ts`, `src/index.ts` — public exports。
- Create: `apps/web/src/features/output/outputApi.ts` — typed API guards/calls。
- Create: `apps/web/src/features/output/templateSourceStatus.ts` — display derivation only。
- Create: `apps/web/tests/outputApi.test.ts`。

### Device configuration use case and UI

- Create: `packages/local-server/src/output/deviceConfig.ts` — validate, template probe, SubConverter request, redacted errors。
- Create: `packages/local-server/src/http/outputRoutes.ts` — status/device endpoints。
- Create: `packages/local-server/tests/deviceConfig.test.ts`。
- Create: `packages/local-server/tests/outputRoutes.test.ts`。
- Create: `apps/web/src/features/output/deviceConfigModel.ts` — providers/options/link builder with direct `templateUrl` input。
- Create: `apps/web/src/features/output/DeviceConfigTab.tsx`。
- Create: `apps/web/src/features/output/AdvancedConvertOptions.tsx`。
- Create: `apps/web/tests/deviceConfigModel.test.ts`。
- Create: `apps/web/tests/deviceConfigTab.test.tsx`。

### GitHub publish use case and UI

- Create: `packages/local-server/src/git/githubRemote.ts` — remote parser/raw URL/actions URL。
- Create: `packages/local-server/src/git/githubActionsClient.ts` — Actions REST query。
- Create: `packages/local-server/src/git/publishReview.ts` — Git HEAD vs working author/normalized summary and lazy INI diff。
- Create: `packages/local-server/src/git/publishMain.ts` — main-only validate/commit/push/status orchestration。
- Create: `packages/local-server/src/http/githubRoutes.ts`。
- Create: `packages/local-server/tests/githubActionsClient.test.ts`。
- Create: `packages/local-server/tests/publishReview.test.ts`。
- Create: `packages/local-server/tests/githubPublish.test.ts`。
- Create: `packages/local-server/tests/githubRoutes.test.ts`。
- Create: `apps/web/src/features/output/GitHubPublishTab.tsx`。
- Create: `apps/web/src/features/output/PublishStepList.tsx`。
- Create: `apps/web/tests/githubPublishTab.test.tsx`。
- Modify: `.github/workflows/publish.yml` — concurrency。

### Final Output page and cleanup

- Rewrite: `apps/web/src/features/output/OutputPage.tsx` — shared status + tabs。
- Create: `apps/web/tests/outputPage.test.tsx`。
- Modify: `apps/web/src/styles.css`。
- Delete after GREEN: old `PublishPage.tsx`, `PublishLeftPanel.tsx`, `ConfigYamlSection.tsx`, related tests。
- Delete/move after GREEN: root `publishWorkflow.ts`, `subscriptions.ts`, obsolete publish action sequencing where unused。

---

### Task 1: Define template, device and publish contracts and status computation

**Files:**

- Create: `packages/local-server/src/output/outputContracts.ts`
- Create: `packages/local-server/src/output/templateSourceStatus.ts`
- Create: `packages/local-server/src/git/githubRemote.ts`
- Create: `packages/local-server/tests/templateSourceStatus.test.ts`
- Modify: `packages/local-server/src/contracts.ts`
- Modify: `packages/local-server/src/index.ts`
- Create: `apps/web/src/features/output/outputApi.ts`
- Create: `apps/web/src/features/output/templateSourceStatus.ts`
- Create: `apps/web/tests/outputApi.test.ts`

**Interfaces:**

- Produces: `TemplateEndpointStatus`, `TemplateSourceStatus`.
- Produces: `GitHubRepo`, `parseGitHubRemote`, `createGitHubUrls`.
- Produces: `DeviceConfigRequest`, `DeviceConfigErrorCode`, `DeviceConfigResponseMeta`.
- Produces: `PublishStep`, `GitHubPublishReview`, `GitHubPublishResult`.
- Produces: `getTemplateSourceStatus(options)`.
- Produces Web API: `fetchTemplateSourceStatus`, `requestDeviceConfig`, `fetchGitHubPublishReview`, `publishGitHubMain`, `fetchGitHubActionsStatus`.

- [ ] **Step 1: Write local-only and remote-latest status RED tests**

Create `packages/local-server/tests/templateSourceStatus.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  getTemplateSourceStatus,
  type ExecutableProject,
  type ResolvedLocalSettings,
} from "../src/index.js";

const executableProject: ExecutableProject = {
  authorVersion: 2,
  config: {
    schemaVersion: 2,
    project: { template: { output: "Custom_Clash.ini" } },
    memberSets: {},
    proxyGroups: [{ id: "proxy", name: "Proxy", type: "select", members: [{ builtin: "DIRECT" }] }],
    routes: [{ id: "final", policy: { group: "proxy" }, source: { type: "final" } }],
    ruleProviders: [],
    vendorRepos: [],
  },
  normalized: {
    schemaVersion: 2,
    template: { output: "Custom_Clash.ini" },
    proxyGroups: [{ id: "proxy", name: "Proxy", type: "select", members: [{ type: "builtin", value: "DIRECT" }], nodeFilters: [] }],
    routes: [{ id: "final", policy: { type: "group", id: "proxy", name: "Proxy" }, source: { type: "final" } }],
    ruleProviders: [],
    vendorRepos: [],
    globalRemove: [],
  },
  renderProject: {
    routeConfig: {
      publishBaseUrl: "http://192.168.1.10:8787",
      customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"], nodeFilters: [] }],
      ruleSets: [{ id: "final", policy: "Proxy", source: { type: "final" } }],
    },
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    ruleProviders: [],
    globalRemove: [],
  },
  diagnostics: [],
};

const resolvedSettings: ResolvedLocalSettings = {
  serve: { host: "0.0.0.0", port: 8787, publicBaseUrl: "http://192.168.1.10:8787" },
  subconverterUrl: "http://127.0.0.1:25500/sub",
  sources: {
    host: "local",
    port: "local",
    publicBaseUrl: "local",
    subconverterUrl: "local",
  },
};

it("returns an available local source when GitHub is not configured", async () => {
  await expect(getTemplateSourceStatus({
    project: executableProject,
    settings: resolvedSettings,
    gitStatus: async () => ({ branch: "main", headSha: "abc", origin: "", dirtyPaths: [] }),
    findPublishRun: async () => undefined,
  })).resolves.toEqual({
    schemaVersion: 2,
    validation: { errors: 0, warnings: 0 },
    local: {
      kind: "local",
      availability: "available",
      url: "http://192.168.1.10:8787/templates/Custom_Clash.ini",
      message: "本地实时模板可用",
    },
    github: {
      kind: "github",
      availability: "unavailable",
      latest: false,
      message: "未检测到 GitHub origin",
    },
  });
});

it("marks GitHub latest only for a successful run matching HEAD", async () => {
  const status = await getTemplateSourceStatus({
    project: executableProject,
    settings: resolvedSettings,
    gitStatus: async () => ({
      branch: "main",
      headSha: "abc",
      origin: "git@github.com:acme/routes.git",
      dirtyPaths: [],
    }),
    findPublishRun: async () => ({
      id: 10,
      status: "completed",
      conclusion: "success",
      headSha: "abc",
      htmlUrl: "https://github.com/acme/routes/actions/runs/10",
      updatedAt: "2026-08-10T00:00:00Z",
    }),
  });
  expect(status.github).toMatchObject({
    availability: "available",
    latest: true,
    headSha: "abc",
    publishedSha: "abc",
    url: "https://raw.githubusercontent.com/acme/routes/publish/templates/Custom_Clash.ini",
  });
});

it("keeps a successful older run stale", async () => {
  const status = await getTemplateSourceStatus({
    project: executableProject,
    settings: resolvedSettings,
    gitStatus: async () => ({ branch: "main", headSha: "new", origin: "https://github.com/acme/routes.git", dirtyPaths: [] }),
    findPublishRun: async () => ({
      id: 9,
      status: "completed",
      conclusion: "success",
      headSha: "old",
      htmlUrl: "https://github.com/acme/routes/actions/runs/9",
      updatedAt: "2026-08-09T00:00:00Z",
    }),
  });
  expect(status.github).toMatchObject({ availability: "stale", latest: false });
});
```

- [ ] **Step 2: Write Web API guards RED tests**

Create `apps/web/tests/outputApi.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  fetchTemplateSourceStatus,
  publishGitHubMain,
  requestDeviceConfig,
} from "../src/features/output/outputApi.js";
import type { DeviceConfigRequest } from "@clash-route-kit/local-server";

const deviceRequest: DeviceConfigRequest = {
  templateSource: "local",
  subscriptions: [{
    id: "home",
    name: "Home",
    url: "https://subscriptions.invalid/home?token=redacted-test-token",
    enabled: true,
  }],
  configName: "Family",
  subconverterUrl: "http://127.0.0.1:25500/sub",
  target: "clash",
  convert: { emoji: false, udp: true, sort: false },
};

it("rejects malformed template source status", async () => {
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ local: 42 }) }) as unknown as Response);
  await expect(fetchTemplateSourceStatus(fetcher)).rejects.toThrow("Invalid template source status response");
});

it("returns device yaml as a Blob without parsing or persisting it", async () => {
  const fetcher = vi.fn(async () => ({
    ok: true,
    headers: new Headers({ "x-route-kit-filename": "Family.yaml" }),
    blob: async () => new Blob(["proxies: []\n"], { type: "text/yaml" }),
  }) as unknown as Response);
  const result = await requestDeviceConfig(deviceRequest, fetcher);
  expect(result.filename).toBe("Family.yaml");
  expect(await result.blob.text()).toBe("proxies: []\n");
});

it("posts the explicit expected revision for GitHub publish", async () => {
  const fetcher = vi.fn(async (_input, init) => ({
    ok: true,
    json: async () => ({ headSha: "abc", steps: [] }),
  }) as unknown as Response);
  await publishGitHubMain({ expectedRevision: "revision" }, fetcher);
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ expectedRevision: "revision" });
});
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
pnpm exec vitest run packages/local-server/tests/templateSourceStatus.test.ts apps/web/tests/outputApi.test.ts
```

Expected: FAIL because output contracts/status/API do not exist.

- [ ] **Step 4: Define exact DTOs**

Create `packages/local-server/src/output/outputContracts.ts`:

```ts
import type { Diagnostic } from "@clash-route-kit/core";

export type TemplateAvailability = "available" | "unavailable" | "stale" | "checking";

export interface TemplateEndpointStatus {
  kind: "local" | "github";
  availability: TemplateAvailability;
  url?: string;
  message: string;
  checkedAt?: string;
}

export interface TemplateSourceStatus {
  schemaVersion: 1 | 2;
  validation: { errors: number; warnings: number };
  local: TemplateEndpointStatus;
  github: TemplateEndpointStatus & {
    latest: boolean;
    headSha?: string;
    publishedSha?: string;
    runUrl?: string;
    publishedAt?: string;
  };
}

export interface DeviceSubscriptionInput {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

export interface DeviceConvertOptions {
  emoji?: boolean;
  udp?: boolean;
  skipCertVerify?: boolean;
  sort?: boolean;
  appendType?: boolean;
  ruleProvider?: boolean;
  ua?: string;
  include?: string[];
  exclude?: string[];
  customParams?: string[];
}

export interface DeviceConfigRequest {
  templateSource: "local" | "github";
  subscriptions: DeviceSubscriptionInput[];
  configName: string;
  subconverterUrl?: string;
  target?: string;
  convert?: DeviceConvertOptions;
}

export type DeviceConfigErrorCode =
  | "input-invalid"
  | "template-unreachable"
  | "subconverter-unreachable"
  | "conversion-rejected";

export type PublishStepName = "validate" | "commit" | "push" | "actions";
export interface PublishStep {
  name: PublishStepName;
  status: "pending" | "running" | "success" | "error" | "skipped";
  message: string;
}

export interface EntityChangeCount {
  added: number;
  changed: number;
  removed: number;
}

export interface GitHubPublishReview {
  repository: {
    origin: string;
    owner?: string;
    repo?: string;
  };
  branch: string;
  headSha: string;
  dirtyPaths: string[];
  ahead: number;
  behind: number;
  schemaVersion: 1 | 2;
  diagnostics: Diagnostic[];
  entityDiff: {
    proxyGroups: EntityChangeCount;
    routes: EntityChangeCount;
    providers: EntityChangeCount;
    vendorRepos: EntityChangeCount;
    memberSets: EntityChangeCount;
  };
  canPublish: boolean;
  iniDiff?: string;
}

export interface GitHubActionsRunStatus {
  id?: number;
  status: "queued" | "in_progress" | "completed" | "not_found";
  conclusion: "success" | "failure" | "cancelled" | "timed_out" | null;
  headSha: string;
  htmlUrl?: string;
  updatedAt?: string;
}

export interface GitHubPublishResult {
  headSha: string;
  actionsUrl: string;
  runId?: number;
  steps: PublishStep[];
}
```

- [ ] **Step 5: Implement server status computation**

Create `packages/local-server/src/git/githubRemote.ts` in this task so status computation has no backward dependency:

```ts
export interface GitHubRepo {
  owner: string;
  repo: string;
}

export function parseGitHubRemote(remote: string): GitHubRepo | undefined {
  const value = remote.trim().replace(/\.git$/i, "");
  const ssh = /^git@github\.com:([^/]+)\/([^/]+)$/i.exec(value);
  const https = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/i.exec(value);
  const match = ssh ?? https;
  return match ? { owner: match[1]!, repo: match[2]! } : undefined;
}

export function createGitHubUrls(repo: GitHubRepo, templateOutput: string) {
  const root = `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/publish`;
  return {
    template: `${root}/templates/${templateOutput}`,
    rules: `${root}/rules/`,
    actions: `https://github.com/${repo.owner}/${repo.repo}/actions/workflows/publish.yml`,
  };
}
```

Create `templateSourceStatus.ts`. Build the local URL from resolved `publicBaseUrl` and `project.renderProject.template.output`, and import `parseGitHubRemote`/`createGitHubUrls` from `githubRemote.ts`.

Core logic:

```ts
const errors = project.diagnostics.filter((item) => item.severity === "error").length;
const warnings = project.diagnostics.filter((item) => item.severity === "warning").length;
const local = errors > 0
  ? { kind: "local" as const, availability: "unavailable" as const, message: "修复配置错误后可使用本地模板" }
  : {
      kind: "local" as const,
      availability: "available" as const,
      url: `${settings.serve.publicBaseUrl.replace(/\/+$/, "")}/templates/${project.renderProject.template.output}`,
      message: "本地实时模板可用",
    };
```

For GitHub, no remote → unavailable; no matching run → stale; queued/in-progress matching run → checking; successful matching run → available/latest; failed matching run → stale with run URL. Never mark `latest` based only on the existence of a raw URL.

- [ ] **Step 6: Implement Web API guards and display derivation**

`outputApi.ts` calls:

```ts
GET /api/output/status
POST /api/output/device-config
GET /api/github/publish/review
GET /api/github/publish/review?includeIniDiff=true
POST /api/github/publish
GET /api/github/actions/status?sha=<sha>
```

For non-2xx JSON errors, parse `{ code, message, diagnostics?, steps? }` into `OutputApiError`. Device success returns Blob + sanitized filename header.

Create Web `templateSourceStatus.ts` with pure helpers only:

```ts
export function selectedTemplateUrl(
  status: TemplateSourceStatus,
  source: "local" | "github",
): string | undefined {
  return source === "local"
    ? status.local.availability === "available" ? status.local.url : undefined
    : status.github.latest ? status.github.url : undefined;
}
```

- [ ] **Step 7: Run GREEN and commit**

Run:

```powershell
pnpm exec vitest run packages/local-server/tests/templateSourceStatus.test.ts apps/web/tests/outputApi.test.ts
pnpm --filter @clash-route-kit/local-server typecheck
pnpm --filter @clash-route-kit/web typecheck
```

Expected: PASS.

```powershell
git add packages/local-server/src/output packages/local-server/src/git/githubRemote.ts packages/local-server/src/contracts.ts packages/local-server/src/index.ts packages/local-server/tests/templateSourceStatus.test.ts apps/web/src/features/output/outputApi.ts apps/web/src/features/output/templateSourceStatus.ts apps/web/tests/outputApi.test.ts
git commit -m "feat: define output source status"
```

### Task 2: Implement redacted device configuration conversion in Local Server

**Files:**

- Create: `packages/local-server/src/output/deviceConfig.ts`
- Create: `packages/local-server/src/http/outputRoutes.ts`
- Create: `packages/local-server/tests/deviceConfig.test.ts`
- Create: `packages/local-server/tests/outputRoutes.test.ts`
- Modify: `packages/local-server/src/http/createApiHandler.ts`
- Modify: `packages/local-server/src/index.ts`

**Interfaces:**

- Consumes: `TemplateSourceStatus`, resolved local settings and injected `fetch`.
- Produces: `GenerateDeviceConfigResult = { body: Uint8Array; filename: string; contentType: string; generatedUrl: string }`.
- Produces: `generateDeviceConfig(options): Promise<GenerateDeviceConfigResult>`.
- Produces: `DeviceConfigError` with safe `code` and `message` only.
- Adds HTTP: `GET /api/output/status`, `POST /api/output/device-config`.

- [ ] **Step 1: Write validation/error classification/security tests**

Create `packages/local-server/tests/deviceConfig.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  generateDeviceConfig,
  type DeviceConfigRequest,
  type ResolvedLocalSettings,
  type TemplateSourceStatus,
} from "../src/index.js";

const secret = "https://subscribe.example/abc?token=super-secret";

const localStatus: TemplateSourceStatus = {
  schemaVersion: 2,
  validation: { errors: 0, warnings: 0 },
  local: {
    kind: "local",
    availability: "available",
    url: "http://192.168.1.10:8787/templates/Custom_Clash.ini",
    message: "本地实时模板可用",
  },
  github: {
    kind: "github",
    availability: "unavailable",
    latest: false,
    message: "未检测到 GitHub origin",
  },
};

const resolvedSettings: ResolvedLocalSettings = {
  serve: { host: "0.0.0.0", port: 8787, publicBaseUrl: "http://192.168.1.10:8787" },
  subconverterUrl: "http://127.0.0.1:25500/sub",
  sources: { host: "local", port: "local", publicBaseUrl: "local", subconverterUrl: "local" },
};

function requestWith(url: string): DeviceConfigRequest {
  return {
    templateSource: "local",
    subscriptions: [{ id: "home", name: "Home", url, enabled: true }],
    configName: "Family",
    target: "clash",
    convert: { emoji: false, udp: true },
  };
}

it("rejects empty subscriptions without calling fetch", async () => {
  const fetcher = vi.fn();
  await expect(generateDeviceConfig({
    request: { templateSource: "local", subscriptions: [], configName: "Family" },
    status: localStatus,
    settings: resolvedSettings,
    fetcher,
  })).rejects.toMatchObject({ code: "input-invalid" });
  expect(fetcher).not.toHaveBeenCalled();
});

it("classifies an unreachable template before contacting SubConverter", async () => {
  const fetcher = vi.fn(async () => { throw new TypeError("network down"); });
  await expect(generateDeviceConfig({
    request: requestWith(secret),
    status: localStatus,
    settings: resolvedSettings,
    fetcher,
  })).rejects.toMatchObject({ code: "template-unreachable" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("classifies SubConverter network and HTTP failures separately", async () => {
  const networkFetcher = vi.fn()
    .mockResolvedValueOnce(new Response("template", { status: 200 }))
    .mockRejectedValueOnce(new TypeError("connection refused"));
  await expect(generateDeviceConfig({
    request: requestWith(secret), status: localStatus, settings: resolvedSettings, fetcher: networkFetcher,
  })).rejects.toMatchObject({ code: "subconverter-unreachable" });

  const rejectedFetcher = vi.fn()
    .mockResolvedValueOnce(new Response("template", { status: 200 }))
    .mockResolvedValueOnce(new Response("bad config", { status: 400 }));
  await expect(generateDeviceConfig({
    request: requestWith(secret), status: localStatus, settings: resolvedSettings, fetcher: rejectedFetcher,
  })).rejects.toMatchObject({ code: "conversion-rejected" });
});

it("never exposes subscription tokens in errors", async () => {
  const fetcher = vi.fn(async () => { throw new Error(secret); });
  let caught: unknown;
  try {
    await generateDeviceConfig({
      request: requestWith(secret), status: localStatus, settings: resolvedSettings, fetcher,
    });
  } catch (error: unknown) {
    caught = error;
  }
  expect(String(caught)).not.toContain("super-secret");
  expect(JSON.stringify(caught)).not.toContain("super-secret");
});
```

- [ ] **Step 2: Write successful URL/body/limit tests**

Append:

```ts
it("uses the selected server-owned template URL and returns yaml bytes", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response("[custom]", { status: 200 }))
    .mockResolvedValueOnce(new Response("proxies: []\n", {
      status: 200,
      headers: { "content-type": "text/yaml" },
    }));
  const result = await generateDeviceConfig({
    request: requestWith(secret),
    status: localStatus,
    settings: resolvedSettings,
    fetcher,
  });
  const convertUrl = new URL(String(fetcher.mock.calls[1]?.[0]));
  expect(convertUrl.searchParams.get("config")).toBe(localStatus.local.url);
  expect(convertUrl.searchParams.get("url")).toContain("super-secret");
  expect(result.filename).toBe("Family.yaml");
  expect(new TextDecoder().decode(result.body)).toBe("proxies: []\n");
});

it("rejects responses over the 10 MiB limit", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response("[custom]", { status: 200 }))
    .mockResolvedValueOnce(new Response(new Uint8Array(10 * 1024 * 1024 + 1), { status: 200 }));
  await expect(generateDeviceConfig({
    request: requestWith(secret), status: localStatus, settings: resolvedSettings, fetcher,
  })).rejects.toMatchObject({ code: "conversion-rejected" });
});
```

- [ ] **Step 3: Write HTTP no-log/error mapping tests**

Create `packages/local-server/tests/outputRoutes.test.ts` with a request/response harness:

```ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  DeviceConfigError,
  createApiHandler,
  createOutputRoutes,
  type DeviceConfigRequest,
  type GenerateDeviceConfigResult,
  type TemplateSourceStatus,
} from "../src/index.js";

const deviceRequest: DeviceConfigRequest = {
  templateSource: "local",
  subscriptions: [{ id: "home", name: "Home", url: "https://example.com/sub", enabled: true }],
  configName: "Family",
};
const requestWithSecret: DeviceConfigRequest = {
  ...deviceRequest,
  subscriptions: [{ id: "secret", name: "Secret", url: "https://example.com/sub?token=super-secret", enabled: true }],
};
const status: TemplateSourceStatus = {
  schemaVersion: 2,
  validation: { errors: 0, warnings: 0 },
  local: { kind: "local", availability: "available", url: "http://lan/templates/Custom_Clash.ini", message: "可用" },
  github: { kind: "github", availability: "unavailable", latest: false, message: "未配置" },
};

async function invokeOutputRoute(input: {
  method: string;
  path: string;
  body?: unknown;
  generateDeviceConfig: (request: DeviceConfigRequest) => Promise<GenerateDeviceConfigResult>;
}): Promise<{ statusCode: number; headers: Record<string, string>; text: string }> {
  const handler = createApiHandler([createOutputRoutes({
    getStatus: async () => status,
    generateDeviceConfig: input.generateDeviceConfig,
  })]);
  const request = Readable.from(input.body === undefined ? [] : [JSON.stringify(input.body)]) as unknown as IncomingMessage;
  Object.assign(request, { method: input.method, url: input.path, headers: { "content-type": "application/json" } });
  return new Promise((resolve, reject) => {
    const state = { statusCode: 200, headers: {} as Record<string, string>, text: "" };
    const response = {
      statusCode: 200,
      setHeader(name: string, value: string | number | readonly string[]) {
        state.headers[name.toLowerCase()] = String(value);
      },
      end(chunk?: string | Uint8Array) {
        state.statusCode = this.statusCode;
        if (chunk !== undefined) state.text += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
        resolve(state);
      },
    } as unknown as ServerResponse;
    void handler(request, response).catch(reject);
  });
}

it("streams yaml with a sanitized filename", async () => {
  const response = await invokeOutputRoute({
    method: "POST",
    path: "/api/output/device-config",
    body: deviceRequest,
    generateDeviceConfig: async () => ({
      body: new TextEncoder().encode("proxies: []\n"),
      filename: "Family.yaml",
      contentType: "text/yaml",
      generatedUrl: "http://subconverter/sub?...",
    }),
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers["x-route-kit-filename"]).toBe("Family.yaml");
  expect(response.text).toBe("proxies: []\n");
});

it("maps safe device errors without echoing request secrets", async () => {
  const response = await invokeOutputRoute({
    method: "POST",
    path: "/api/output/device-config",
    body: requestWithSecret,
    generateDeviceConfig: async () => { throw new DeviceConfigError("subconverter-unreachable", "无法连接 SubConverter"); },
  });
  expect(response.statusCode).toBe(502);
  expect(response.text).toContain("subconverter-unreachable");
  expect(response.text).not.toContain("super-secret");
});
```

- [ ] **Step 4: Run tests and verify RED**

Run:

```powershell
pnpm exec vitest run packages/local-server/tests/deviceConfig.test.ts packages/local-server/tests/outputRoutes.test.ts
```

Expected: FAIL because the use case/routes do not exist.

- [ ] **Step 5: Implement safe URL construction and conversion**

Create `packages/local-server/src/output/deviceConfig.ts`. Validate:

- selected source URL exists and local is available or GitHub is latest;
- at least one enabled subscription with non-empty name/url;
- subscription and SubConverter URLs parse as HTTP/HTTPS;
- config name becomes a safe filename by replacing `[/\\:*?"<>|]` with `-` and appending `.yaml`;
- timeout is 15,000 ms via `AbortSignal.timeout(15_000)`;
- response max is 10 MiB.

Use pure helpers:

```ts
function selectedTemplate(
  request: DeviceConfigRequest,
  status: TemplateSourceStatus,
): string {
  if (request.templateSource === "local" && status.local.availability === "available" && status.local.url) {
    return status.local.url;
  }
  if (request.templateSource === "github" && status.github.latest && status.github.url) {
    return status.github.url;
  }
  throw new DeviceConfigError("input-invalid", "所选模板当前不可用");
}

function safeError(code: DeviceConfigErrorCode, message: string): DeviceConfigError {
  return new DeviceConfigError(code, message);
}
```

Probe the template with GET and discard body. Build SubConverter URL with `URLSearchParams`, using the existing `provider:<name>,<url>|...` format and all current conversion options. Never include the constructed URL in thrown errors. Read response using `arrayBuffer`; reject over limit before returning.

- [ ] **Step 6: Implement output HTTP routes**

`createOutputRoutes` handles status and device conversion. It receives factories/use cases through dependencies and never calls `console.*`. Map:

| Code | HTTP |
| --- | --- |
| `input-invalid` | 400 |
| `template-unreachable` | 424 |
| `subconverter-unreachable` | 502 |
| `conversion-rejected` | 422 |

Register the route in `createApiHandler` before generic action routes. Sanitize `x-route-kit-filename` to ASCII fallback plus RFC 5987 `content-disposition` when necessary.

- [ ] **Step 7: Run GREEN and commit**

Run:

```powershell
pnpm exec vitest run packages/local-server/tests/deviceConfig.test.ts packages/local-server/tests/outputRoutes.test.ts
pnpm --filter @clash-route-kit/local-server typecheck
```

Expected: PASS.

```powershell
git add packages/local-server/src/output/deviceConfig.ts packages/local-server/src/http/outputRoutes.ts packages/local-server/src/http/createApiHandler.ts packages/local-server/src/index.ts packages/local-server/tests/deviceConfig.test.ts packages/local-server/tests/outputRoutes.test.ts
git commit -m "feat: generate device configs locally"
```

### Task 3: Build the default Device Config tab with collapsed advanced options

**Files:**

- Create: `apps/web/src/features/output/deviceConfigModel.ts`
- Create: `apps/web/src/features/output/AdvancedConvertOptions.tsx`
- Create: `apps/web/src/features/output/DeviceConfigTab.tsx`
- Create: `apps/web/tests/deviceConfigTestFixtures.tsx`
- Create: `apps/web/tests/deviceConfigModel.test.ts`
- Create: `apps/web/tests/deviceConfigTab.test.tsx`
- Modify: `apps/web/src/features/output/OutputPage.tsx`

**Interfaces:**

- Consumes: `TemplateSourceStatus`, `requestDeviceConfig` and device DTOs.
- Produces: `buildDeviceInstallUrl(request, templateUrl, settings): string` for copy/QR only.
- Produces: `DeviceConfigTab` callbacks `onOpenGitHubPublish` and `onRefreshStatus`.
- Guarantees: all sensitive fields live only in component state.

- [ ] **Step 0: Create Device Config fixtures and render helpers**

Create `apps/web/tests/deviceConfigTestFixtures.tsx`:

```tsx
import type { TemplateSourceStatus } from "@clash-route-kit/local-server";
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { AppProviders } from "../src/components/AppProviders.js";
import { DeviceConfigTab } from "../src/features/output/DeviceConfigTab.js";

export const localOnlyStatus: TemplateSourceStatus = {
  schemaVersion: 2,
  validation: { errors: 0, warnings: 0 },
  local: {
    kind: "local",
    availability: "available",
    url: "http://192.168.1.10:8787/templates/Custom_Clash.ini",
    message: "本地实时模板可用",
  },
  github: {
    kind: "github",
    availability: "unavailable",
    latest: false,
    message: "未检测到 GitHub origin",
  },
};

export function renderDeviceTab(input: {
  status?: TemplateSourceStatus;
  requestDevice?: typeof import("../src/features/output/outputApi.js").requestDeviceConfig;
  onOpenGitHubPublish?: () => void;
  onRefreshStatus?: () => void | Promise<void>;
} = {}) {
  return render(
    <AppProviders>
      <DeviceConfigTab
        status={input.status ?? localOnlyStatus}
        defaultSubconverterUrl="http://127.0.0.1:25500/sub"
        requestDevice={input.requestDevice ?? vi.fn(async () => ({
          blob: new Blob(["proxies: []\n"], { type: "text/yaml" }),
          filename: "Family.yaml",
        }))}
        onOpenGitHubPublish={input.onOpenGitHubPublish ?? vi.fn()}
        onRefreshStatus={input.onRefreshStatus ?? vi.fn()}
      />
    </AppProviders>,
  );
}

export function addSecretSubscription(): void {
  fireEvent.click(screen.getByRole("button", { name: "添加订阅" }));
  fireEvent.change(screen.getByLabelText("订阅名称 1"), { target: { value: "Main" } });
  fireEvent.change(screen.getByLabelText("订阅 URL 1"), {
    target: { value: "https://example.com/super-secret" },
  });
}
```

- [ ] **Step 1: Write direct-template URL model tests**

Create `apps/web/tests/deviceConfigModel.test.ts` by migrating current subscription tests to the new input:

```ts
import { describe, expect, it } from "vitest";
import { buildSubconverterUrl } from "../src/features/output/deviceConfigModel.js";

it("builds a SubConverter URL from an explicit local template URL", () => {
  const url = buildSubconverterUrl({
    subscriptions: [
      { id: "wd", name: "wd", url: "https://example.com/wd", enabled: true },
      { id: "off", name: "off", url: "https://example.com/off", enabled: false },
    ],
    templateUrl: "http://192.168.1.10:8787/templates/Custom_Clash.ini",
    subconverterUrl: "10.0.0.3:25500",
    configName: "Family",
    convert: { include: ["香港", "台湾&bgp"], ruleProvider: true },
  });
  const parsed = new URL(url);
  expect(parsed.searchParams.get("config")).toBe("http://192.168.1.10:8787/templates/Custom_Clash.ini");
  expect(parsed.searchParams.get("url")).toBe("provider:wd,https://example.com/wd");
  expect(parsed.searchParams.get("include")).toBe("(?i)香港|(?=.*台湾)(?=.*bgp)");
  expect(parsed.searchParams.get("expand")).toBe("false");
  expect(parsed.searchParams.get("filename")).toBe("Family");
});
```

- [ ] **Step 2: Write default/local/advanced/privacy UI tests**

Create `apps/web/tests/deviceConfigTab.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { OutputApiError } from "../src/features/output/outputApi.js";
import {
  addSecretSubscription,
  localOnlyStatus,
  renderDeviceTab,
} from "./deviceConfigTestFixtures.js";

it("defaults to the local template and keeps advanced options collapsed", () => {
  renderDeviceTab({ status: localOnlyStatus });
  expect(screen.getByRole("radio", { name: "本地实时模板" })).toBeChecked();
  expect(screen.queryByLabelText("User-Agent")).toBeNull();
  expect(screen.getByText("高级转换选项")).toBeTruthy();
  expect(screen.getByText(/SubConverter 必须能够访问/)).toBeTruthy();
});

it("offers GitHub publish without blocking local generation", () => {
  const onOpenGitHubPublish = vi.fn();
  renderDeviceTab({ status: localOnlyStatus, onOpenGitHubPublish });
  expect(screen.getByRole("button", { name: "生成设备配置" })).not.toBeDisabled();
  fireEvent.click(screen.getByText("GitHub 远程模板"));
  expect(screen.getByText("远程模板尚不可用")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "前往 GitHub 发布" }));
  expect(onOpenGitHubPublish).toHaveBeenCalled();
});

it("preserves the form and classifies server failure", async () => {
  const requestDevice = vi.fn(async () => { throw new OutputApiError("template-unreachable", "本地模板不可达"); });
  renderDeviceTab({ status: localOnlyStatus, requestDevice });
  fireEvent.click(screen.getByRole("button", { name: "添加订阅" }));
  fireEvent.change(screen.getByLabelText("订阅名称 1"), { target: { value: "Main" } });
  fireEvent.change(screen.getByLabelText("订阅 URL 1"), { target: { value: "https://example.com/token" } });
  fireEvent.click(screen.getByRole("button", { name: "生成设备配置" }));
  expect(await screen.findByText("本地模板不可达")).toBeTruthy();
  expect(screen.getByDisplayValue("https://example.com/token")).toBeTruthy();
});

it("does not persist subscriptions to browser storage or project APIs", async () => {
  const localSet = vi.spyOn(Storage.prototype, "setItem");
  const requestDevice = vi.fn(async () => ({ blob: new Blob(["x"]), filename: "config.yaml" }));
  renderDeviceTab({ status: localOnlyStatus, requestDevice });
  addSecretSubscription();
  fireEvent.click(screen.getByRole("button", { name: "生成设备配置" }));
  await waitFor(() => expect(requestDevice).toHaveBeenCalled());
  expect(localSet).not.toHaveBeenCalled();
  expect(requestDevice.mock.calls[0]?.[0]).not.toHaveProperty("projectConfig");
});
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
pnpm exec vitest run apps/web/tests/deviceConfigModel.test.ts apps/web/tests/deviceConfigTab.test.tsx
```

Expected: FAIL because device feature files do not exist.

- [ ] **Step 4: Implement the pure model by moving existing conversion behavior**

Move `ProviderSubscription`, conversion options, provider serialization, `&` lookahead behavior and URL builder from root `subscriptions.ts` into `features/output/deviceConfigModel.ts`. Change the builder input from `publishBaseUrl + templateOutput` to exact `templateUrl`:

```ts
export interface BuildSubconverterUrlInput {
  subscriptions: DeviceSubscriptionInput[];
  templateUrl: string;
  subconverterUrl: string;
  configName: string;
  target?: string;
  convert?: DeviceConvertOptions;
}
```

Set `config` directly to `templateUrl`; do not append version parameters in this layer. Preserve all current option mappings.

- [ ] **Step 5: Implement collapsed advanced options**

`AdvancedConvertOptions` is controlled by `value`/`onChange` and uses Ant Design `Collapse` with `defaultActiveKey={[]}`. It contains UA, toggles, include/exclude tags and custom params. Do not mount secret subscription inputs inside it.

Example shell:

```tsx
<Collapse
  items={[{
    key: "advanced",
    label: "高级转换选项",
    children: <AdvancedFields value={props.value} onChange={props.onChange} />,
  }]}
  defaultActiveKey={[]}
/>
```

- [ ] **Step 6: Implement DeviceConfigTab session state and actions**

State uses a single object and functional patches:

```ts
interface DeviceFormState {
  templateSource: "local" | "github";
  subscriptions: DeviceSubscriptionInput[];
  configName: string;
  subconverterUrl: string;
  convert: DeviceConvertOptions;
  error: string;
  generatedUrl: string;
  qr: string;
}

const [form, setForm] = useState<DeviceFormState>(() => ({
  templateSource: "local",
  subscriptions: [],
  configName: "",
  subconverterUrl: props.defaultSubconverterUrl,
  convert: { emoji: false, sort: false },
  error: "",
  generatedUrl: "",
  qr: "",
}));
```

Generate flow:

1. Derive selected template URL from status.
2. Build a copy/QR SubConverter URL locally.
3. `await requestDeviceConfig` for actual YAML.
4. Create an object URL, click a temporary download anchor, and revoke it in the same event turn after click.
5. Set generated URL and QR only after success; on failure change only `error`.

Render Download (for last blob), Copy Link and QR actions after success. Warn that local source requires SubConverter access to the LAN URL. If GitHub is selected but not latest, keep form and show the tab-switch action.

- [ ] **Step 7: Run GREEN and commit**

Run:

```powershell
pnpm exec vitest run apps/web/tests/deviceConfigModel.test.ts apps/web/tests/deviceConfigTab.test.tsx
pnpm --filter @clash-route-kit/web typecheck
```

Expected: PASS.

```powershell
git add apps/web/src/features/output/deviceConfigModel.ts apps/web/src/features/output/AdvancedConvertOptions.tsx apps/web/src/features/output/DeviceConfigTab.tsx apps/web/src/features/output/OutputPage.tsx apps/web/tests/deviceConfigTestFixtures.tsx apps/web/tests/deviceConfigModel.test.ts apps/web/tests/deviceConfigTab.test.tsx
git commit -m "feat: make local device output the default"
```

### Task 4: Implement main-only GitHub publish review and Actions tracking

**Files:**

- Create: `packages/local-server/src/git/githubActionsClient.ts`
- Create: `packages/local-server/src/git/publishReview.ts`
- Create: `packages/local-server/src/git/publishMain.ts`
- Create: `packages/local-server/src/http/githubRoutes.ts`
- Create: `packages/local-server/tests/githubPublishFixtures.ts`
- Create: `packages/local-server/tests/githubActionsClient.test.ts`
- Create: `packages/local-server/tests/publishReview.test.ts`
- Create: `packages/local-server/tests/githubPublish.test.ts`
- Create: `packages/local-server/tests/githubRoutes.test.ts`
- Modify: `packages/local-server/src/git/gitRepository.ts`
- Modify: `packages/local-server/src/http/createApiHandler.ts`
- Modify: `packages/local-server/src/index.ts`

**Interfaces:**

- Consumes: Task 1 `GitHubRepo`, `parseGitHubRemote`, `createGitHubUrls`.
- Produces: `GitHubActionsClient.findPublishRun(repo, headSha)`.
- Produces: `createGitHubPublishReview(options)`.
- Produces: `publishMain(options): Promise<GitHubPublishResult>`.
- Adds HTTP: publish review, publish command, Actions status.

- [ ] **Step 1: Write remote regression and Actions client RED tests**

Create `packages/local-server/tests/githubActionsClient.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  createGitHubActionsClient,
  createGitHubUrls,
  parseGitHubRemote,
} from "../src/index.js";

it.each([
  ["git@github.com:acme/routes.git", { owner: "acme", repo: "routes" }],
  ["https://github.com/acme/routes.git", { owner: "acme", repo: "routes" }],
])("parses GitHub remote %s", (remote, expected) => {
  expect(parseGitHubRemote(remote)).toEqual(expected);
});

it("builds raw publish and actions URLs", () => {
  expect(createGitHubUrls({ owner: "acme", repo: "routes" }, "Custom_Clash.ini")).toEqual({
    template: "https://raw.githubusercontent.com/acme/routes/publish/templates/Custom_Clash.ini",
    rules: "https://raw.githubusercontent.com/acme/routes/publish/rules/",
    actions: "https://github.com/acme/routes/actions/workflows/publish.yml",
  });
});

it("queries publish.yml for the exact source sha and maps the newest run", async () => {
  const fetcher = vi.fn(async (url: string) => ({
    ok: true,
    json: async () => ({ workflow_runs: [{
      id: 12,
      status: "completed",
      conclusion: "success",
      head_sha: "abc",
      html_url: "https://github.com/acme/routes/actions/runs/12",
      updated_at: "2026-08-10T00:00:00Z",
    }] }),
  }) as unknown as Response);
  const client = createGitHubActionsClient({ fetcher, token: "env-token" });
  await expect(client.findPublishRun({ owner: "acme", repo: "routes" }, "abc")).resolves.toMatchObject({
    id: 12,
    headSha: "abc",
    conclusion: "success",
  });
  const url = String(fetcher.mock.calls[0]?.[0]);
  expect(url).toContain("actions/workflows/publish.yml/runs");
  expect(url).toContain("head_sha=abc");
  expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: "Bearer env-token" });
});
```

- [ ] **Step 2: Write structured review and lazy INI diff tests**

Create `packages/local-server/tests/githubPublishFixtures.ts`:

```ts
import {
  serializeAuthorProjectConfig,
  type AuthorProjectConfig,
} from "@clash-route-kit/core";
import type {
  GitHubActionsClient,
  GitHubActionsRunStatus,
  GitRepository,
  GitStatus,
  ProjectRepository,
  ResolvedLocalSettings,
} from "../src/index.js";

export const githubOrigin = "git@github.com:acme/routes.git";

export const headConfig: AuthorProjectConfig = {
  schemaVersion: 2,
  project: { template: { output: "Custom_Clash.ini" } },
  memberSets: {},
  proxyGroups: [{ id: "proxy", name: "Proxy Old", type: "select", members: [{ builtin: "DIRECT" }] }],
  routes: [
    { id: "removed", policy: { group: "proxy" }, source: { type: "geosite", value: "example" } },
    { id: "final", policy: { group: "proxy" }, source: { type: "final" } },
  ],
  ruleProviders: [],
  vendorRepos: [],
};

export const currentConfig: AuthorProjectConfig = {
  ...structuredClone(headConfig),
  proxyGroups: [
    { id: "proxy", name: "Proxy", type: "select", members: [{ builtin: "DIRECT" }] },
    { id: "ai", name: "AI", type: "select", members: [{ group: "proxy" }] },
  ],
  routes: [
    { id: "telegram", policy: { group: "ai" }, source: { type: "geosite", value: "telegram" } },
    { id: "github", policy: { group: "proxy" }, source: { type: "geosite", value: "github" } },
    { id: "final", policy: { group: "proxy" }, source: { type: "final" } },
  ],
};

const readySnapshot = {
  state: "ready" as const,
  revision: "revision",
  yaml: serializeAuthorProjectConfig(currentConfig),
  config: currentConfig,
  diagnostics: [],
};

export const readyRepository: ProjectRepository = {
  read: async () => readySnapshot,
  save: async () => readySnapshot,
  applyMigration: async () => readySnapshot,
};

export const resolvedSettings: ResolvedLocalSettings = {
  serve: { host: "0.0.0.0", port: 8787, publicBaseUrl: "http://192.168.1.10:8787" },
  subconverterUrl: "http://127.0.0.1:25500/sub",
  sources: { host: "local", port: "local", publicBaseUrl: "local", subconverterUrl: "local" },
};

export function fakeGit(input: {
  status: GitStatus;
  calls?: string[];
  nextHeadSha?: string;
  pushError?: Error;
  headYaml?: string;
}): GitRepository {
  const calls = input.calls ?? [];
  return {
    status: async () => { calls.push("status"); return input.status; },
    readFileAtHead: async (file) => file === "config/routes.yaml"
      ? input.headYaml ?? serializeAuthorProjectConfig(headConfig)
      : undefined,
    commitRouteChanges: async () => { calls.push("commitRouteChanges"); return "committed"; },
    pushMain: async () => {
      calls.push("pushMain");
      if (input.pushError) throw input.pushError;
      return "pushed";
    },
    headSha: async () => { calls.push("headSha"); return input.nextHeadSha ?? input.status.headSha; },
  };
}

export const gitWithHeadConfig = fakeGit({
  status: {
    branch: "main",
    headSha: "abc",
    origin: githubOrigin,
    dirtyPaths: ["config/routes.yaml"],
    ahead: 0,
    behind: 0,
  },
});

export function fakeActions(
  run?: Partial<GitHubActionsRunStatus>,
): GitHubActionsClient {
  return {
    findPublishRun: async (_repo, headSha) => run === undefined ? undefined : {
      status: "queued",
      conclusion: null,
      headSha,
      ...run,
    },
  };
}
```

Create `packages/local-server/tests/publishReview.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createGitHubPublishReview } from "../src/index.js";
import {
  gitWithHeadConfig,
  readyRepository,
  resolvedSettings,
} from "./githubPublishFixtures.js";

it("summarizes entity changes without an INI diff by default", async () => {
  const review = await createGitHubPublishReview({
    expectedRevision: "revision",
    includeIniDiff: false,
    projectRepository: readyRepository,
    git: gitWithHeadConfig,
    settings: resolvedSettings,
  });
  expect(review).toMatchObject({
    branch: "main",
    entityDiff: {
      proxyGroups: { added: 1, changed: 1, removed: 0 },
      routes: { added: 2, changed: 0, removed: 1 },
    },
    dirtyPaths: ["config/routes.yaml"],
    diagnostics: [],
    canPublish: true,
  });
  expect(review.iniDiff).toBeUndefined();
});

it("includes normalized INI diff only when explicitly requested", async () => {
  const review = await createGitHubPublishReview({
    expectedRevision: "revision",
    includeIniDiff: true,
    projectRepository: readyRepository,
    git: gitWithHeadConfig,
    settings: resolvedSettings,
  });
  expect(review.iniDiff).toContain("+ruleset=");
});
```

- [ ] **Step 3: Write publish sequence/non-main/failure-step tests**

Create `packages/local-server/tests/githubPublish.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { publishMain } from "../src/index.js";
import {
  fakeActions,
  fakeGit,
  githubOrigin,
  readyRepository,
} from "./githubPublishFixtures.js";

it("blocks non-main before staging or commit", async () => {
  const calls: string[] = [];
  await expect(publishMain({
    expectedRevision: "revision",
    projectRepository: readyRepository,
    validateWorkspace: async () => [],
    git: fakeGit({
      status: { branch: "feature", headSha: "abc", origin: githubOrigin, dirtyPaths: ["config/routes.yaml"], ahead: 0, behind: 0 },
      calls,
    }),
    actions: fakeActions(),
  })).rejects.toMatchObject({ code: "git.branch.not-main" });
  expect(calls).toEqual(["status"]);
});

it("validates, commits scoped route files, pushes main and reports Actions separately", async () => {
  const calls: string[] = [];
  const result = await publishMain({
    expectedRevision: "revision",
    projectRepository: readyRepository,
    validateWorkspace: async () => [],
    git: fakeGit({
      status: { branch: "main", headSha: "before", origin: githubOrigin, dirtyPaths: ["config/routes.yaml"], ahead: 0, behind: 0 },
      nextHeadSha: "after",
      calls,
    }),
    actions: fakeActions({ status: "queued", headSha: "after" }),
  });
  expect(calls).toEqual(["status", "commitRouteChanges", "pushMain", "headSha"]);
  expect(result.steps).toEqual([
    expect.objectContaining({ name: "validate", status: "success" }),
    expect.objectContaining({ name: "commit", status: "success" }),
    expect.objectContaining({ name: "push", status: "success" }),
    expect.objectContaining({ name: "actions", status: "pending" }),
  ]);
});

it("stops after a push failure and keeps the failed step visible", async () => {
  let error: unknown;
  try {
    await publishMain({
      expectedRevision: "revision",
      projectRepository: readyRepository,
      validateWorkspace: async () => [],
      git: fakeGit({
        status: { branch: "main", headSha: "before", origin: githubOrigin, dirtyPaths: ["config/routes.yaml"], ahead: 0, behind: 0 },
        pushError: new Error("permission denied"),
      }),
      actions: fakeActions(),
    });
  } catch (caught: unknown) {
    error = caught;
  }
  expect(error).toBeDefined();
  const publishError = error as { steps: unknown[] };
  expect(publishError.steps).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "validate", status: "success" }),
    expect.objectContaining({ name: "commit", status: "success" }),
    expect.objectContaining({ name: "push", status: "error", message: "推送 main 失败" }),
    expect.objectContaining({ name: "actions", status: "skipped" }),
  ]));
  expect(String(error)).not.toContain("permission denied");
});
```

- [ ] **Step 4: Run tests and verify RED**

Run:

```powershell
pnpm exec vitest run packages/local-server/tests/githubActionsClient.test.ts packages/local-server/tests/publishReview.test.ts packages/local-server/tests/githubPublish.test.ts packages/local-server/tests/githubRoutes.test.ts
```

Expected: FAIL because GitHub modules/routes do not exist.

- [ ] **Step 5: Implement remote parsing and Actions client**

Keep the Task 1 remote parser unchanged; these regression tests lock its accepted SSH/HTTPS forms and `publish` URL construction.

`githubActionsClient.ts` calls:

```text
GET https://api.github.com/repos/{owner}/{repo}/actions/workflows/publish.yml/runs?branch=main&head_sha={sha}&per_page=10
```

Headers:

```ts
{
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
}
```

Filter returned runs by exact `head_sha`, sort by `updated_at` descending, and return the newest. A 404/empty public response returns `undefined`; 401/403 throws a safe `github.actions.auth` error without including Token.

- [ ] **Step 6: Extend Git repository for review and explicit main push**

Add public methods:

```ts
readFileAtHead(path: string): Promise<string | undefined>;
headSha(): Promise<string>;
pushMain(): Promise<string>;
```

Implement with exact Git args:

```ts
["show", `HEAD:${path}`]
["rev-parse", "HEAD"]
["push", "origin", "main"]
```

Keep `commitRouteChanges` staging scope unchanged.

- [ ] **Step 7: Implement structured publish review**

`publishReview.ts`:

1. Read current project snapshot and verify `expectedRevision`.
2. Read `HEAD:config/routes.yaml`; missing HEAD file becomes all-current-added.
3. Parse/normalize both v1/v2 through Core/Local Server runtime loading helpers.
4. Compare stable entity IDs for v2; for v1 use existing RuleSet IDs and deterministic name/output keys.
5. Return added/changed/removed counts for proxyGroups, routes, providers, vendorRepos and memberSets.
6. Include Git status, origin, branch, schema version and diagnostics.
7. If `includeIniDiff`, render both with the GitHub raw publish base and call the existing line diff helper moved to a pure Local Server/Core utility.

`canPublish` is true only when branch is `main`, origin is GitHub, no error diagnostics exist, and at least one route-author path is dirty or local `main` is ahead. Consume the existing `GitStatus.ahead/behind` fields; inability to read `origin/main` is surfaced as a review warning, not a hidden success.

- [ ] **Step 8: Implement publish orchestration and routes**

`publishMain` creates a complete four-step list up front. It then:

```ts
const status = await git.status();
if (status.branch !== "main") throw publishError("git.branch.not-main", steps, "当前分支不是 main");
const snapshot = await projectRepository.read();
assertRevision(snapshot, expectedRevision);
const diagnostics = await validateForPublish(snapshot);
if (hasDiagnosticErrors(diagnostics)) throw publishError("publish.validation", steps, "统一校验未通过", diagnostics);
markSuccess(steps, "validate", "统一校验通过");
await git.commitRouteChanges("chore: update route config");
markSuccess(steps, "commit", "已提交路由配置");
await git.pushMain();
markSuccess(steps, "push", "已推送 main");
const headSha = await git.headSha();
const run = await actions.findPublishRun(repo, headSha);
markActions(steps, run);
```

When no route-author changes exist but main is ahead, mark commit `skipped` and push. When neither changes nor ahead commits exist, return `publish.nothing-to-publish` before push. Every catch maps to a safe code/message and retains step states.

`githubRoutes.ts` exposes review, publish and status. It reads `GITHUB_TOKEN` from injected environment only. Register before generic Git routes.

- [ ] **Step 9: Run GREEN and commit**

Run:

```powershell
pnpm exec vitest run packages/local-server/tests/githubActionsClient.test.ts packages/local-server/tests/publishReview.test.ts packages/local-server/tests/githubPublish.test.ts packages/local-server/tests/githubRoutes.test.ts
pnpm --filter @clash-route-kit/local-server typecheck
```

Expected: PASS.

```powershell
git add packages/local-server/src/git packages/local-server/src/http/githubRoutes.ts packages/local-server/src/http/createApiHandler.ts packages/local-server/src/index.ts packages/local-server/tests/githubPublishFixtures.ts packages/local-server/tests/githubActionsClient.test.ts packages/local-server/tests/publishReview.test.ts packages/local-server/tests/githubPublish.test.ts packages/local-server/tests/githubRoutes.test.ts
git commit -m "feat: publish main through github actions"
```

### Task 5: Build the GitHub Publish tab and workflow concurrency

**Files:**

- Create: `apps/web/src/features/output/PublishStepList.tsx`
- Create: `apps/web/src/features/output/GitHubPublishTab.tsx`
- Create: `apps/web/tests/outputTestFixtures.tsx`
- Create: `apps/web/tests/githubPublishTab.test.tsx`
- Rewrite: `apps/web/src/features/output/OutputPage.tsx`
- Create: `apps/web/tests/outputPage.test.tsx`
- Modify: `.github/workflows/publish.yml`
- Modify: `apps/web/src/styles.css`

**Interfaces:**

- Consumes: output API review/publish/status and shared `TemplateSourceStatus`.
- Produces: `OutputTab = "device" | "github"`.
- Produces: `GitHubPublishTab` with lazy INI diff and Actions polling.
- Guarantees: button copy exactly “提交并推送 main”.

- [ ] **Step 1: Write Output tabs/default/shared status tests**

Create `apps/web/tests/outputTestFixtures.tsx`:

```tsx
import type {
  GitHubActionsRunStatus,
  GitHubPublishReview,
  GitHubPublishResult,
  TemplateSourceStatus,
} from "@clash-route-kit/local-server";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { GitHubPublishTab } from "../src/features/output/GitHubPublishTab.js";
import { OutputPage } from "../src/features/output/OutputPage.js";
import { AppProviders } from "../src/components/AppProviders.js";

export const localOnlyStatus: TemplateSourceStatus = {
  schemaVersion: 2,
  validation: { errors: 0, warnings: 0 },
  local: {
    kind: "local",
    availability: "available",
    url: "http://192.168.1.10:8787/templates/Custom_Clash.ini",
    message: "本地实时模板可用",
  },
  github: {
    kind: "github",
    availability: "unavailable",
    latest: false,
    message: "未检测到 GitHub origin",
  },
};

export const mainReview: GitHubPublishReview = {
  repository: { origin: "git@github.com:acme/routes.git", owner: "acme", repo: "routes" },
  branch: "main",
  headSha: "abc",
  dirtyPaths: ["config/routes.yaml"],
  ahead: 0,
  behind: 0,
  schemaVersion: 2,
  diagnostics: [],
  entityDiff: {
    proxyGroups: { added: 1, changed: 1, removed: 0 },
    routes: { added: 2, changed: 0, removed: 1 },
    providers: { added: 0, changed: 0, removed: 0 },
    vendorRepos: { added: 0, changed: 0, removed: 0 },
    memberSets: { added: 0, changed: 0, removed: 0 },
  },
  canPublish: true,
};

const idleRun: GitHubActionsRunStatus = {
  status: "not_found",
  conclusion: null,
  headSha: "abc",
};

export function renderOutputPage(input: { status?: TemplateSourceStatus } = {}) {
  const status = input.status ?? localOnlyStatus;
  return render(
    <AppProviders>
      <OutputPage
        expectedRevision="revision"
        defaultSubconverterUrl="http://127.0.0.1:25500/sub"
        fetchStatus={vi.fn(async () => status)}
        fetchReview={vi.fn(async () => mainReview)}
        publish={vi.fn(async (): Promise<GitHubPublishResult> => ({
          headSha: "abc",
          actionsUrl: "https://github.com/acme/routes/actions/workflows/publish.yml",
          steps: [],
        }))}
        fetchActionsStatus={vi.fn(async () => idleRun)}
      />
    </AppProviders>,
  );
}

export function renderGitHubTab(input: {
  review?: GitHubPublishReview;
  fetchReview?: (options: { includeIniDiff: boolean }) => Promise<GitHubPublishReview>;
  publish?: () => Promise<GitHubPublishResult>;
  fetchActions?: (sha: string) => Promise<GitHubActionsRunStatus>;
  onRefreshStatus?: () => void | Promise<void>;
} = {}) {
  const review = input.review ?? mainReview;
  return render(
    <AppProviders>
      <GitHubPublishTab
        expectedRevision="revision"
        fetchReview={input.fetchReview ?? vi.fn(async () => review)}
        publish={input.publish ?? vi.fn(async () => ({
          headSha: "abc",
          actionsUrl: "https://github.com/acme/routes/actions/workflows/publish.yml",
          steps: [],
        }))}
        fetchActionsStatus={input.fetchActions ?? vi.fn(async () => idleRun)}
        onRefreshStatus={input.onRefreshStatus ?? vi.fn()}
      />
    </AppProviders>,
  );
}
```

Create `apps/web/tests/outputPage.test.tsx`:

```tsx
import { fireEvent, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { localOnlyStatus, renderOutputPage } from "./outputTestFixtures.js";

it("defaults to Device Config and keeps GitHub Publish as an optional sibling tab", async () => {
  renderOutputPage({ status: localOnlyStatus });
  await screen.findByText(localOnlyStatus.local.url!);
  expect(screen.getByRole("tab", { name: "设备配置" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("tab", { name: /GitHub 发布/ })).toBeTruthy();
  expect(screen.getByText("可选")).toBeTruthy();
  expect(screen.getByText(localOnlyStatus.local.url!)).toBeTruthy();
  expect(screen.getByText("未检测到 GitHub origin")).toBeTruthy();
});

it("switches from an unavailable remote source to GitHub Publish", async () => {
  renderOutputPage({ status: localOnlyStatus });
  await screen.findByText("未检测到 GitHub origin");
  fireEvent.click(screen.getByRole("button", { name: "前往 GitHub 发布" }));
  expect(screen.getByRole("tab", { name: /GitHub 发布/ }).getAttribute("aria-selected")).toBe("true");
});
```

- [ ] **Step 2: Write publish review/copy/branch/status tests**

Create `apps/web/tests/githubPublishTab.test.tsx`:

```tsx
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { mainReview, renderGitHubTab } from "./outputTestFixtures.js";

it("shows structured review and loads full INI only on expand", async () => {
  const fetchReview = vi.fn()
    .mockResolvedValueOnce(mainReview)
    .mockResolvedValueOnce({ ...mainReview, iniDiff: "+ruleset=Chat,[]GEOSITE,telegram" });
  renderGitHubTab({ fetchReview });
  expect(await screen.findByText("新增路由 2")).toBeTruthy();
  expect(screen.queryByText(/\+ruleset=/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "展开完整 INI 差异" }));
  expect(await screen.findByText(/\+ruleset=/)).toBeTruthy();
  expect(fetchReview).toHaveBeenLastCalledWith({ includeIniDiff: true });
});

it("uses the real main action copy and blocks non-main", async () => {
  renderGitHubTab({ review: { ...mainReview, branch: "feature", canPublish: false } });
  expect(screen.getByText("当前分支不是 main")).toBeTruthy();
  expect(screen.getByRole("button", { name: "提交并推送 main" })).toBeDisabled();
  expect(screen.queryByText(/publish 分支/)).toBeNull();
});

it("renders validation, commit, push and Actions independently", async () => {
  const publish = vi.fn(async () => ({
    headSha: "abc",
    actionsUrl: "https://github.com/acme/routes/actions/workflows/publish.yml",
    steps: [
      { name: "validate", status: "success", message: "统一校验通过" },
      { name: "commit", status: "success", message: "已提交路由配置" },
      { name: "push", status: "success", message: "已推送 main" },
      { name: "actions", status: "pending", message: "GitHub Actions 排队中" },
    ],
  }));
  renderGitHubTab({ review: mainReview, publish });
  fireEvent.click(screen.getByRole("button", { name: "提交并推送 main" }));
  expect(await screen.findByText("统一校验通过")).toBeTruthy();
  expect(screen.getByText("已提交路由配置")).toBeTruthy();
  expect(screen.getByText("已推送 main")).toBeTruthy();
  expect(screen.getByText("GitHub Actions 排队中")).toBeTruthy();
});

it("marks remote latest only after matching Actions success", async () => {
  vi.useFakeTimers();
  const fetchActions = vi.fn()
    .mockResolvedValueOnce({ status: "in_progress", conclusion: null, headSha: "abc" })
    .mockResolvedValueOnce({ status: "completed", conclusion: "success", headSha: "abc" });
  const onRefreshStatus = vi.fn();
  const publish = vi.fn(async () => ({
    headSha: "abc",
    actionsUrl: "https://github.com/acme/routes/actions/workflows/publish.yml",
    steps: [
      { name: "validate" as const, status: "success" as const, message: "统一校验通过" },
      { name: "commit" as const, status: "success" as const, message: "已提交路由配置" },
      { name: "push" as const, status: "success" as const, message: "已推送 main" },
      { name: "actions" as const, status: "pending" as const, message: "GitHub Actions 排队中" },
    ],
  }));
  try {
    renderGitHubTab({ review: mainReview, publish, fetchActions, onRefreshStatus });
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "提交并推送 main" }));
    await act(async () => {});
    expect(onRefreshStatus).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(onRefreshStatus).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(fetchActions).toHaveBeenCalledTimes(2);
    expect(onRefreshStatus).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
pnpm exec vitest run apps/web/tests/outputPage.test.tsx apps/web/tests/githubPublishTab.test.tsx
```

Expected: FAIL because final Output/GitHub components do not exist.

- [ ] **Step 4: Implement shared Output status and tab state**

Rewrite `OutputPage.tsx`:

```tsx
import { Alert, Skeleton, Space, Tag, Tabs, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import type {
  GitHubActionsRunStatus,
  GitHubPublishReview,
  GitHubPublishResult,
  TemplateSourceStatus,
} from "@clash-route-kit/local-server";
import { DeviceConfigTab } from "./DeviceConfigTab.js";
import { GitHubPublishTab } from "./GitHubPublishTab.js";

export type OutputTab = "device" | "github";

export interface OutputPageProps {
  expectedRevision: string;
  defaultSubconverterUrl: string;
  fetchStatus(): Promise<TemplateSourceStatus>;
  fetchReview(options: { includeIniDiff: boolean }): Promise<GitHubPublishReview>;
  publish(): Promise<GitHubPublishResult>;
  fetchActionsStatus(sha: string): Promise<GitHubActionsRunStatus>;
}

export function OutputPage(props: OutputPageProps) {
  const [tab, setTab] = useState<OutputTab>("device");
  const [status, setStatus] = useState<TemplateSourceStatus | null>(null);
  const [error, setError] = useState("");

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await props.fetchStatus());
      setError("");
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }, [props.fetchStatus]);

  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  return (
    <section className="rk-output-page rk-page-shell" aria-labelledby="output-title">
      <header className="rk-output-header">
        <Typography.Title id="output-title" level={2}>输出</Typography.Title>
        <Typography.Paragraph type="secondary">
          先在本地生成设备配置；需要共享远程模板时再使用 GitHub 发布。
        </Typography.Paragraph>
        {status ? (
          <dl className="rk-template-status" aria-label="模板来源状态">
            <div>
              <dt>本地模板</dt>
              <dd>{status.local.url ?? status.local.message}</dd>
            </div>
            <div>
              <dt>GitHub 模板</dt>
              <dd>{status.github.url ?? status.github.message}</dd>
            </div>
          </dl>
        ) : null}
      </header>

      {error ? <Alert type="error" showIcon message={error} /> : null}
      {!status ? <Skeleton active /> : (
        <Tabs
          activeKey={tab}
          onChange={(key) => setTab(key as OutputTab)}
          items={[
            {
              key: "device",
              label: "设备配置",
              children: (
                <DeviceConfigTab
                  status={status}
                  defaultSubconverterUrl={props.defaultSubconverterUrl}
                  onOpenGitHubPublish={() => setTab("github")}
                  onRefreshStatus={refreshStatus}
                />
              ),
            },
            {
              key: "github",
              label: <Space size={6}>GitHub 发布<Tag>可选</Tag></Space>,
              children: (
                <GitHubPublishTab
                  expectedRevision={props.expectedRevision}
                  fetchReview={props.fetchReview}
                  publish={props.publish}
                  fetchActionsStatus={props.fetchActionsStatus}
                  onRefreshStatus={refreshStatus}
                />
              ),
            },
          ]}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 5: Implement review, publish and Actions polling**

`GitHubPublishTab` fetches the default review on mount. Full diff is fetched only from the expand event. Publish sets the returned step list immediately, then polls matching SHA while Actions is pending/running:

```ts
useEffect(() => {
  if (!pollSha) return;
  let active = true;
  const timer = window.setInterval(() => {
    void props.fetchActionsStatus(pollSha).then((run) => {
      if (!active) return;
      setRun(run);
      if (run.status === "completed") {
        window.clearInterval(timer);
        setPollSha("");
        if (run.conclusion === "success" && run.headSha === pollSha) {
          void props.onRefreshStatus();
        }
      }
    });
  }, 2_000);
  return () => {
    active = false;
    window.clearInterval(timer);
  };
}, [pollSha, props.fetchActionsStatus, props.onRefreshStatus]);
```

Render steps through `PublishStepList`; each row has icon, text and status, not color alone. `mainReview.canPublish` controls the button. Show origin, branch, dirty paths, Schema version and last publish state.

- [ ] **Step 6: Add workflow concurrency**

Add directly below `permissions` or before `jobs` in `.github/workflows/publish.yml`:

```yaml
concurrency:
  group: clash-route-kit-publish-${{ github.repository }}-${{ github.ref_name }}
  cancel-in-progress: true
```

Keep triggers, validation, generation and `peaceiris/actions-gh-pages` behavior unchanged. The workflow remains the only code path that writes `publish`.

- [ ] **Step 7: Run GREEN and workflow assertions**

Run:

```powershell
pnpm exec vitest run apps/web/tests/outputPage.test.tsx apps/web/tests/githubPublishTab.test.tsx
pnpm --filter @clash-route-kit/web typecheck
rg -n "concurrency|cancel-in-progress|publish_branch: publish" .github/workflows/publish.yml
```

Expected: tests/typecheck pass; workflow search shows all three lines.

- [ ] **Step 8: Commit**

```powershell
git add apps/web/src/features/output apps/web/tests/outputTestFixtures.tsx apps/web/tests/outputPage.test.tsx apps/web/tests/githubPublishTab.test.tsx apps/web/src/styles.css .github/workflows/publish.yml
git commit -m "feat: add optional github publishing"
```

### Task 6: Remove obsolete publish flow and run privacy/responsive acceptance

**Files:**

- Delete: `apps/web/src/components/PublishPage.tsx`
- Delete: `apps/web/src/components/PublishLeftPanel.tsx`
- Delete: `apps/web/src/components/ConfigYamlSection.tsx`
- Delete: corresponding old tests。
- Delete/move: `apps/web/src/publishWorkflow.ts`, `apps/web/src/subscriptions.ts` when no consumers remain。
- Modify: `apps/web/src/actions.ts` to remove obsolete Git action client types if unused。
- Modify: `apps/web/src/styles.css`。
- Review: `packages/local-server/src/output/`, `packages/local-server/src/git/`, `.github/workflows/publish.yml`。

**Interfaces:**

- Verifies: no client-side `generate → git-commit → git-push` loop remains.
- Verifies: no secret persistence/logging path exists.
- Verifies: local-only and GitHub scenarios both close at desktop/mobile widths.

- [ ] **Step 1: Search and remove obsolete flow consumers**

Run:

```powershell
rg -n "PublishPage|PublishLeftPanel|ConfigYamlSection|publishActions|buildAndPush|git-commit|git-push|构建并推送 publish 分支|已构建并推送到 publish 分支" apps/web/src apps/web/tests
```

Replace every live consumer with the new Output feature. Delete an old file only when the search no longer shows a consumer and its replacement test passes.

- [ ] **Step 2: Add privacy regression searches and tests**

Add one Local Server test that injects a token-bearing request and spies on `console.log`, `console.info`, `console.warn`, and `console.error`; after success and failure all spies remain unused.

Add one Web test that unmounts and remounts `DeviceConfigTab`:

```tsx
it("drops subscription state when the Output page unmounts", () => {
  const first = renderDeviceTab({ status: localOnlyStatus });
  addSecretSubscription();
  expect(screen.getByDisplayValue("https://example.com/super-secret")).toBeTruthy();
  first.unmount();
  renderDeviceTab({ status: localOnlyStatus });
  expect(screen.queryByDisplayValue("https://example.com/super-secret")).toBeNull();
});
```

- [ ] **Step 3: Complete responsive Output styles**

Add:

```css
.rk-output-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.rk-output-tabs {
  min-height: 0;
  flex: 1;
}

.rk-subscription-row {
  display: grid;
  grid-template-columns: minmax(100px, 0.3fr) minmax(240px, 1fr) auto auto;
  gap: 8px;
  align-items: center;
}

@media (max-width: 640px) {
  .rk-output-status-grid {
    grid-template-columns: 1fr;
  }

  .rk-subscription-row {
    grid-template-columns: 1fr;
  }

  .rk-output-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
```

Keep both tabs visible on narrow screens; allow tab bar horizontal scrolling only for the tab strip, not the task form.

- [ ] **Step 4: Run the complete automated gate**

Run:

```powershell
pnpm exec vitest run packages/local-server/tests/deviceConfig.test.ts packages/local-server/tests/outputRoutes.test.ts packages/local-server/tests/githubActionsClient.test.ts packages/local-server/tests/publishReview.test.ts packages/local-server/tests/githubPublish.test.ts packages/local-server/tests/githubRoutes.test.ts apps/web/tests/outputApi.test.ts apps/web/tests/deviceConfigModel.test.ts apps/web/tests/deviceConfigTab.test.tsx apps/web/tests/outputPage.test.tsx apps/web/tests/githubPublishTab.test.tsx
pnpm test
pnpm typecheck
pnpm build
pnpm check
pnpm generate
```

Expected: every command exits 0.

- [ ] **Step 5: Run secret and obsolete-copy searches**

Run:

```powershell
rg -n "localStorage|sessionStorage|indexedDB|caches\.open" apps/web/src/features/output packages/local-server/src/output
rg -n "subscriptionUrl|token" packages/local-server/src/config config .clashroutekit
rg -n "构建并推送 publish 分支|已构建并推送到 publish 分支|发布到 GitHub" apps/web/src
```

Expected:

- no persistence API matches in Output;
- no subscription/token fields in project/local-setting parsers or committed config;
- no obsolete publish copy; “GitHub 发布” remains only as page/tab noun where appropriate.

- [ ] **Step 6: Run local-only browser scenario at 1200px and 360px**

Start:

```powershell
pnpm dev
```

At both widths:

1. Open Output; confirm Device Config is selected and GitHub is labeled optional.
2. Leave GitHub unconfigured; add two subscriptions, set config name and SubConverter endpoint.
3. Expand and collapse advanced options; verify fields retain values.
4. Generate using local template; verify download, copy link and QR actions.
5. Refresh; verify subscriptions/Token disappear while project/local settings remain.

Expected: the complete scenario succeeds without entering GitHub Publish.

- [ ] **Step 7: Run GitHub browser scenario on a safe test repository**

At 1200px, using a repository where pushing `main` is explicitly intended:

1. Open GitHub Publish and inspect origin, branch, dirty paths, Schema and structured change counts.
2. Expand full INI diff and confirm it was not loaded before expansion.
3. If branch is not `main`, confirm the button is disabled and no Git command runs.
4. On `main`, click “提交并推送 main”.
5. Observe validate, commit, push, queued/running/success statuses separately.
6. Confirm raw remote remains stale during queued/running and becomes latest only after matching success.
7. Return to Device Config, select GitHub remote template and generate.

Expected: UI text matches actual Git/Actions flow; no client action claims to push `publish` directly.

- [ ] **Step 8: Commit cleanup and verification changes**

```powershell
git add apps/web/src/components/PublishPage.tsx apps/web/src/components/PublishLeftPanel.tsx apps/web/src/components/ConfigYamlSection.tsx apps/web/src/publishWorkflow.ts apps/web/src/subscriptions.ts apps/web/src/actions.ts apps/web/src/styles.css apps/web/src/features/output/DeviceConfigTab.tsx apps/web/tests/publishPage.test.tsx apps/web/tests/publishLeftPanel.test.tsx apps/web/tests/configYamlSection.test.tsx apps/web/tests/publishWorkflow.test.ts apps/web/tests/subscriptions.test.ts apps/web/tests/deviceConfigTab.test.tsx packages/local-server/src/output/deviceConfig.ts packages/local-server/src/http/outputRoutes.ts packages/local-server/tests/deviceConfig.test.ts packages/local-server/tests/outputRoutes.test.ts .github/workflows/publish.yml
git commit -m "refactor: retire legacy publish flow"
```

Before committing, inspect staged diff and exclude user config, local settings, output files and `.agents` changes.

### Task 7: Final specification and workflow audit

**Files:**

- Review: `apps/web/src/features/output/`
- Review: `packages/local-server/src/output/`
- Review: `packages/local-server/src/git/`
- Review: `.github/workflows/publish.yml`
- Review: design specification acceptance criteria 11–17。

**Interfaces:**

- Verifies: TemplateSourceStatus is calculated once and shared by both tabs.
- Verifies: remote latest state is Actions-backed.
- Verifies: device and publish paths have independent success conditions.

- [ ] **Step 1: Trace each shared status consumer**

Run:

```powershell
rg -n "TemplateSourceStatus|fetchTemplateSourceStatus|onRefreshStatus" apps/web/src/features/output packages/local-server/src/output packages/local-server/src/git
```

Expected: one server computation, one Web API fetch and shared props to both tabs; no duplicate raw URL freshness logic in components.

- [ ] **Step 2: Verify branch writer ownership and concurrency**

Run:

```powershell
rg -n "publish_branch: publish|git push.*publish|pushMain|push.*origin.*main|concurrency|cancel-in-progress" .github packages apps
```

Expected: workflow action is the only `publish` writer; Local Server explicitly pushes `origin main`; concurrency is configured.

- [ ] **Step 3: Verify endpoint and DTO consistency**

Run:

```powershell
rg -n "/api/output/status|/api/output/device-config|/api/github/publish/review|/api/github/publish|/api/github/actions/status" packages/local-server/src apps/web/src/features/output
```

Expected: every route has one server definition and one typed Web client consumer with matching method/path.

- [ ] **Step 4: Run final repository acceptance**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm check
pnpm generate
git diff --check
git status --short
```

Expected: all commands pass; only intended commits or known user-owned changes remain.

- [ ] **Step 5: Commit final test-only corrections if present**

```powershell
git add packages/local-server/tests apps/web/tests .github/workflows/publish.yml
git commit -m "test: verify output and github publishing"
```

Skip this commit when no correction was required.
