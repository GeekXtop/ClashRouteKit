# Current v1 Configuration Health Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留 v1 `config/routes.yaml` 结构的前提下，建立 Core 统一结构化诊断，使 Web 保存、CLI `check`、`generate` 和当前发布动作对同一阻断项得出一致结论，并修复当前配置中的已知不可执行项。

**Architecture:** Core 新增无 IO 的 `Diagnostic`、通用依赖图、严格 v1 parser 和 `validateLegacyProjectConfig`；CLI 只追加本地文件与 GEOSITE Catalog 等工作区诊断，Web 直接消费 Core 结果。所有会写产物或推送的路径先过滤 error，warning 保持可见但不阻断；当前 YAML 只做定向修复，不引入 Schema v2 字段。

**Tech Stack:** pnpm 9.1.4 workspace、Node.js 22、TypeScript 5.8 strict ESM/NodeNext、YAML 2.8、React 19、Vitest 3.2、Testing Library。

## Global Constraints

- 本阶段只加固 v1，不添加 `schemaVersion: 2`、稳定策略组 ID 或 `memberSets`；这些属于下一份计划。
- 项目作者配置继续是单个 `config/routes.yaml`；不得先物理拆分配置。
- Core 不得导入 `node:*`、React、Vite、HTTP 或 Git。
- 纯配置诊断必须在 Core 内完成；GEOSITE 本地目录、规则文件和 vendor 等检查由 Node 侧完成。
- 统一诊断结构固定为 `{ code, severity, path?, message, related? }`。
- Web 草稿允许 warning 保存，不允许 error 写盘；禁用的不完整 provider 与禁用的引用规则可以保留为 warning。
- `enabled` 缺失继续表示启用，以兼容当前 v1；新建空 provider 默认 `enabled: false`。
- 启用或缺省启用的 provider 必须至少有一个有效数据源，且输出只能是 `.yaml`。
- `.mrs` 没有专用生成器；启用时是 error，禁用时是 warning，任何情况下都不得进入生成循环。
- 节点过滤器中的 HTTP/HTTPS URL 是 error；空值或无效正则也是 error。
- GEOSITE Catalog 是工作区提示而不是作者 Schema 真相；缺失 base tag 只产生 warning，`tag@attribute` 按 `tag` 查目录。
- `generate` 和 GitHub 发布遇到 error 必须停止，且停止发生在创建或覆盖 `output/` 文件之前。
- 保留现有 INI 渲染目标语义和 provider YAML 生成器，不在本阶段改用新的 Render DTO。
- 保留 Web 抽屉显式保存边界；本阶段不重做页面信息架构。
- 当前工作树中的 `.agents/active.md` 与既有 `config/routes.yaml` 修改属于用户上下文；执行时先审阅差异，不回滚、不覆盖、不把无关修改混入提交。
- 所有源文件修改使用 `apply_patch`；使用两个空格、双引号、多行尾逗号和显式 `.js` ESM 导入。

---

## File Structure

### Core diagnostics and graph

- Create: `packages/core/src/config/diagnostics.ts` — `Diagnostic`、error 过滤、格式化和阻断异常。
- Create: `packages/core/src/routing/dependencyGraph.ts` — 可复用有向图循环检测。
- Create: `packages/core/tests/diagnostics.test.ts` — error 判定与格式化测试。
- Create: `packages/core/tests/dependencyGraph.test.ts` — 去重循环和无环图测试。
- Modify: `packages/core/src/index.ts` — 导出公共诊断和图接口。

### Strict v1 parser

- Create: `packages/core/src/config/valueReaders.ts` — 严格 object/array/string/number/boolean/enum/known-key 读取器。
- Create: `packages/core/src/config/legacyParser.ts` — 深层解析 v1 顶层、策略组、RuleSet、provider/source 和 vendor repo。
- Modify: `packages/core/src/configDocument.ts` — YAML 解析后调用严格 v1 parser，保留现有序列化函数。
- Modify: `packages/core/src/types.ts` — `RuleProviderConfig.enabled?: boolean`。
- Modify: `packages/core/tests/configDocument.test.ts` — 数字策略组、缺字段 RuleSet、非法 vendor/source、未知嵌套字段回归。

### Pure v1 validation

- Create: `packages/core/src/config/validateLegacy.ts` — 唯一的 v1 纯配置语义诊断。
- Create: `packages/core/tests/legacyValidation.test.ts` — 引用、循环、FINAL、provider、`.mrs`、node filter、behavior 测试。
- Modify: `packages/core/src/defaults.ts` — 保留解析默认值函数，删除仅返回字符串的重复校验实现或改为内部兼容包装。
- Modify: `packages/core/src/ini.ts` — 渲染时忽略禁用 provider 对应的不可执行路由只由校验保证；不自行修复引用。

### Web integration

- Delete: `apps/web/src/draftValidation.ts` — 删除 Web 自有业务校验。
- Delete: `apps/web/tests/draftValidation.test.ts` — 对应行为迁移到 Core 测试。
- Modify: `apps/web/src/projectController.ts` — 保存门禁直接使用 `validateLegacyProjectConfig`。
- Modify: `apps/web/tests/projectController.test.ts` — 断言结构化 warning/error 行为。
- Modify: `apps/web/src/proxyGroups.ts` — 删除循环检测实现，仅保留节点筛选与视觉辅助函数。
- Modify: `apps/web/tests/proxyGroups.test.ts` — 删除已迁移到 Core 的循环测试。
- Modify: `apps/web/src/configMutations.ts` — 新建/导入空 provider 默认禁用；未解析 provider 路由同步禁用。
- Modify: `apps/web/tests/configMutations.test.ts` — 禁用占位项测试。
- Modify: `apps/web/src/components/ProviderRecipeEditor.tsx` — 提供启用开关和阻断提示。
- Modify: `apps/web/tests/providerRecipeEditor.test.tsx` — 启用状态测试。

### CLI, generation and local API integration

- Create: `apps/cli/src/workspaceValidation.ts` — 文件、provider source 和 GEOSITE Catalog 诊断。
- Create: `apps/cli/tests/workspaceValidation.test.ts` — `tag@attribute` 和非权威缺失 warning 测试。
- Modify: `apps/cli/src/program.ts` — 使用严格 parser；`checkConfig` 返回 `Diagnostic[]`；生成前统一门禁；跳过禁用 provider。
- Modify: `apps/cli/src/index.ts` — warning 输出但不置失败码，error 置失败码。
- Modify: `apps/cli/src/serveApi.ts` — 保存 API、check/generate/publish actions 使用相同诊断并返回 `diagnostics`。
- Modify: `apps/cli/tests/cli.test.ts` — check/generate 门禁和工作区 warning 测试。
- Modify: `apps/cli/tests/serveApi.test.ts` — 保存拒绝 error、允许 warning、action 返回结构化诊断。
- Modify: `apps/web/src/actions.ts` — 接收可选 `diagnostics`。
- Modify: `apps/web/tests/actions.test.ts` — 诊断响应解析测试。

### Current configuration repair

- Modify: `config/routes.yaml` — 删除 URL node filter、改用 `.yaml` provider、补齐四个 classical provider source、修正 `google@cn`。
- Modify: `AGENTS.md` — 将已废弃的 `config/modules.yaml` 描述更新为 `config/routes.yaml`。

---

### Task 1: Add structured diagnostics and a reusable dependency graph

**Files:**

- Create: `packages/core/src/config/diagnostics.ts`
- Create: `packages/core/src/routing/dependencyGraph.ts`
- Create: `packages/core/tests/diagnostics.test.ts`
- Create: `packages/core/tests/dependencyGraph.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Produces: `DiagnosticSeverity = "error" | "warning" | "info"`.
- Produces: `Diagnostic` with `code`, `severity`, optional `path`, `message`, and optional `related`.
- Produces: `hasDiagnosticErrors(diagnostics): boolean`.
- Produces: `formatDiagnostic(diagnostic): string`.
- Produces: `ConfigDiagnosticError`, whose public `diagnostics` contains the blocking set.
- Produces: `DependencyGraph = Readonly<Record<string, readonly string[]>>`.
- Produces: `findDependencyCycles(graph): string[][]` with each logical cycle returned once.

- [ ] **Step 1: Write failing diagnostics tests**

Create `packages/core/tests/diagnostics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ConfigDiagnosticError,
  formatDiagnostic,
  hasDiagnosticErrors,
  type Diagnostic,
} from "../src/index.js";

const diagnostics: Diagnostic[] = [
  {
    code: "provider.empty",
    severity: "warning",
    path: "ruleProviders[0].sources",
    message: "规则源待补全",
  },
  {
    code: "route.policy.missing",
    severity: "error",
    path: "ruleSets[1].policy",
    message: "目标策略组不存在",
    related: ["missing-group"],
  },
];

