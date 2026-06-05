# Local-First GitHub Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn ClashRouteKit into a local-first repository template where users fork or clone the project, edit route configuration through a local Web UI, and publish stable INI/YAML links through their own GitHub Actions `publish` branch.

**Architecture:** `config/modules.yaml` remains the source of truth in the local Git checkout. The browser UI talks only to the local Vite dev server API, which reads/writes fixed project files, runs existing validation/generation commands, and can invoke local Git commands. The browser never calls GitHub APIs and never stores GitHub tokens; GitHub authentication is delegated to the user's existing local Git setup.

**Tech Stack:** TypeScript, React 19, Vite dev server middleware, Node.js `fs`/`child_process`, Vitest, `yaml`, GitHub Actions.

---

## Product Shape

ClashRouteKit should be presented as a GitHub repository template:

- User forks or creates a repository from the template.
- User clones the repository locally.
- User runs `pnpm install` and `pnpm dev`.
- The local Web UI edits `config/modules.yaml` and rule list files through a local API.
- The local Web UI triggers `check`, `generate`, `git status`, `git commit`, and `git push`.
- GitHub Actions publishes generated output to the user's `publish` branch.
- The user's stable URLs remain `https://raw.githubusercontent.com/<owner>/<repo>/publish/templates/Custom_Clash.ini` and `https://raw.githubusercontent.com/<owner>/<repo>/publish/rules/<file>.yaml`.

This avoids Docker, Vercel, GitHub OAuth, browser-held GitHub tokens, and a hosted backend.

## Scope

In scope:

- Browser-safe YAML parse/serialize helpers for `RouteKitProjectConfig`.
- Local dev server API for reading and writing `config/modules.yaml`.
- Web UI state based on the local file instead of the bundled read-only import.
- Module enable/disable changes that persist to `config/modules.yaml`.
- Existing `check` and `generate` local actions remain available.
- Local Git action panel for status, commit, and push.
- Documentation that explains the fork/clone/run/edit/push/publish workflow.

Out of scope:

- Public hosted Web app.
- Vercel deployment.
- GitHub OAuth or PAT flow.
- Docker image.
- Multi-user editing.
- Dynamic server-hosted INI/YAML endpoints outside GitHub raw URLs.

## File Structure

- Create `packages/core/src/configDocument.ts`
  Browser-safe parse and serialize utilities for `RouteKitProjectConfig`.
- Modify `packages/core/src/index.ts`
  Export config document utilities.
- Create `packages/core/tests/configDocument.test.ts`
  Verify parse, serialization, and basic shape validation.
- Create `apps/web/src/projectState.ts`
  Pure helpers for changing module enabled state without mutating the config.
- Create `apps/web/tests/projectState.test.ts`
  Verify state helpers.
- Create `apps/web/src/localProject.ts`
  Browser client for local project APIs.
- Create `apps/web/tests/localProject.test.ts`
  Verify API request/response handling.
- Modify `apps/web/dev/routeKitApi.ts`
  Add local project config read/write endpoints and Git command endpoints.
- Modify `apps/web/tests/routeKitApi.test.ts`
  Cover config read/write and Git actions with injected dependencies.
- Modify `apps/web/src/actions.ts`
  Extend local action client to support Git commands.
- Modify `apps/web/tests/actions.test.ts`
  Verify Git action requests.
- Modify `apps/web/src/config.ts`
  Keep bundled config only as startup fallback.
- Modify `apps/web/src/App.tsx`
  Load config from local API, persist module toggles, expose save/check/generate/git controls.
- Modify `apps/web/src/styles.css`
  Style the local project and Git controls.
- Modify `README.md`
  Document the repository-template usage flow.

---

### Task 1: Add Browser-Safe Config Document Utilities

**Files:**
- Create: `packages/core/src/configDocument.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/configDocument.test.ts`

- [x] **Step 1: Write the failing tests**

Create `packages/core/tests/configDocument.test.ts`:

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