describe("diagnostics", () => {
  it("treats only error severity as blocking", () => {
    expect(hasDiagnosticErrors(diagnostics.slice(0, 1))).toBe(false);
    expect(hasDiagnosticErrors(diagnostics)).toBe(true);
  });

  it("formats a stable path-aware message", () => {
    expect(formatDiagnostic(diagnostics[1]!)).toBe(
      "[route.policy.missing] ruleSets[1].policy: 目标策略组不存在",
    );
  });

  it("keeps diagnostics on the blocking error", () => {
    const error = new ConfigDiagnosticError(diagnostics);
    expect(error.message).toContain("目标策略组不存在");
    expect(error.diagnostics).toEqual([diagnostics[1]]);
  });
});
```

- [ ] **Step 2: Write failing dependency graph tests**

Create `packages/core/tests/dependencyGraph.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findDependencyCycles, type DependencyGraph } from "../src/index.js";

describe("findDependencyCycles", () => {
  it("returns one canonical cycle for repeated traversal paths", () => {
    const graph: DependencyGraph = {
      a: ["b"],
      b: ["c"],
      c: ["a"],
      d: ["b"],
    };

    expect(findDependencyCycles(graph)).toEqual([["a", "b", "c"]]);
  });

  it("ignores edges to external nodes and returns an empty array for a DAG", () => {
    expect(findDependencyCycles({ a: ["b", "DIRECT"], b: [] })).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the new tests and verify RED**

Run:

```powershell
pnpm exec vitest run packages/core/tests/diagnostics.test.ts packages/core/tests/dependencyGraph.test.ts
```

Expected: FAIL because the new exports do not exist.

- [ ] **Step 4: Implement diagnostics**

Create `packages/core/src/config/diagnostics.ts`:

```ts
export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  path?: string;
  message: string;
  related?: string[];
}

export function hasDiagnosticErrors(
  diagnostics: readonly Diagnostic[],
): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const location = diagnostic.path ? ` ${diagnostic.path}:` : ":";
  return `[${diagnostic.code}]${location} ${diagnostic.message}`;
}

export class ConfigDiagnosticError extends Error {
  readonly diagnostics: Diagnostic[];

  constructor(diagnostics: readonly Diagnostic[]) {
    const blocking = diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    );
    super(blocking.map(formatDiagnostic).join("\n") || "配置校验失败");
    this.name = "ConfigDiagnosticError";
    this.diagnostics = blocking;
  }
}
```

- [ ] **Step 5: Implement canonical cycle detection**

Create `packages/core/src/routing/dependencyGraph.ts`:

```ts
export type DependencyGraph = Readonly<Record<string, readonly string[]>>;

function canonicalCycle(cycle: readonly string[]): string[] {
  const rotations = cycle.map((_node, index) => [
    ...cycle.slice(index),
    ...cycle.slice(0, index),
  ]);
  rotations.sort((left, right) => left.join("\u0000").localeCompare(right.join("\u0000")));
  return rotations[0] ?? [];
}

export function findDependencyCycles(graph: DependencyGraph): string[][] {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const found = new Map<string, string[]>();

  function visit(node: string): void {
    state.set(node, 1);
    stack.push(node);
    for (const child of graph[node] ?? []) {
      if (!(child in graph)) continue;
      const childState = state.get(child) ?? 0;
      if (childState === 0) {
        visit(child);
      } else if (childState === 1) {
        const start = stack.lastIndexOf(child);
        const cycle = canonicalCycle(stack.slice(start));
        found.set(cycle.join("\u0000"), cycle);
      }
    }
    stack.pop();
    state.set(node, 2);
  }

  for (const node of Object.keys(graph)) {
    if ((state.get(node) ?? 0) === 0) visit(node);
  }
  return [...found.values()].sort((left, right) =>
    left.join("\u0000").localeCompare(right.join("\u0000")),
  );
}
```

Export all public names from `packages/core/src/index.ts`.

- [ ] **Step 6: Run tests and typecheck for GREEN**

Run:

```powershell
pnpm exec vitest run packages/core/tests/diagnostics.test.ts packages/core/tests/dependencyGraph.test.ts
pnpm --filter @clash-route-kit/core typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add packages/core/src/config/diagnostics.ts packages/core/src/routing/dependencyGraph.ts packages/core/src/index.ts packages/core/tests/diagnostics.test.ts packages/core/tests/dependencyGraph.test.ts
git commit -m "feat: add structured config diagnostics"
```

### Task 2: Replace the shallow v1 assertion with a strict nested parser

**Files:**

- Create: `packages/core/src/config/valueReaders.ts`
- Create: `packages/core/src/config/legacyParser.ts`
- Modify: `packages/core/src/configDocument.ts:1-38`
- Modify: `packages/core/src/types.ts:118-137`
- Modify: `packages/core/tests/configDocument.test.ts`

**Interfaces:**

- Consumes: `Diagnostic` only for later semantic validation; parser failures remain thrown `Error` values with exact YAML paths.
- Produces: `parseLegacyProjectConfig(value: unknown): RouteKitProjectConfig`.
- Produces: `RuleProviderConfig.enabled?: boolean`, with missing treated as enabled by all consumers.
- Preserves: `parseRouteKitConfig(text): RouteKitProjectConfig` and `serializeRouteKitConfig(config): string`.

- [ ] **Step 1: Add failing nested-shape regression tests**

Extend `packages/core/tests/configDocument.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { parseRouteKitConfig } from "../src/index.js";

const base = `
publishBaseUrl: http://127.0.0.1:8787
template:
  output: Custom_Clash.ini
vendorRepos: []
customProxyGroups:
  - name: Proxy
    type: select
    options:
      - DIRECT
ruleSets:
  - id: final
    policy: Proxy
    source:
      type: final
ruleProviders: []
`;

it("rejects a numeric proxy group instead of trusting a TypeScript assertion", () => {
  expect(() => parseRouteKitConfig(base.replace(
    "  - name: Proxy\n    type: select\n    options:\n      - DIRECT",
    "  - 42",
  ))).toThrow("customProxyGroups[0]: expected object");
});

it("rejects a RuleSet with a missing policy", () => {
  expect(() => parseRouteKitConfig(base.replace("    policy: Proxy\n", ""))).toThrow(
    "ruleSets[0].policy: expected string",
  );
});

it("rejects an invalid nested vendor catalog kind", () => {
  const yaml = base.replace(
    "vendorRepos: []",
    `vendorRepos:
  - name: bad
    url: https://example.com/repo.git
    path: vendor/bad
    catalog:
      dir: vendor/bad/data
      kind: 123`,
  );
  expect(() => parseRouteKitConfig(yaml)).toThrow(
    "vendorRepos[0].catalog.kind: expected string",
  );
});

it("rejects unknown nested source fields", () => {
  const yaml = base.replace(
    "ruleProviders: []",
    `ruleProviders:
  - name: Custom
    output: Custom.yaml
    behavior: domain
    sources:
      - name: Local
        type: clash-list
        path: config/rules/Custom.list
        absolutePath: C:/secret`,
  );
  expect(() => parseRouteKitConfig(yaml)).toThrow(
    "ruleProviders[0].sources[0].absolutePath: unknown field",
  );
});
```

- [ ] **Step 2: Run the parser tests and verify RED**

Run:

```powershell
pnpm exec vitest run packages/core/tests/configDocument.test.ts
```

Expected: at least the numeric group and unknown nested field tests fail because the current parser checks only top-level arrays.

- [ ] **Step 3: Implement strict value readers**

Create `packages/core/src/config/valueReaders.ts`:

```ts
export type UnknownRecord = Record<string, unknown>;

export function readObject(value: unknown, path: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected object`);
  }
  return value as UnknownRecord;
}

export function readArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path}: expected array`);
  return value;
}

export function readString(value: unknown, path: string): string {
  if (typeof value !== "string") throw new Error(`${path}: expected string`);
  return value;
}

export function readOptionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : readString(value, path);
}

export function readOptionalBoolean(value: unknown, path: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${path}: expected boolean`);
  return value;
}

export function readOptionalNumber(
  value: unknown,
  path: string,
): number | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path}: expected number`);
  }
  return value;
}

export function readEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  path: string,
): T[number] {
  const text = readString(value, path);
  if (!allowed.includes(text)) {
    throw new Error(`${path}: expected one of ${allowed.join(", ")}`);
  }
  return text as T[number];
}

export function assertKnownKeys(
  value: UnknownRecord,
  allowed: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${path}.${key}: unknown field`);
  }
}
```

- [ ] **Step 4: Implement the v1 union parsers**

Create `packages/core/src/config/legacyParser.ts`. Use the readers above for every nested field. The RuleSet and provider-source discriminators must be implemented exactly as follows:

```ts
import type {
  CustomProxyGroup,
  RouteKitProjectConfig,
  RuleProviderConfig,
  RuleProviderSource,
  RuleSet,
  RuleSetSource,
  VendorRepoConfig,
} from "../types.js";
import {
  assertKnownKeys,
  readArray,
  readEnum,
  readObject,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
  readString,
} from "./valueReaders.js";

const GROUP_TYPES = ["select", "url-test", "fallback", "load-balance"] as const;
const BEHAVIORS = ["domain", "classical", "ipcidr"] as const;

function readStringArray(value: unknown, path: string): string[] {
  return readArray(value, path).map((item, index) =>
    readString(item, `${path}[${index}]`),
  );
}