- [x] **Step 2: Run the focused test and verify it fails**

Run: `pnpm test -- packages/core/tests/configDocument.test.ts`

Expected: fail because the exported functions do not exist.

- [x] **Step 3: Implement config document utilities**

Create `packages/core/src/configDocument.ts`:

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

Modify `packages/core/src/index.ts`:

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

- [x] **Step 4: Verify tests pass**

Run: `pnpm test -- packages/core/tests/configDocument.test.ts`

Expected: pass.

- [x] **Step 5: Record progress**

Mark Task 1 as complete in this plan after the verification command passes.

---

### Task 2: Add Pure Project State Helpers

**Files:**
- Create: `apps/web/src/projectState.ts`
- Test: `apps/web/tests/projectState.test.ts`

- [x] **Step 1: Write failing project state tests**

Create `apps/web/tests/projectState.test.ts`:

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

- [x] **Step 2: Run the focused test and verify it fails**

Run: `pnpm test -- apps/web/tests/projectState.test.ts`

Expected: fail because `projectState.ts` does not exist.

- [x] **Step 3: Implement project state helpers**

Create `apps/web/src/projectState.ts`:

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

- [x] **Step 4: Verify tests pass**

Run: `pnpm test -- apps/web/tests/projectState.test.ts`

Expected: pass.

- [x] **Step 5: Record progress**

Mark Task 2 as complete in this plan after the verification command passes.

---

### Task 3: Add Local Project API Client

**Files:**
- Create: `apps/web/src/localProject.ts`
- Test: `apps/web/tests/localProject.test.ts`

- [x] **Step 1: Write failing local project client tests**

Create `apps/web/tests/localProject.test.ts`:

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

- [x] **Step 2: Run the focused test and verify it fails**

Run: `pnpm test -- apps/web/tests/localProject.test.ts`

Expected: fail because `localProject.ts` does not exist.

- [x] **Step 3: Implement the local project client**

Create `apps/web/src/localProject.ts`:

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

- [x] **Step 4: Verify tests pass**

Run: `pnpm test -- apps/web/tests/localProject.test.ts`

Expected: pass.

- [x] **Step 5: Record progress**

Mark Task 3 as complete in this plan after the verification command passes.

---

### Task 4: Add Local Config Read/Write API

**Files:**
- Modify: `apps/web/dev/routeKitApi.ts`
- Modify: `apps/web/tests/routeKitApi.test.ts`

- [x] **Step 1: Add routeKitApi tests for config read/write helpers**

Append to `apps/web/tests/routeKitApi.test.ts`:

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

- [x] **Step 2: Run the focused test and verify it fails**

Run: `pnpm test -- apps/web/tests/routeKitApi.test.ts`

Expected: fail because the project config helper exports do not exist.

- [x] **Step 3: Implement config file helpers**

Modify imports in `apps/web/dev/routeKitApi.ts`:

```ts
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseRouteKitConfig,
  serializeRouteKitConfig,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";
```

Add these interfaces and functions above `runRouteKitAction`:

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

- [x] **Step 4: Add HTTP routes for project config**

Inside `createRouteKitApiHandler`, before the `/api/actions/` branch, add:

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

- [x] **Step 5: Verify routeKitApi tests pass**

Run: `pnpm test -- apps/web/tests/routeKitApi.test.ts`

Expected: pass.

- [x] **Step 6: Record progress**

Mark Task 4 as complete in this plan after the verification command passes.

---

### Task 5: Add Local Git Actions

**Files:**
- Modify: `apps/web/dev/routeKitApi.ts`
- Modify: `apps/web/src/actions.ts`
- Modify: `apps/web/tests/actions.test.ts`
- Modify: `apps/web/tests/routeKitApi.test.ts`

- [x] **Step 1: Extend action client tests**

Append to `apps/web/tests/actions.test.ts`:

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

- [x] **Step 2: Run action tests and verify failure**

Run: `pnpm test -- apps/web/tests/actions.test.ts`

Expected: fail because `git-status` is not a valid action.

- [x] **Step 3: Extend action types**

Modify `apps/web/src/actions.ts`:

```ts
export type LocalRouteKitAction = "check" | "generate" | "git-status" | "git-commit" | "git-push";
```

Update `isLocalActionResponse`:

```ts
const actions: LocalRouteKitAction[] = ["check", "generate", "git-status", "git-commit", "git-push"];
return (
  actions.includes(candidate?.action) &&
  typeof candidate.ok === "boolean" &&
  typeof candidate.output === "string"
);
```

- [x] **Step 4: Add routeKitApi tests for Git actions**

Append to `apps/web/tests/routeKitApi.test.ts`:

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

- [x] **Step 5: Implement Git action runner**

In `apps/web/dev/routeKitApi.ts`, add imports:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
```

Add types:

```ts
const execFileAsync = promisify(execFile);

type RunCommand = (command: string, args: string[], cwd: string) => Promise<string>;

async function defaultRunCommand(command: string, args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync(command, args, { cwd });
  return [result.stdout, result.stderr].filter(Boolean).join("");
}
```

Extend `RouteKitAction`:

```ts
export type RouteKitAction = "check" | "generate" | "git-status" | "git-commit" | "git-push";
```

Extend `RouteKitActionDependencies`:

```ts
interface RouteKitActionDependencies {
  checkConfig?: typeof checkConfig;
  generateOutputs?: typeof generateOutputs;
  runCommand?: RunCommand;
}
```

Add Git branches to `runRouteKitAction` before generate handling:

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

Update `parseRouteKitAction`:

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

- [x] **Step 6: Verify Git action tests pass**

Run:

```powershell
pnpm test -- apps/web/tests/actions.test.ts apps/web/tests/routeKitApi.test.ts
```

Expected: pass.

- [x] **Step 7: Record progress**

Mark Task 5 as complete in this plan after the verification command passes.

---

### Task 6: Make Web UI Load and Save Local Config

**Files:**
- Modify: `apps/web/src/config.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

- [x] **Step 1: Keep bundled config as fallback only**

Modify `apps/web/src/config.ts`:

```ts
import { parseRouteKitConfig } from "@clash-route-kit/core";
import modulesYaml from "../../../config/modules.yaml?raw";

export const bundledProjectConfig = parseRouteKitConfig(modulesYaml);
export const bundledProjectConfigYaml = modulesYaml;
```

- [x] **Step 2: Update App imports**

In `apps/web/src/App.tsx`, replace the config import:

```ts
import { bundledProjectConfig, bundledProjectConfigYaml } from "./config.js";
```

Add imports:

```ts
import { loadLocalProjectConfig, saveLocalProjectConfig } from "./localProject.js";
import { toggleModuleEnabled } from "./projectState.js";
```

- [x] **Step 3: Add local project state**

Inside `App`, replace the config and enabled initialization:

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

Remove the old `enabled` state, `defaultEnabled`, and `activeProjectConfig`.

- [x] **Step 4: Load local config on startup**

Add this effect inside `App`:

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

- [x] **Step 5: Persist module toggles to local config state**

Replace the module toggle callback:

```tsx
onToggle={() => {
  setConfig((current) => toggleModuleEnabled(current, module.id));
  setProjectState({
    status: "ready",
    message: "有未保存的本地配置修改",
  });
}}
```

- [x] **Step 6: Add save handler**

Add this function inside `App`:

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

- [x] **Step 7: Add local project controls to the UI**

Add a panel near the top of the right rail:

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

- [x] **Step 8: Add local project styles**

Append to `apps/web/src/styles.css`:

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

- [x] **Step 9: Verify Web tests and typecheck**

Run:

```powershell
pnpm test -- apps/web/tests/localProject.test.ts apps/web/tests/projectState.test.ts apps/web/tests/routeSummary.test.ts
pnpm typecheck
```

Expected: all tests pass and typecheck succeeds.