function parseRuleSetSource(value: unknown, path: string): RuleSetSource {
  const source = readObject(value, path);
  const type = readEnum(
    source.type,
    ["rule-provider", "geosite", "geoip", "final"] as const,
    `${path}.type`,
  );
  if (type === "rule-provider") {
    assertKnownKeys(source, ["type", "behavior", "file", "interval"], path);
    return {
      type,
      behavior: readEnum(source.behavior, BEHAVIORS, `${path}.behavior`),
      file: readString(source.file, `${path}.file`),
      ...(source.interval === undefined
        ? {}
        : { interval: readOptionalNumber(source.interval, `${path}.interval`) as number }),
    };
  }
  if (type === "geosite") {
    assertKnownKeys(source, ["type", "value"], path);
    return { type, value: readString(source.value, `${path}.value`) };
  }
  if (type === "geoip") {
    assertKnownKeys(source, ["type", "value", "noResolve"], path);
    return {
      type,
      value: readString(source.value, `${path}.value`),
      ...(source.noResolve === undefined
        ? {}
        : { noResolve: readOptionalBoolean(source.noResolve, `${path}.noResolve`) }),
    };
  }
  assertKnownKeys(source, ["type"], path);
  return { type };
}

function parseProviderSource(value: unknown, path: string): RuleProviderSource {
  const source = readObject(value, path);
  const type = readEnum(
    source.type,
    ["clash-list", "clash-provider", "domain-list-community"] as const,
    `${path}.type`,
  );
  const common = {
    name: readString(source.name, `${path}.name`),
    ...(source.basePath === undefined
      ? {}
      : { basePath: readOptionalString(source.basePath, `${path}.basePath`) }),
  };
  if (type === "domain-list-community") {
    assertKnownKeys(source, ["name", "type", "entry", "basePath"], path);
    return { ...common, type, entry: readString(source.entry, `${path}.entry`) };
  }
  assertKnownKeys(source, ["name", "type", "path", "basePath"], path);
  return { ...common, type, path: readString(source.path, `${path}.path`) };
}
```

Complete the same file with the concrete entity parsers below. `requiredNumber` rejects `null`; only group `timeout` and `tolerance` use the nullable reader.

```ts
function readOptionalStringArray(value: unknown, path: string): string[] | undefined {
  return value === undefined ? undefined : readStringArray(value, path);
}

function requiredNumber(value: unknown, path: string): number | undefined {
  const parsed = readOptionalNumber(value, path);
  if (parsed === null) throw new Error(`${path}: expected number`);
  return parsed;
}

function parseTemplate(value: unknown, path: string): RouteKitProjectConfig["template"] {
  const template = readObject(value, path);
  assertKnownKeys(template, ["output", "enableRuleGenerator", "overwriteOriginalRules", "clashRuleBase"], path);
  return {
    output: readString(template.output, `${path}.output`),
    ...(template.enableRuleGenerator === undefined ? {} : {
      enableRuleGenerator: readOptionalBoolean(template.enableRuleGenerator, `${path}.enableRuleGenerator`),
    }),
    ...(template.overwriteOriginalRules === undefined ? {} : {
      overwriteOriginalRules: readOptionalBoolean(template.overwriteOriginalRules, `${path}.overwriteOriginalRules`),
    }),
    ...(template.clashRuleBase === undefined ? {} : {
      clashRuleBase: readOptionalString(template.clashRuleBase, `${path}.clashRuleBase`),
    }),
  };
}

function parseDefaults(value: unknown, path: string): RouteKitProjectConfig["defaults"] {
  if (value === undefined) return undefined;
  const defaults = readObject(value, path);
  assertKnownKeys(defaults, ["proxyGroups", "ruleSets"], path);
  const proxyGroups = defaults.proxyGroups === undefined
    ? undefined
    : readObject(defaults.proxyGroups, `${path}.proxyGroups`);
  const ruleSets = defaults.ruleSets === undefined
    ? undefined
    : readObject(defaults.ruleSets, `${path}.ruleSets`);
  if (proxyGroups) assertKnownKeys(proxyGroups, ["healthCheck", "urlTest"], `${path}.proxyGroups`);
  if (ruleSets) assertKnownKeys(ruleSets, ["ruleProviderInterval", "geoipNoResolve"], `${path}.ruleSets`);

  const healthCheck = proxyGroups?.healthCheck === undefined
    ? undefined
    : readObject(proxyGroups.healthCheck, `${path}.proxyGroups.healthCheck`);
  const urlTest = proxyGroups?.urlTest === undefined
    ? undefined
    : readObject(proxyGroups.urlTest, `${path}.proxyGroups.urlTest`);
  if (healthCheck) assertKnownKeys(healthCheck, ["url", "interval", "timeout"], `${path}.proxyGroups.healthCheck`);
  if (urlTest) assertKnownKeys(urlTest, ["tolerance"], `${path}.proxyGroups.urlTest`);

  return {
    ...(proxyGroups ? {
      proxyGroups: {
        ...(healthCheck ? {
          healthCheck: {
            ...(healthCheck.url === undefined ? {} : { url: readString(healthCheck.url, `${path}.proxyGroups.healthCheck.url`) }),
            ...(healthCheck.interval === undefined ? {} : { interval: requiredNumber(healthCheck.interval, `${path}.proxyGroups.healthCheck.interval`) }),
            ...(healthCheck.timeout === undefined ? {} : { timeout: requiredNumber(healthCheck.timeout, `${path}.proxyGroups.healthCheck.timeout`) }),
          },
        } : {}),
        ...(urlTest ? {
          urlTest: {
            ...(urlTest.tolerance === undefined ? {} : { tolerance: requiredNumber(urlTest.tolerance, `${path}.proxyGroups.urlTest.tolerance`) }),
          },
        } : {}),
      },
    } : {}),
    ...(ruleSets ? {
      ruleSets: {
        ...(ruleSets.ruleProviderInterval === undefined ? {} : {
          ruleProviderInterval: requiredNumber(ruleSets.ruleProviderInterval, `${path}.ruleSets.ruleProviderInterval`),
        }),
        ...(ruleSets.geoipNoResolve === undefined ? {} : {
          geoipNoResolve: readOptionalBoolean(ruleSets.geoipNoResolve, `${path}.ruleSets.geoipNoResolve`),
        }),
      },
    } : {}),
  };
}

function parseCustomProxyGroup(value: unknown, path: string): CustomProxyGroup {
  const group = readObject(value, path);
  assertKnownKeys(group, ["name", "type", "options", "nodeFilters", "url", "interval", "timeout", "tolerance"], path);
  return {
    name: readString(group.name, `${path}.name`),
    type: readEnum(group.type, GROUP_TYPES, `${path}.type`),
    options: readStringArray(group.options, `${path}.options`),
    ...(group.nodeFilters === undefined ? {} : { nodeFilters: readStringArray(group.nodeFilters, `${path}.nodeFilters`) }),
    ...(group.url === undefined ? {} : { url: readOptionalString(group.url, `${path}.url`) }),
    ...(group.interval === undefined ? {} : { interval: requiredNumber(group.interval, `${path}.interval`) }),
    ...(group.timeout === undefined ? {} : { timeout: readOptionalNumber(group.timeout, `${path}.timeout`) }),
    ...(group.tolerance === undefined ? {} : { tolerance: readOptionalNumber(group.tolerance, `${path}.tolerance`) }),
  };
}

function parseRuleSet(value: unknown, path: string): RuleSet {
  const ruleSet = readObject(value, path);
  assertKnownKeys(ruleSet, ["id", "enabled", "section", "policy", "source"], path);
  return {
    id: readString(ruleSet.id, `${path}.id`),
    ...(ruleSet.enabled === undefined ? {} : { enabled: readOptionalBoolean(ruleSet.enabled, `${path}.enabled`) }),
    ...(ruleSet.section === undefined ? {} : { section: readOptionalString(ruleSet.section, `${path}.section`) }),
    policy: readString(ruleSet.policy, `${path}.policy`),
    source: parseRuleSetSource(ruleSet.source, `${path}.source`),
  };
}

function parseRuleProvider(value: unknown, path: string): RuleProviderConfig {
  const provider = readObject(value, path);
  assertKnownKeys(provider, ["name", "output", "behavior", "enabled", "exclude", "remove", "sources"], path);
  return {
    name: readString(provider.name, `${path}.name`),
    output: readString(provider.output, `${path}.output`),
    behavior: readEnum(provider.behavior, BEHAVIORS, `${path}.behavior`),
    ...(provider.enabled === undefined ? {} : { enabled: readOptionalBoolean(provider.enabled, `${path}.enabled`) }),
    ...(provider.exclude === undefined ? {} : { exclude: readStringArray(provider.exclude, `${path}.exclude`) }),
    ...(provider.remove === undefined ? {} : { remove: readStringArray(provider.remove, `${path}.remove`) }),
    sources: readArray(provider.sources, `${path}.sources`).map((item, index) =>
      parseProviderSource(item, `${path}.sources[${index}]`),
    ),
  };
}

function parseVendorRepo(value: unknown, path: string): VendorRepoConfig {
  const repo = readObject(value, path);
  assertKnownKeys(repo, ["name", "url", "path", "branch", "catalog", "templateDir"], path);
  const catalog = repo.catalog === undefined ? undefined : readObject(repo.catalog, `${path}.catalog`);
  if (catalog) assertKnownKeys(catalog, ["dir", "kind"], `${path}.catalog`);
  return {
    name: readString(repo.name, `${path}.name`),
    url: readString(repo.url, `${path}.url`),
    path: readString(repo.path, `${path}.path`),
    ...(repo.branch === undefined ? {} : { branch: readOptionalString(repo.branch, `${path}.branch`) }),
    ...(catalog ? {
      catalog: {
        dir: readString(catalog.dir, `${path}.catalog.dir`),
        kind: readEnum(catalog.kind, ["domain-list", "list-dir", "provider-yaml", "ini-template"] as const, `${path}.catalog.kind`),
      },
    } : {}),
    ...(repo.templateDir === undefined ? {} : { templateDir: readOptionalString(repo.templateDir, `${path}.templateDir`) }),
  };
}

export function parseLegacyProjectConfig(value: unknown): RouteKitProjectConfig {
  const project = readObject(value, "config");
  assertKnownKeys(project, [
    "publishBaseUrl", "subconverterUrl", "defaults", "template", "vendorRepos",
    "globalRemove", "customProxyGroups", "ruleSets", "ruleProviders",
  ], "config");
  return {
    publishBaseUrl: readString(project.publishBaseUrl, "publishBaseUrl"),
    ...(project.subconverterUrl === undefined ? {} : { subconverterUrl: readOptionalString(project.subconverterUrl, "subconverterUrl") }),
    ...(project.defaults === undefined ? {} : { defaults: parseDefaults(project.defaults, "defaults") }),
    template: parseTemplate(project.template, "template"),
    vendorRepos: readArray(project.vendorRepos ?? [], "vendorRepos").map((item, index) => parseVendorRepo(item, `vendorRepos[${index}]`)),
    ...(project.globalRemove === undefined ? {} : { globalRemove: readOptionalStringArray(project.globalRemove, "globalRemove") }),
    customProxyGroups: readArray(project.customProxyGroups, "customProxyGroups").map((item, index) => parseCustomProxyGroup(item, `customProxyGroups[${index}]`)),
    ruleSets: readArray(project.ruleSets, "ruleSets").map((item, index) => parseRuleSet(item, `ruleSets[${index}]`)),
    ruleProviders: readArray(project.ruleProviders ?? [], "ruleProviders").map((item, index) => parseRuleProvider(item, `ruleProviders[${index}]`)),
  };
}
```

Import `RouteKitProjectConfig`, `CustomProxyGroup`, `RuleSet`, `RuleProviderConfig`, and `VendorRepoConfig` in this file. Because `assertKnownKeys` owns the top-level allowlist, legacy `proxyGroups` and `modules` fail deterministically as unknown fields. Every returned collection and object is newly constructed.

- [ ] **Step 5: Wire the strict parser and provider enabled flag**

Modify `packages/core/src/configDocument.ts`:

```ts
import YAML from "yaml";
import { parseLegacyProjectConfig } from "./config/legacyParser.js";
import type { RouteKitProjectConfig } from "./types.js";

export function parseRouteKitConfig(text: string): RouteKitProjectConfig {
  return parseLegacyProjectConfig(YAML.parse(text) as unknown);
}

export function serializeRouteKitConfig(config: RouteKitProjectConfig): string {
  return YAML.stringify(config, { lineWidth: 0 }).replace(/\n?$/, "\n");
}
```

Add to `RuleProviderConfig` in `packages/core/src/types.ts`:

```ts
export interface RuleProviderConfig {
  name: string;
  output: string;
  behavior: ProviderBehavior;
  enabled?: boolean;
  exclude?: string[];
  remove?: string[];
  sources: RuleProviderSource[];
}
```

- [ ] **Step 6: Run parser tests and all Core tests**

Run:

```powershell
pnpm exec vitest run packages/core/tests/configDocument.test.ts
pnpm exec vitest run packages/core/tests
pnpm --filter @clash-route-kit/core typecheck
```

Expected: PASS. Existing minimal v1 fixtures remain accepted, while invalid nested fixtures fail at the exact path.

- [ ] **Step 7: Commit**

```powershell
git add packages/core/src/config packages/core/src/configDocument.ts packages/core/src/types.ts packages/core/tests/configDocument.test.ts
git commit -m "fix: strictly parse legacy route config"
```

### Task 3: Centralize all pure v1 semantic validation in Core

**Files:**

- Create: `packages/core/src/config/validateLegacy.ts`
- Create: `packages/core/tests/legacyValidation.test.ts`
- Modify: `packages/core/src/defaults.ts:90-187`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Consumes: `RouteKitProjectConfig`, `Diagnostic`, `findDependencyCycles`.
- Produces: `validateLegacyProjectConfig(config): Diagnostic[]` in deterministic config order.
- Produces: `createLegacyProxyGroupGraph(config.customProxyGroups): DependencyGraph` for Web summaries and v1 validation.
- Preserves: `validateDefaultAwareConfig(config): string[]` only as a deprecated compatibility wrapper until all callers move in Task 4/5.

- [ ] **Step 1: Write failing validation tests for references and cycles**

Create `packages/core/tests/legacyValidation.test.ts` with a helper and the first cases:

```ts
import { describe, expect, it } from "vitest";
import {
  validateLegacyProjectConfig,
  type RouteKitProjectConfig,
} from "../src/index.js";

function project(
  patch: Partial<RouteKitProjectConfig> = {},
): RouteKitProjectConfig {
  return {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    customProxyGroups: [
      { name: "Proxy", type: "select", options: ["DIRECT"] },
    ],
    ruleSets: [
      { id: "final", policy: "Proxy", source: { type: "final" } },
    ],
    ruleProviders: [],
    ...patch,
  };
}

describe("validateLegacyProjectConfig", () => {
  it("reports missing group references and group cycles with stable codes", () => {
    const diagnostics = validateLegacyProjectConfig(project({
      customProxyGroups: [
        { name: "A", type: "select", options: ["B"] },
        { name: "B", type: "select", options: ["A", "Missing"] },
      ],
      ruleSets: [
        { id: "missing-policy", policy: "Unknown", source: { type: "geosite", value: "openai" } },
        { id: "final", policy: "A", source: { type: "final" } },
      ],
    }));

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "group.member.missing", severity: "error", related: ["Missing"] }),
      expect.objectContaining({ code: "group.cycle", severity: "error", related: ["A", "B"] }),
      expect.objectContaining({ code: "route.policy.missing", severity: "error", related: ["Unknown"] }),
    ]));
  });
});
```

- [ ] **Step 2: Add provider, FINAL and node-filter regression tests**

Append to the same file:

```ts
it("blocks executable empty providers, mrs output, behavior mismatch and URL node filters", () => {
  const diagnostics = validateLegacyProjectConfig(project({
    customProxyGroups: [
      {
        name: "Proxy",
        type: "select",
        options: ["DIRECT"],
        nodeFilters: ["http://wifi.vivo.com.cn/generate_204"],
      },
    ],
    ruleSets: [
      {
        id: "custom",
        policy: "Proxy",
        source: {
          type: "rule-provider",
          behavior: "classical",
          file: "Custom.mrs",
        },
      },
      { id: "final-a", policy: "Proxy", source: { type: "final" } },
      { id: "final-b", policy: "DIRECT", source: { type: "final" } },
    ],
    ruleProviders: [
      {
        name: "Custom",
        output: "Custom.mrs",
        behavior: "domain",
        sources: [],
      },
    ],
  }));

  expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
    "group.node-filter.url",
    "provider.sources.empty",
    "provider.output.unsupported",
    "route.provider.behavior-mismatch",
    "route.final.multiple",
  ]));
});

it("keeps disabled unresolved imports as warnings and excludes disabled routes from FINAL counts", () => {
  const diagnostics = validateLegacyProjectConfig(project({
    ruleSets: [
      {
        id: "disabled-provider-route",
        enabled: false,
        policy: "Proxy",
        source: { type: "rule-provider", behavior: "domain", file: "Legacy.mrs" },
      },
      { id: "final", policy: "Proxy", source: { type: "final" } },
    ],
    ruleProviders: [
      {
        name: "Legacy",
        output: "Legacy.mrs",
        behavior: "domain",
        enabled: false,
        sources: [],
      },
    ],
  }));

  expect(diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
    "provider.sources.disabled-empty",
    "provider.output.disabled-unsupported",
  ]);
});

it("reports invalid regular expressions without throwing", () => {
  const diagnostics = validateLegacyProjectConfig(project({
    customProxyGroups: [
      { name: "Proxy", type: "select", options: [], nodeFilters: ["("] },
    ],
  }));
  expect(diagnostics).toContainEqual(expect.objectContaining({
    code: "group.node-filter.regex",
    severity: "error",
  }));
});
```

- [ ] **Step 3: Run the validator tests and verify RED**

Run:

```powershell
pnpm exec vitest run packages/core/tests/legacyValidation.test.ts
```

Expected: FAIL because `validateLegacyProjectConfig` does not exist.

- [ ] **Step 4: Implement graph creation and diagnostic helpers**

Start `packages/core/src/config/validateLegacy.ts` with:

```ts
import type { DependencyGraph } from "../routing/dependencyGraph.js";
import { findDependencyCycles } from "../routing/dependencyGraph.js";
import type {
  CustomProxyGroup,
  RouteKitProjectConfig,
  RuleProviderConfig,
  RuleProviderSource,
} from "../types.js";
import type { Diagnostic } from "./diagnostics.js";