- [x] **Step 10: Record progress**

Mark Task 6 as complete in this plan after the verification command passes.

---

### Task 7: Expose Git Workflow in the Web UI

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

- [x] **Step 1: Add Git actions to the existing operations panel**

In `LocalActionsPanel`, add buttons beside check/generate:

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

- [x] **Step 2: Add helper text for the publish flow**

Under the action toolbar, add:

```tsx
<p className="operation-hint">
  推荐顺序：保存配置 -> 运行检查 -> 生成输出 -> 提交配置 -> 推送发布。推送后 GitHub Actions 会生成 publish 分支。
</p>
```

- [x] **Step 3: Style operation hint**

Append to `apps/web/src/styles.css`:

```css
.operation-hint {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
}
```

- [x] **Step 4: Verify typecheck**

Run: `pnpm typecheck`

Expected: pass.

- [x] **Step 5: Record progress**

Mark Task 7 as complete in this plan after the verification command passes.

---

### Task 8: Update Product Documentation

**Files:**
- Modify: `README.md`

- [x] **Step 1: Update README quickstart**

Add this section to `README.md`:

```md
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
```

- [x] **Step 2: Remove obsolete project status dependency**

Keep `docs/project-status.md` deleted. The formal project direction now lives in this plan and in `README.md`.

- [x] **Step 3: Verify docs are tracked as intended**

Run:

```powershell
git status --short --untracked-files=all
git check-ignore -q docs/superpowers/plans/2026-06-06-web-first-github-publish.md; if ($LASTEXITCODE -eq 0) { "plan ignored" } else { "plan tracked or unignored" }
```

Expected:

```text
plan tracked or unignored
```

- [x] **Step 4: Record progress**

Mark Task 8 as complete in this plan after the verification command passes.

---

### Task 9: Full Verification

**Files:**
- No new files.

- [x] **Step 1: Run full tests**

Run: `pnpm test`

Expected: all Vitest suites pass.

- [x] **Step 2: Run full typecheck**

Run: `pnpm typecheck`

Expected: all workspace TypeScript checks pass.

- [x] **Step 3: Run full build**

Run: `pnpm build`

Expected: core, CLI, and Web build successfully.

- [x] **Step 4: Verify local generation**

Run:

```powershell
pnpm check
pnpm generate
```

Expected: `pnpm check` reports no diagnostics and `pnpm generate` writes template, rule provider YAML, and report files under `output/`.

- [x] **Step 5: Manual local Web verification**

Run: `pnpm dev`

Open the local Vite URL and verify:

- The app loads `config/modules.yaml` from `/api/project/config`.
- Toggling a module changes the preview.
- Clicking `保存配置` writes `config/modules.yaml`.
- Clicking `运行检查` returns check output.
- Clicking `生成输出` writes output.
- Clicking `Git 状态` shows the changed files.
- `提交配置` and `推送发布` buttons are visible; do not click them during automated validation unless the user explicitly asks to create a commit or push.
- The browser does not ask for or store a GitHub token.

- [x] **Step 6: Record verification status**

No additional fix commit is required by the final verification pass.

---

## Operational Notes

- This design intentionally does not solve hosted editing. Users edit from their local clone.
- The local dev server API must only operate on fixed project paths and a fixed set of commands.
- The browser must not accept arbitrary filesystem paths or arbitrary shell commands.
- Git authentication is handled by the user's machine through Git Credential Manager, GitHub CLI, or SSH.
- `output/` remains ignored on `main`; GitHub Actions remains the publisher of generated raw URLs.
- CLI remains useful for CI and direct local scripting, but the primary user experience is the Web UI.

## Self-Review

- Spec coverage: the plan covers fork/clone local usage, local Web editing, local file persistence, local Git actions, GitHub Actions publishing, and stable raw URLs.
- Placeholder scan: the plan does not contain unresolved placeholder instructions.
- Type consistency: `RouteKitProjectConfig`, local action names, local API payloads, and route paths are consistent across tasks.