const BUILTIN_POLICIES = new Set(["DIRECT", "REJECT"]);

export function createLegacyProxyGroupGraph(
  groups: readonly CustomProxyGroup[],
): DependencyGraph {
  const names = new Set(groups.map((group) => group.name));
  return Object.fromEntries(groups.map((group) => [
    group.name,
    group.options.filter((option) => names.has(option)),
  ]));
}

function addDuplicateDiagnostics(
  values: readonly string[],
  code: string,
  path: string,
  diagnostics: Diagnostic[],
): void {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) {
      diagnostics.push({
        code,
        severity: "error",
        path: `${path}[${index}]`,
        message: `重复值：${value}`,
        related: [value],
      });
    }
    seen.add(value);
  }
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function isValidRegExp(value: string): boolean {
  try {
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Implement provider and route semantics**

Complete `validateLegacyProjectConfig` with deterministic loops in this order: top-level/default fields, duplicate IDs/names/outputs, groups, cycles, providers, routes, FINAL. Provider checks must use the following enabled rule and codes:

```ts
function providerEnabled(provider: RuleProviderConfig): boolean {
  return provider.enabled !== false;
}

function validateProviderSource(
  provider: RuleProviderConfig,
  source: RuleProviderSource,
  providerIndex: number,
  sourceIndex: number,
  diagnostics: Diagnostic[],
): void {
  const base = `ruleProviders[${providerIndex}].sources[${sourceIndex}]`;
  if (!source.name.trim()) {
    diagnostics.push({
      code: "provider.source.name-empty",
      severity: "error",
      path: `${base}.name`,
      message: `Rule provider ${provider.name} 的 source 名称不能为空`,
    });
  }
  const pathValue = source.type === "domain-list-community" ? source.entry : source.path;
  if (!pathValue.trim()) {
    diagnostics.push({
      code: "provider.source.value-empty",
      severity: "error",
      path: source.type === "domain-list-community" ? `${base}.entry` : `${base}.path`,
      message: `Rule provider ${provider.name} 的 source 值不能为空`,
    });
  }
  for (const [key, value] of [["basePath", source.basePath], ["value", pathValue]] as const) {
    if (!value) continue;
    const normalized = value.replace(/\\/g, "/");
    if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").includes("..")) {
      diagnostics.push({
        code: "provider.source.path-unsafe",
        severity: "error",
        path: `${base}.${key}`,
        message: "source 路径必须是项目内安全相对路径",
      });
    }
  }
}
```

For each provider:

```ts
const enabled = providerEnabled(provider);
if (provider.sources.length === 0) {
  diagnostics.push({
    code: enabled ? "provider.sources.empty" : "provider.sources.disabled-empty",
    severity: enabled ? "error" : "warning",
    path: `ruleProviders[${index}].sources`,
    message: enabled
      ? `启用的规则源 ${provider.name} 至少需要一个数据源`
      : `禁用的规则源 ${provider.name} 尚未指定数据源`,
  });
}
if (!/\.yaml$/i.test(provider.output)) {
  diagnostics.push({
    code: enabled ? "provider.output.unsupported" : "provider.output.disabled-unsupported",
    severity: enabled ? "error" : "warning",
    path: `ruleProviders[${index}].output`,
    message: `当前只支持 .yaml provider 输出：${provider.output}`,
  });
}
```

For each enabled RuleSet provider source, resolve by `provider.output`; report `route.provider.missing`, `route.provider.disabled`, or `route.provider.behavior-mismatch`. Count only enabled FINAL rules. For every group option that is neither a group name nor `DIRECT`/`REJECT`, report `group.member.missing`. For every cycle returned by `findDependencyCycles`, report `group.cycle` once with `related: cycle`.

Use one deterministic internal diagnostic helper in `packages/core/src/defaults.ts`; do not construct a partial project and do not filter unrelated validator output:

```ts
import type { Diagnostic } from "./config/diagnostics.js";

function pushInvalid(
  diagnostics: Diagnostic[],
  code: string,
  path: string,
  message: string,
  invalid: boolean,
): void {
  if (invalid) diagnostics.push({ code, severity: "error", path, message });
}

export function appendDefaultValueDiagnostics(
  config: RouteKitConfig,
  diagnostics: Diagnostic[],
): void {
  const health = config.defaults?.proxyGroups?.healthCheck;
  pushInvalid(diagnostics, "defaults.health-check.url", "defaults.proxyGroups.healthCheck.url", "健康检查 URL 必须是 HTTP/HTTPS URL", health?.url !== undefined && !isHttpUrl(health.url));
  pushInvalid(diagnostics, "defaults.health-check.interval", "defaults.proxyGroups.healthCheck.interval", "健康检查 interval 必须为正整数", health?.interval !== undefined && !isPositiveInteger(health.interval));
  pushInvalid(diagnostics, "defaults.health-check.timeout", "defaults.proxyGroups.healthCheck.timeout", "健康检查 timeout 必须为正整数", health?.timeout !== undefined && !isPositiveInteger(health.timeout));
  const defaultTolerance = config.defaults?.proxyGroups?.urlTest?.tolerance;
  pushInvalid(diagnostics, "defaults.url-test.tolerance", "defaults.proxyGroups.urlTest.tolerance", "url-test tolerance 必须为非负整数", defaultTolerance !== undefined && !isNonNegativeInteger(defaultTolerance));
  const defaultInterval = config.defaults?.ruleSets?.ruleProviderInterval;
  pushInvalid(diagnostics, "defaults.route.interval", "defaults.ruleSets.ruleProviderInterval", "RuleSet interval 必须为正整数", defaultInterval !== undefined && !isPositiveInteger(defaultInterval));

  for (const [index, group] of config.customProxyGroups.entries()) {
    const base = `customProxyGroups[${index}]`;
    pushInvalid(diagnostics, "group.health-check.url", `${base}.url`, `策略组 ${group.name} 的 URL 必须是 HTTP/HTTPS URL`, group.url !== undefined && !isHttpUrl(group.url));
    pushInvalid(diagnostics, "group.health-check.interval", `${base}.interval`, `策略组 ${group.name} 的 interval 必须为正整数`, group.interval !== undefined && !isPositiveInteger(group.interval));
    pushInvalid(diagnostics, "group.health-check.timeout", `${base}.timeout`, `策略组 ${group.name} 的 timeout 必须为正整数`, group.timeout !== undefined && group.timeout !== null && !isPositiveInteger(group.timeout));
    pushInvalid(diagnostics, "group.health-check.tolerance", `${base}.tolerance`, `策略组 ${group.name} 的 tolerance 必须为非负整数`, group.tolerance !== undefined && group.tolerance !== null && !isNonNegativeInteger(group.tolerance));
  }
  for (const [index, ruleSet] of config.ruleSets.entries()) {
    if (ruleSet.source.type !== "rule-provider") continue;
    pushInvalid(diagnostics, "route.interval", `ruleSets[${index}].source.interval`, `RuleSet ${ruleSet.id} 的 interval 必须为正整数`, ruleSet.source.interval !== undefined && !isPositiveInteger(ruleSet.source.interval));
  }
}

/** @deprecated Use validateLegacyProjectConfig. */
export function validateDefaultAwareConfig(config: RouteKitConfig): string[] {
  const diagnostics: Diagnostic[] = [];
  appendDefaultValueDiagnostics(config, diagnostics);
  return diagnostics.map((diagnostic) => diagnostic.message);
}
```

Call `appendDefaultValueDiagnostics(config, diagnostics)` as the first statement in `validateLegacyProjectConfig`. Keep the helper module-internal by not exporting it from `packages/core/src/index.ts`.

- [ ] **Step 6: Export and run Core GREEN tests**

Export `validateLegacyProjectConfig` and `createLegacyProxyGroupGraph` from `packages/core/src/index.ts`, then run:

```powershell
pnpm exec vitest run packages/core/tests/legacyValidation.test.ts packages/core/tests/defaults.test.ts
pnpm exec vitest run packages/core/tests
pnpm --filter @clash-route-kit/core typecheck
```

Expected: PASS; the old default-resolution behavior remains unchanged.

- [ ] **Step 7: Commit**

```powershell
git add packages/core/src/config/validateLegacy.ts packages/core/src/defaults.ts packages/core/src/index.ts packages/core/tests/legacyValidation.test.ts packages/core/tests/defaults.test.ts
git commit -m "feat: unify legacy config validation"
```

### Task 4: Make Web save readiness consume Core diagnostics

**Files:**

- Delete: `apps/web/src/draftValidation.ts`
- Delete: `apps/web/tests/draftValidation.test.ts`
- Modify: `apps/web/src/projectController.ts:1-212`
- Modify: `apps/web/tests/projectController.test.ts`
- Modify: `apps/web/src/proxyGroups.ts:1-120`
- Modify: `apps/web/tests/proxyGroups.test.ts`
- Modify: `apps/web/src/configMutations.ts:316-350`
- Modify: `apps/web/tests/configMutations.test.ts`
- Modify: `apps/web/src/components/ProviderRecipeEditor.tsx`
- Modify: `apps/web/tests/providerRecipeEditor.test.tsx`

**Interfaces:**

- Consumes: `validateLegacyProjectConfig`, `Diagnostic`.
- Produces: `SaveReadiness = { ok: true; warnings: Diagnostic[] } | { ok: false; reason: string; diagnostics: Diagnostic[]; warnings: Diagnostic[] }`.
- Produces: newly created/imported placeholder providers with `enabled: false`.
- Produces: `ProviderRecipeEditor` `onUpdate({ enabled })` behavior.

- [ ] **Step 1: Rewrite save-readiness tests around structured diagnostics**

Update the invalid-reference and placeholder cases in `apps/web/tests/projectController.test.ts`:

```ts
it("blocks save with the first Core error and keeps all diagnostics", () => {
  const config = createConfig();
  const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });
  const dirty = applyDraftConfig(controller, {
    ...config,
    ruleSets: [
      { id: "ai", policy: "Missing", source: { type: "geosite", value: "openai" } },
      { id: "final", policy: "Proxy", source: { type: "final" } },
    ],
  });

  const readiness = canSaveProject(dirty);
  expect(readiness.ok).toBe(false);
  if (readiness.ok) throw new Error("expected blocked save");
  expect(readiness.reason).toBe("RuleSet ai 引用了不存在的 custom_proxy_group：Missing");
  expect(readiness.diagnostics).toContainEqual(expect.objectContaining({
    code: "route.policy.missing",
    severity: "error",
  }));
});

it("allows disabled imported provider placeholders as warnings", () => {
  const config = createConfig();
  const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });
  const dirty = applyDraftConfig(controller, {
    ...config,
    ruleSets: [
      {
        id: "legacy-provider",
        enabled: false,
        policy: "Proxy",
        source: { type: "rule-provider", behavior: "domain", file: "Legacy.mrs" },
      },
      { id: "final", policy: "Proxy", source: { type: "final" } },
    ],
    ruleProviders: [
      { name: "Legacy", output: "Legacy.mrs", behavior: "domain", enabled: false, sources: [] },
    ],
  });

  const readiness = canSaveProject(dirty);
  expect(readiness.ok).toBe(true);
  if (!readiness.ok) throw new Error(readiness.reason);
  expect(readiness.warnings.map((diagnostic) => diagnostic.code)).toEqual([
    "provider.sources.disabled-empty",
    "provider.output.disabled-unsupported",
  ]);
});
```

- [ ] **Step 2: Add placeholder and provider toggle tests**

Add to `apps/web/tests/configMutations.test.ts`:

```ts
it("creates provider placeholders and their unresolved routes as disabled drafts", () => {
  const imported = {
    customProxyGroups: [],
    ruleSets: [
      {
        id: "legacy",
        policy: "Proxy",
        source: { type: "rule-provider" as const, behavior: "domain" as const, file: "Legacy.mrs" },
      },
    ],
    warnings: [],
  };

  const next = mergeImportedConfig(baseConfig, imported);
  expect(next.ruleProviders).toContainEqual(expect.objectContaining({
    output: "Legacy.mrs",
    enabled: false,
    sources: [],
  }));
  expect(next.ruleSets.find((ruleSet) => ruleSet.source.type === "rule-provider")).toMatchObject({
    enabled: false,
  });
});
```

Add to `apps/web/tests/providerRecipeEditor.test.tsx`:

```tsx
it("exposes the provider enabled state", () => {
  const onUpdate = vi.fn();
  render(
    <AppProviders>
      <ProviderRecipeEditor
        provider={{
          name: "Draft",
          output: "Draft.yaml",
          behavior: "domain",
          enabled: false,
          sources: [],
        }}
        onUpdate={onUpdate}
        onSetSources={() => {}}
        onSetListField={() => {}}
        onDelete={() => {}}
        fetcher={vi.fn()}
      />
    </AppProviders>,
  );
  fireEvent.click(screen.getByRole("switch", { name: "启用规则源" }));
  expect(onUpdate).toHaveBeenCalledWith({ enabled: true });
});
```

- [ ] **Step 3: Run Web tests and verify RED**

Run:

```powershell
pnpm exec vitest run apps/web/tests/projectController.test.ts apps/web/tests/configMutations.test.ts apps/web/tests/providerRecipeEditor.test.tsx
```

Expected: FAIL because save readiness still returns string warnings and placeholders default to enabled.

- [ ] **Step 4: Replace Web validation imports and types**

At the top of `apps/web/src/projectController.ts` import:

```ts
import {
  serializeRouteKitConfig,
  validateLegacyProjectConfig,
  type Diagnostic,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";
```

Define and use:

```ts
export type SaveReadiness =
  | { ok: true; warnings: Diagnostic[] }
  | {
      ok: false;
      reason: string;
      diagnostics: Diagnostic[];
      warnings: Diagnostic[];
    };

function projectDiagnostics(config: RouteKitProjectConfig): Diagnostic[] {
  return validateLegacyProjectConfig(config);
}

export function canSaveProject(state: ProjectControllerState): SaveReadiness {
  const diagnostics = projectDiagnostics(state.draftConfig);
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning");
  if (!state.dirty) {
    return {
      ok: false,
      reason: "没有未保存的修改",
      diagnostics,
      warnings,
    };
  }
  const error = diagnostics.find((diagnostic) => diagnostic.severity === "error");
  if (error) {
    return { ok: false, reason: error.message, diagnostics, warnings };
  }
  return { ok: true, warnings };
}
```

Update `markProjectSaved` to count warning diagnostics and remove every import of `./draftValidation.js`. Delete the old source/test files.

- [ ] **Step 5: Move cycle consumers and disable unresolved imports**

Remove `detectProxyGroupCycles` and `groupsInCycles` from `apps/web/src/proxyGroups.ts`. Any component still needing cycles must import `createLegacyProxyGroupGraph` and `findDependencyCycles` from Core.

In `apps/web/src/configMutations.ts`, make empty new providers disabled:

```ts
placeholders.push({
  name,
  output,
  behavior: source.behavior,
  enabled: false,
  sources: [],
});

export function createRuleProvider(config: RouteKitProjectConfig): RuleProviderConfig {
  const name = nextName((config.ruleProviders ?? []).map((provider) => provider.name), "Provider");
  return {
    name,
    output: `${name}_Domain.yaml`,
    behavior: "domain",
    enabled: false,
    sources: [],
  };
}
```

When imported RuleSets reference an output created as a disabled placeholder, copy that RuleSet with `enabled: false`. Do not disable RuleSets whose provider output already resolves to an enabled provider.

- [ ] **Step 6: Add the provider enabled control**

Add `Switch` and `Alert` imports to `ProviderRecipeEditor.tsx`, then render before the output field:

```tsx
<div>
  <div className="rk-field-label">执行状态</div>
  <Space>
    <Switch
      aria-label="启用规则源"
      checked={props.provider.enabled !== false}
      onChange={(enabled) => props.onUpdate({ enabled })}
    />
    <span className="rk-lib-meta">
      {props.provider.enabled === false ? "禁用草稿，不参与生成" : "启用并参与生成"}
    </span>
  </Space>
</div>
{props.provider.enabled !== false && props.provider.sources.length === 0 ? (
  <Alert type="error" showIcon message="启用前至少添加一个数据源" />
) : null}
```

- [ ] **Step 7: Run Web GREEN tests and typecheck**

Run:

```powershell
pnpm exec vitest run apps/web/tests/projectController.test.ts apps/web/tests/configMutations.test.ts apps/web/tests/providerRecipeEditor.test.tsx apps/web/tests/proxyGroups.test.ts
pnpm --filter @clash-route-kit/web typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add apps/web/src/projectController.ts apps/web/src/proxyGroups.ts apps/web/src/configMutations.ts apps/web/src/components/ProviderRecipeEditor.tsx apps/web/src/draftValidation.ts apps/web/tests/projectController.test.ts apps/web/tests/proxyGroups.test.ts apps/web/tests/configMutations.test.ts apps/web/tests/providerRecipeEditor.test.tsx apps/web/tests/draftValidation.test.ts
git commit -m "refactor: share config diagnostics with web"
```

Before committing, inspect `git diff --cached --stat` and ensure no unrelated Web edits are staged.

### Task 5: Apply the same diagnostics to CLI, generation and local API

**Files:**

- Create: `apps/cli/src/workspaceValidation.ts`
- Create: `apps/cli/tests/workspaceValidation.test.ts`
- Modify: `apps/cli/src/program.ts:1-526`
- Modify: `apps/cli/src/index.ts:1-122`
- Modify: `apps/cli/src/serveApi.ts:1-1145`
- Modify: `apps/cli/tests/cli.test.ts`
- Modify: `apps/cli/tests/serveApi.test.ts`
- Modify: `apps/web/src/actions.ts`
- Modify: `apps/web/tests/actions.test.ts`

**Interfaces:**

- Consumes: `parseRouteKitConfig`, `validateLegacyProjectConfig`, `hasDiagnosticErrors`, `ConfigDiagnosticError`.
- Produces: `validateLegacyWorkspace(options, config): Promise<Diagnostic[]>`.
- Changes: `checkConfig(options): Promise<Diagnostic[]>`.
- Changes: local action responses may include `diagnostics?: Diagnostic[]`.
- Guarantees: `generateOutputs` performs validation before the first `mkdir`/`writeFile`.

- [ ] **Step 1: Write workspace validation tests**

Create `apps/cli/tests/workspaceValidation.test.ts`:

```ts
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { validateLegacyWorkspace } from "../src/workspaceValidation.js";

function config(values: string[]): RouteKitProjectConfig {
  return {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
    ruleSets: [
      ...values.map((value) => ({
        id: value,
        policy: "Proxy",
        source: { type: "geosite" as const, value },
      })),
      { id: "final", policy: "Proxy", source: { type: "final" as const } },
    ],
    ruleProviders: [],
  };
}

it("accepts tag@attribute when the base GEOSITE file exists", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
  const data = path.join(root, "vendor/domain-list-community/data");
  await mkdir(data, { recursive: true });
  await writeFile(path.join(data, "google"), "google.cn @cn\n", "utf8");
  await writeFile(path.join(data, "category-games"), "include:category-games-cn\n", "utf8");

  await expect(validateLegacyWorkspace(
    { root, configFile: "config/routes.yaml" },
    config(["google@cn", "category-games@cn"]),
  )).resolves.toEqual([]);
});

it("reports a missing non-authoritative GEOSITE entry as a warning", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
  const data = path.join(root, "vendor/domain-list-community/data");
  await mkdir(data, { recursive: true });
  const diagnostics = await validateLegacyWorkspace(
    { root, configFile: "config/routes.yaml" },
    config(["gfw"]),
  );
  expect(diagnostics).toEqual([
    expect.objectContaining({
      code: "workspace.geosite.missing",
      severity: "warning",
      related: ["gfw"],
    }),
  ]);
});
```

- [ ] **Step 2: Add CLI and generation gate tests**

Update `apps/cli/tests/cli.test.ts` with:

```ts
it("returns warnings without failing check semantics", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
  await writeFile(path.join(root, "routes.yaml"), sampleConfig.replace("value: github", "value: missing-catalog"), "utf8");
  await mkdir(path.join(root, "vendor/domain-list-community/data"), { recursive: true });

  const diagnostics = await checkConfig({ root, configFile: "routes.yaml" });
  expect(diagnostics).toContainEqual(expect.objectContaining({
    code: "workspace.geosite.missing",
    severity: "warning",
  }));
  expect(diagnostics.some((diagnostic) => diagnostic.severity === "error")).toBe(false);
});

it("stops generation before writing output when Core validation has errors", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
  await writeFile(
    path.join(root, "routes.yaml"),
    sampleConfig.replace("nodeFilters:\n      - .*", "nodeFilters:\n      - https://probe.example/204"),
    "utf8",
  );

  await expect(generateOutputs({ root, configFile: "routes.yaml" })).rejects.toMatchObject({
    name: "ConfigDiagnosticError",
  });
  await expect(access(path.join(root, "output"))).rejects.toThrow();
});
```

Change the existing filesystem import at the top of `apps/cli/tests/cli.test.ts` to:

```ts
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
```

No direct `Diagnostic` import is required because the assertions use `expect.objectContaining` against the inferred `checkConfig` result.

- [ ] **Step 3: Add local API save/action tests**

Extend `apps/cli/tests/serveApi.test.ts`:

```ts
it("rejects project saves with Core errors before writing", async () => {
  const writes: string[] = [];
  await expect(writeProjectConfigFile({
    root: "E:/repo",
    configFile: "config/routes.yaml",
    config: projectConfig({
      customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
      ruleSets: [{ id: "bad", policy: "Missing", source: { type: "final" } }],
    }),
    writeText: async (filePath) => { writes.push(filePath); },
  })).rejects.toMatchObject({ name: "ConfigDiagnosticError" });
  expect(writes).toEqual([]);
});

it("returns structured diagnostics from check actions", async () => {
  const diagnostic = {
    code: "workspace.geosite.missing",
    severity: "warning" as const,
    message: "Catalog 中未找到 gfw",
  };
  const result = await runRouteKitAction("check", {
    root: "E:/repo",
    configFile: "config/routes.yaml",
    checkConfig: async () => [diagnostic],
  });
  expect(result).toMatchObject({ ok: true, diagnostics: [diagnostic] });
});
```

- [ ] **Step 4: Run integration tests and verify RED**

Run:

```powershell
pnpm exec vitest run apps/cli/tests/workspaceValidation.test.ts apps/cli/tests/cli.test.ts apps/cli/tests/serveApi.test.ts apps/web/tests/actions.test.ts
```

Expected: FAIL because `checkConfig` still returns strings, readConfig bypasses the strict parser, and actions do not carry diagnostics.

- [ ] **Step 5: Implement workspace diagnostics**

Create `apps/cli/src/workspaceValidation.ts`:

```ts
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import type {
  Diagnostic,
  RouteKitProjectConfig,
  RuleProviderSource,
} from "@clash-route-kit/core";
import type { ProgramOptions } from "./program.js";

function sourcePath(root: string, source: RuleProviderSource): string | undefined {
  if (source.type === "domain-list-community") {
    return path.resolve(root, source.basePath ?? "vendor/domain-list-community/data", source.entry);
  }
  return path.resolve(root, source.basePath ?? ".", source.path);
}

export async function validateLegacyWorkspace(
  options: ProgramOptions,
  config: RouteKitProjectConfig,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const dataPath = path.join(options.root, "vendor/domain-list-community/data");
  let tags: Set<string> | undefined;
  try {
    tags = new Set((await readdir(dataPath, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name));
  } catch {
    tags = undefined;
  }

  for (const [index, ruleSet] of config.ruleSets.entries()) {
    if (ruleSet.enabled === false || ruleSet.source.type !== "geosite" || !tags) continue;
    const baseTag = ruleSet.source.value.split("@", 1)[0] ?? ruleSet.source.value;
    if (!tags.has(baseTag)) {
      diagnostics.push({
        code: "workspace.geosite.missing",
        severity: "warning",
        path: `ruleSets[${index}].source.value`,
        message: `本地 GEOSITE Catalog 中未找到：${ruleSet.source.value}`,
        related: [ruleSet.source.value],
      });
    }
  }

  for (const [providerIndex, provider] of (config.ruleProviders ?? []).entries()) {
    if (provider.enabled === false) continue;
    for (const [sourceIndex, source] of provider.sources.entries()) {
      const filePath = sourcePath(options.root, source);
      if (!filePath) continue;
      try {
        await access(filePath);
      } catch {
        diagnostics.push({
          code: "workspace.provider-source.missing",
          severity: "error",
          path: `ruleProviders[${providerIndex}].sources[${sourceIndex}]`,
          message: `规则源文件不存在：${path.relative(options.root, filePath)}`,
        });
      }
    }
  }
  return diagnostics;
}
```

Use `value.split("@")[0]` rather than `split("@", 1)` if the runtime behavior of the latter is unclear; the expected base for `google@cn` is exactly `google`.

- [ ] **Step 6: Unify CLI read/check/generate behavior**

In `apps/cli/src/program.ts`:

- remove the `yaml` import used by `readConfig`;
- import `parseRouteKitConfig`, `validateLegacyProjectConfig`, `hasDiagnosticErrors`, and `ConfigDiagnosticError`;
- implement `readConfig` with `parseRouteKitConfig(text)` before applying the environment runtime URL;
- make `checkConfig` return the concatenation of Core and workspace diagnostics;
- make `generateOutputs` call the same validation before the first output directory operation;
- filter `config.ruleProviders ?? []` with `provider.enabled !== false` in the generation loop.

The preflight must be:

```ts
async function projectDiagnostics(
  options: ProgramOptions,
  config: RouteKitProjectConfig,
): Promise<Diagnostic[]> {
  return [
    ...validateLegacyProjectConfig(config),
    ...await validateLegacyWorkspace(options, config),
  ];
}

function assertNoErrors(diagnostics: readonly Diagnostic[]): void {
  if (hasDiagnosticErrors(diagnostics)) {
    throw new ConfigDiagnosticError(diagnostics);
  }
}
```

Call `assertNoErrors(await projectDiagnostics(options, config))` before line 322's first `path.join`/`mkdir` output sequence.

In `apps/cli/src/index.ts`, print all diagnostics with `formatDiagnostic`; use `hasDiagnosticErrors` to set `process.exitCode = 1`. Warnings must use `console.warn`, errors `console.error`, and an empty list prints `[check] ok`.

- [ ] **Step 7: Unify save and action responses**

In `apps/cli/src/serveApi.ts`, validate `options.config` before serialization/writing:

```ts
const diagnostics = validateLegacyProjectConfig(options.config);
if (hasDiagnosticErrors(diagnostics)) {
  throw new ConfigDiagnosticError(diagnostics);
}
```

Change action result types to:

```ts
export interface RouteKitActionResult {
  action: RouteKitAction;
  ok: boolean;
  output: string;
  diagnostics?: Diagnostic[];
}
```

For `check`, `ok` is `!hasDiagnosticErrors(diagnostics)`, not `diagnostics.length === 0`.

Update `apps/web/src/actions.ts`:

```ts
import type { Diagnostic } from "@clash-route-kit/core";

export interface LocalActionResponse {
  action: LocalRouteKitAction;
  ok: boolean;
  output: string;
  diagnostics?: Diagnostic[];
}
```

The response guard must accept an omitted array and reject a non-array `diagnostics` field.

- [ ] **Step 8: Run CLI/API/Web GREEN tests**

Run:

```powershell
pnpm exec vitest run apps/cli/tests/workspaceValidation.test.ts apps/cli/tests/cli.test.ts apps/cli/tests/serveApi.test.ts apps/web/tests/actions.test.ts
pnpm --filter @clash-route-kit/cli typecheck
pnpm --filter @clash-route-kit/web typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add apps/cli/src apps/cli/tests apps/web/src/actions.ts apps/web/tests/actions.test.ts
git commit -m "feat: enforce shared config health gates"
```

### Task 6: Repair the current v1 project config against the new gates

**Files:**

- Modify: `config/routes.yaml:960-1019`
- Modify: `config/routes.yaml:1412-1435`
- Modify: `AGENTS.md:9-16`

**Interfaces:**

- Consumes: the exact provider outputs and validation behavior established in Tasks 3–5.
- Produces: a current v1 config with only `.yaml` executable outputs, no enabled empty provider and no URL node filter.
- Preserves: all user-added strategy groups, route order, names, sections and unrelated provider recipes.

- [ ] **Step 1: Capture and inspect the exact pre-edit config diff**

Run:

```powershell
git status --short
git diff -- config/routes.yaml
```

Expected: any existing user edits are visible. Do not replace the whole file and do not normalize YAML formatting.

- [ ] **Step 2: Write a regression test for the repository config**

Add to `apps/cli/tests/cli.test.ts` a repository-level test that reads the checked-in path only when run from the repository root:

```ts
it("keeps the repository route config free of executable provider placeholders", async () => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const config = await readConfig({ root, configFile: "config/routes.yaml" });
  const diagnostics = validateLegacyProjectConfig(config);
  expect(diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
});
```

If `import.meta.dirname` is unavailable under the current TypeScript target, derive the directory with `fileURLToPath(new URL(".", import.meta.url))`.

- [ ] **Step 3: Run the repository-config test and verify RED**

Run:

```powershell
pnpm exec vitest run apps/cli/tests/cli.test.ts -t "repository route config"
```

Expected: FAIL with codes including `group.node-filter.url`, `provider.sources.empty`, or `provider.output.unsupported`.

- [ ] **Step 4: Apply only the known route and provider fixes**

Use `apply_patch` to make these exact semantic changes in `config/routes.yaml`:

1. Under `🎯 全球直连`, delete the entire `nodeFilters` block containing `http://wifi.vivo.com.cn/generate_204`.
2. Change RuleSet `Custom_Direct_Domain.source.file` from `Custom_Direct_Domain.mrs` to `Custom_Direct_Domain.yaml`.
3. Change RuleSet `Custom_Proxy_Domain.source.file` from `Custom_Proxy_Domain.mrs` to `Custom_Proxy_Domain.yaml`.
4. Change `google-cn.source.value` from `google-cn` to `google@cn`; keep the existing RuleSet ID `google-cn` so route identity and ordering do not change.
5. Replace the four empty classical provider source arrays with:

```yaml
  - name: Custom_Direct_Classical_IP
    output: Custom_Direct_Classical_IP.yaml
    behavior: classical
    sources:
      - name: Aethersailor_Custom_Direct_Classical_IP
        type: clash-provider
        basePath: vendor/Aethersailor
        path: rule/Custom_Direct_Classical_IP.yaml
  - name: Custom_Proxy_Classical_IP
    output: Custom_Proxy_Classical_IP.yaml
    behavior: classical
    sources:
      - name: Aethersailor_Custom_Proxy_Classical_IP
        type: clash-provider
        basePath: vendor/Aethersailor
        path: rule/Custom_Proxy_Classical_IP.yaml
  - name: Steam_CDN_Classical
    output: Steam_CDN_Classical.yaml
    behavior: classical
    sources:
      - name: Aethersailor_Steam_CDN_Classical_IP
        type: clash-provider
        basePath: vendor/Aethersailor
        path: rule/Steam_CDN_Classical_IP.yaml
  - name: Custom_Port_Direct
    output: Custom_Port_Direct.yaml
    behavior: classical
    sources:
      - name: Aethersailor_Custom_Port_Direct
        type: clash-provider
        basePath: vendor/Aethersailor
        path: rule/Custom_Port_Direct.yaml
```

6. Delete provider entries `Custom_Direct_Domain-mrs` and `Custom_Proxy_Domain-mrs` completely.

- [ ] **Step 5: Correct the repository guide path**

In `AGENTS.md`, replace the obsolete `config/modules.yaml` structure description with:

```md
- `config/routes.yaml`：当前 v1 项目作者配置，包含默认值、模板、vendor 仓库、策略组、路由顺序和 provider 声明；Schema v2 迁移前仍是单一事实源。
```

- [ ] **Step 6: Run the focused and repository gates**

Run:

```powershell
pnpm exec vitest run apps/cli/tests/cli.test.ts -t "repository route config"
pnpm check
pnpm generate
```

Expected:

- repository config test PASS;
- `pnpm check` exits 0; `gfw` may appear only as `workspace.geosite.missing` warning;
- `pnpm generate` exits 0 and writes only `.yaml` provider files.

- [ ] **Step 7: Review the generated file list**

Run:

```powershell
Get-ChildItem output/rules | Select-Object Name
git status --short
git diff --check
```

Expected: no `.mrs` appears under `output/rules`; `output/` remains ignored; no whitespace errors.

- [ ] **Step 8: Commit only the intended repository fix**

If `config/routes.yaml` was clean before Step 1:

```powershell
git add config/routes.yaml AGENTS.md apps/cli/tests/cli.test.ts
git commit -m "fix: repair executable route sources"
```

If `config/routes.yaml` already contained user-owned unstaged changes before Step 1, do not stage the full file blindly. Stage `AGENTS.md` and the test, leave the YAML fix visible in the working tree, and report the exact uncommitted config diff for user review. The execution handoff must not claim the config commit exists in that case.

### Task 7: Run the full phase gate and audit diagnostic consistency

**Files:**

- Review: `packages/core/src/config/`
- Review: `apps/cli/src/program.ts`
- Review: `apps/cli/src/serveApi.ts`
- Review: `apps/web/src/projectController.ts`
- Review: `config/routes.yaml`

**Interfaces:**

- Verifies: every blocking path calls `validateLegacyProjectConfig` and filters by severity.
- Verifies: no Web-owned duplicate validation remains.

- [ ] **Step 1: Search for duplicate validation and unsafe YAML assertions**

Run:

```powershell
rg -n "validateDraftConfig|YAML\.parse\(.*as RouteKitProjectConfig|detectProxyGroupCycles" packages apps
rg -n "validateLegacyProjectConfig" packages/core apps/cli apps/web
```

Expected: the first search returns no matches; the second shows Core definition plus Web save and CLI check/generate/save consumers.

- [ ] **Step 2: Run the complete automated gate**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm check
pnpm generate
```

Expected: every command exits 0.

- [ ] **Step 3: Verify warnings do not become false failures**

Run:

```powershell
pnpm check 2>&1 | Select-String "workspace.geosite.missing|\[check\] ok"
```

Expected: any Catalog miss is explicitly labeled warning, and the command exit code remains 0.

- [ ] **Step 4: Inspect final scope**

Run:

```powershell
git status --short
git diff --stat
git diff --check
```

Expected: only phase files and known user-owned changes remain; no generated `output/` file is tracked.

- [ ] **Step 5: Commit final test-only adjustments if needed**

If Step 2 required a small test expectation correction, stage only those test files and commit:

```powershell
git add packages/core/tests/configDocument.test.ts packages/core/tests/diagnostics.test.ts packages/core/tests/dependencyGraph.test.ts packages/core/tests/legacyValidation.test.ts packages/core/tests/defaults.test.ts apps/cli/tests/workspaceValidation.test.ts apps/cli/tests/cli.test.ts apps/cli/tests/serveApi.test.ts apps/web/tests/projectController.test.ts apps/web/tests/configMutations.test.ts apps/web/tests/providerRecipeEditor.test.tsx apps/web/tests/proxyGroups.test.ts apps/web/tests/actions.test.ts
git commit -m "test: verify shared config health gates"
```

If no adjustment was needed, do not create an empty commit.
