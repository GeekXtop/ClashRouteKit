# Schema v2 and Core Domain Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Core 内实现可深层解析、显式迁移、稳定引用、成员复用和无歧义规范化的 Schema v2，同时保持合法 v1 配置的渲染语义等价和只读兼容。

**Architecture:** v1 与 v2 先解析为 `AuthorProjectDocument`，v1 只生成迁移复核而不自动写回；v2 经过作者模型校验、preset/策略组依赖图、规范化和运行上下文组合，最终生成现有 INI/provider 生成器可消费的 `RenderProject`。所有 mutation 只按稳定 ID 操作，显示名称与引用彻底分离。

**Tech Stack:** pnpm 9.1.4 workspace、TypeScript 5.8 strict ESM/NodeNext、YAML 2.8、Vitest 3.2；不新增运行时 Schema 库，复用阶段 A 的严格 value readers 和结构化 `Diagnostic`。

## Global Constraints

- 新作者配置固定使用 `schemaVersion: 2`；没有 `schemaVersion` 的文档仍视为 v1。
- 普通加载 v1 只返回 `{ version: 1 }`，不得调用序列化或写盘。
- 当前阶段继续保留一个物理 `config/routes.yaml`，不拆成多个项目作者文件。
- `id` 是关系键，`name` 只用于展示和最终 INI 策略组名称；重命名不得改写其它引用。
- 策略组成员只能是 `{ group }`、`{ builtin }` 或 `{ preset }`，不得混入任意字符串。
- `memberSets` 只复用成员声明；规范化必须递归展开并检测 preset 循环。
- 节点筛选至少保存 `match`，订阅作用域使用显式 typed scope；HTTP/HTTPS URL 和无效正则是 error。
- 路由策略只能是 `{ group: <ID> }` 或 `{ builtin: "DIRECT" | "REJECT" }`。
- rule-provider 路由只引用 provider ID；输出文件名不再承担关系键职责。
- `vendorRepos`、rule provider、provider source、proxy group 和 route 都使用稳定 ID。
- 启用 provider 必须有数据源且输出为 `.yaml`；禁用的不完整 provider 不进入 `NormalizedProject`。
- 作者配置、本地设置候选、规范化模型、运行上下文和渲染输入必须是不同类型。
- `publishBaseUrl` 与 `subconverterUrl` 不属于 v2 作者配置；v1 迁移只能把它们放入本地设置候选。
- 迁移流程固定为分析 → 复核/解决问题 → 语义比较 → 应用；Core 本阶段只实现纯分析与结果计算，不做文件 IO。
- 迁移问题必须可定位、可显式解决；未解决 error 时不得返回可应用结果。
- 合法 v1 → v2 的规范化 INI 必须逐字节等价；仅允许复核中明确列出的无效项产生差异。
- Core 不依赖 Node 文件系统、HTTP、React、Git 或浏览器全局。
- 保留现有 `RouteKitProjectConfig` 作为 v1 兼容类型；新接口和 mutation 不继续扩展它。
- 代码使用两个空格、双引号、多行尾逗号和显式 `.js` ESM 导入；所有新行为先写 Vitest RED。

---

## File Structure

### Author and normalized types

- Create: `packages/core/src/config/authorTypes.ts` — v2 作者模型、typed member、route/provider/vendor 类型。
- Create: `packages/core/src/config/normalizedTypes.ts` — 已解析引用和展开 preset 的规范化模型。
- Create: `packages/core/src/render/renderTypes.ts` — `RuntimeContext` 与 `RenderProject`。
- Modify: `packages/core/src/index.ts` — 导出公共类型。

### Parsing and serialization

- Create: `packages/core/src/config/schemaV2Parser.ts` — v2 深层 runtime parser。
- Create: `packages/core/src/config/authorDocument.ts` — v1/v2 文档判别、`ParseResult`、v2 序列化。
- Create: `packages/core/tests/schemaV2.test.ts` — 合法/非法判别联合与嵌套字段。
- Create: `packages/core/tests/fixtures/schema-v2-minimal.yaml` — 最小合法 v2。

### Author validation and graphs

- Create: `packages/core/src/config/validateAuthor.ts` — v2 Schema 之后的引用、图与语义诊断。
- Create: `packages/core/src/routing/authorGraphs.ts` — group/preset 依赖图与引用摘要。
- Create: `packages/core/tests/authorValidation.test.ts` — 重复 ID、缺失引用、循环、FINAL、provider 和 node filter。

### Migration and review

- Create: `packages/core/src/config/stableId.ts` — 确定性 ID、冲突后缀和成员签名。
- Create: `packages/core/src/config/migrateV1.ts` — v1 → v2、typed member、provider ID、本地设置候选、memberSet 提取。
- Create: `packages/core/src/config/migrationResolution.ts` — 显式禁用、删除、映射来源、移除过滤器、替换 GEOSITE。
- Create: `packages/core/tests/migrateV1.test.ts` — ID 稳定性、重复成员提取、不完整项和本地设置候选。
- Create: `packages/core/tests/fixtures/legacy-valid.yaml` — 合法 v1 迁移夹具。
- Create: `packages/core/tests/fixtures/legacy-invalid-import.yaml` — `.mrs`、空 provider、URL filter 复核夹具。

### Normalization and rendering

- Create: `packages/core/src/config/normalize.ts` — preset 展开、引用解析、禁用项剔除、规范化结果。
- Create: `packages/core/src/render/createRenderProject.ts` — `NormalizedProject + RuntimeContext` → 旧生成器输入。
- Create: `packages/core/tests/normalizeProject.test.ts` — 展开顺序、循环、引用、禁用项。
- Create: `packages/core/tests/renderEquivalence.test.ts` — v1/v2 INI 逐字节等价。

### Stable-ID mutations and INI import review

- Create: `packages/core/src/config/authorMutations.ts` — 按 ID 原子更新、删除和排序。
- Create: `packages/core/tests/authorMutations.test.ts` — 重命名不改引用、失败不修改原对象。
- Create: `packages/core/src/config/importReview.ts` — 模板 INI replace/merge 分析与应用结果。
- Create: `packages/core/tests/importReview.test.ts` — 冲突 ID、覆盖摘要和失败保留。

---

### Task 1: Define the v2 author, normalized and render types

**Files:**

- Create: `packages/core/src/config/authorTypes.ts`
- Create: `packages/core/src/config/normalizedTypes.ts`
- Create: `packages/core/src/render/renderTypes.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/tests/schemaV2.test.ts`

**Interfaces:**

- Produces: `AuthorProjectConfig`, `ProxyGroupMember`, `AuthorRoute`, `AuthorRuleProvider`, `AuthorVendorRepo`.
- Produces: `NormalizedProject`, `NormalizedProxyGroup`, `NormalizedRoute`, `NormalizedRuleProvider`.
- Produces: `RuntimeContext`, `RenderProject`.
- Produces: `ParseResult<T>` and `AuthorProjectDocument` in Task 2 using these types.

- [ ] **Step 1: Write a compile-time/runtime shape test**

Create the initial `packages/core/tests/schemaV2.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  AuthorProjectConfig,
  ProxyGroupMember,
  RuntimeContext,
} from "../src/index.js";

describe("Schema v2 public types", () => {
  it("represents stable IDs, typed members and runtime-only URLs separately", () => {
    const members: ProxyGroupMember[] = [
      { group: "auto" },
      { builtin: "DIRECT" },
      { preset: "region-groups" },
    ];
    const config: AuthorProjectConfig = {
      schemaVersion: 2,
      project: { template: { output: "Custom_Clash.ini" } },
      memberSets: { "standard-proxy": { members } },
      proxyGroups: [
        { id: "chat", name: "💬 即时通讯", type: "select", members: [{ preset: "standard-proxy" }] },
      ],
      routes: [
        { id: "telegram", policy: { group: "chat" }, source: { type: "geosite", value: "telegram" } },
        { id: "final", policy: { builtin: "DIRECT" }, source: { type: "final" } },
      ],
      ruleProviders: [],
      vendorRepos: [],
    };
    const runtime: RuntimeContext = {
      publishBaseUrl: "http://192.168.1.10:8787",
      subconverterUrl: "http://10.0.0.3:25500/sub",
    };

    expect(config).not.toHaveProperty("publishBaseUrl");
    expect(runtime.publishBaseUrl).toContain("192.168.1.10");
  });
});
```

- [ ] **Step 2: Run the shape test and verify RED**

Run:

```powershell
pnpm exec vitest run packages/core/tests/schemaV2.test.ts
```

Expected: FAIL during transform/typecheck because the public types do not exist.

- [ ] **Step 3: Implement author types**

Create `packages/core/src/config/authorTypes.ts` with these exact public shapes:

```ts
import type {
  ProviderBehavior,
  RouteKitDefaults,
} from "../types.js";

export type BuiltinPolicy = "DIRECT" | "REJECT";

export type ProxyGroupMember =
  | { group: string }
  | { builtin: BuiltinPolicy }
  | { preset: string };

export type NodeFilterScope =
  | { type: "subscription-group-id"; value: string }
  | { type: "subscription-group-name"; value: string };

export interface AuthorNodeFilter {
  match: string;
  scope?: NodeFilterScope;
}

export interface AuthorMemberSet {
  members: ProxyGroupMember[];
}

export interface AuthorProxyGroup {
  id: string;
  name: string;
  type: "select" | "url-test" | "fallback" | "load-balance";
  members: ProxyGroupMember[];
  nodeFilters?: AuthorNodeFilter[];
  url?: string;
  interval?: number;
  timeout?: number | null;
  tolerance?: number | null;
}

export type AuthorPolicyRef =
  | { group: string }
  | { builtin: BuiltinPolicy };

export type AuthorRouteSource =
  | { type: "rule-provider"; provider: string; interval?: number }
  | { type: "geosite"; value: string }
  | { type: "geoip"; value: string; noResolve?: boolean }
  | { type: "final" };

export interface AuthorRoute {
  id: string;
  enabled?: boolean;
  section?: string;
  policy: AuthorPolicyRef;
  source: AuthorRouteSource;
}

export interface AuthorSourceBase {
  id: string;
  name: string;
  basePath?: string;
}

export type AuthorRuleProviderSource =
  | (AuthorSourceBase & { type: "clash-list"; path: string })
  | (AuthorSourceBase & { type: "clash-provider"; path: string })
  | (AuthorSourceBase & { type: "domain-list-community"; entry: string });

export interface AuthorRuleProvider {
  id: string;
  name: string;
  output: string;
  behavior: ProviderBehavior;
  enabled: boolean;
  exclude?: string[];
  remove?: string[];
  sources: AuthorRuleProviderSource[];
}

export interface AuthorVendorRepo {
  id: string;
  name: string;
  url: string;
  path: string;
  branch?: string;
  catalog?: {
    dir: string;
    kind: "domain-list" | "list-dir" | "provider-yaml" | "ini-template";
  };
  templateDir?: string;
}

export interface AuthorProjectConfig {
  schemaVersion: 2;
  project: {
    template: {
      output: string;
      enableRuleGenerator?: boolean;
      overwriteOriginalRules?: boolean;
      clashRuleBase?: string;
    };
    defaults?: RouteKitDefaults;
  };
  memberSets: Record<string, AuthorMemberSet>;
  proxyGroups: AuthorProxyGroup[];
  routes: AuthorRoute[];
  ruleProviders: AuthorRuleProvider[];
  vendorRepos: AuthorVendorRepo[];
  globalRemove?: string[];
}
```

- [ ] **Step 4: Implement normalized and render types**

Create `packages/core/src/config/normalizedTypes.ts`:

```ts
import type { RouteKitDefaults } from "../types.js";
import type {
  AuthorNodeFilter,
  AuthorProjectConfig,
  AuthorRuleProviderSource,
  AuthorVendorRepo,
  BuiltinPolicy,
} from "./authorTypes.js";

export type NormalizedGroupMember =
  | { type: "group"; id: string; name: string }
  | { type: "builtin"; value: BuiltinPolicy };

export interface NormalizedProxyGroup {
  id: string;
  name: string;
  type: "select" | "url-test" | "fallback" | "load-balance";
  members: NormalizedGroupMember[];
  nodeFilters: AuthorNodeFilter[];
  url?: string;
  interval?: number;
  timeout?: number | null;
  tolerance?: number | null;
}

export type NormalizedRouteSource =
  | {
      type: "rule-provider";
      providerId: string;
      output: string;
      behavior: "domain" | "classical" | "ipcidr";
      interval?: number;
    }
  | { type: "geosite"; value: string }
  | { type: "geoip"; value: string; noResolve?: boolean }
  | { type: "final" };

export interface NormalizedRoute {
  id: string;
  section?: string;
  policy: { type: "group"; id: string; name: string } | { type: "builtin"; value: BuiltinPolicy };
  source: NormalizedRouteSource;
}

export interface NormalizedRuleProvider {
  id: string;
  name: string;
  output: string;
  behavior: "domain" | "classical" | "ipcidr";
  exclude?: string[];
  remove?: string[];
  sources: AuthorRuleProviderSource[];
}

export interface NormalizedProject {
  schemaVersion: 2;
  template: AuthorProjectConfig["project"]["template"];
  defaults?: RouteKitDefaults;
  proxyGroups: NormalizedProxyGroup[];
  routes: NormalizedRoute[];
  ruleProviders: NormalizedRuleProvider[];
  vendorRepos: AuthorVendorRepo[];
  globalRemove: string[];
}
```

Create `packages/core/src/render/renderTypes.ts`:

```ts
import type { RouteKitConfig } from "../types.js";
import type {
  AuthorProjectConfig,
  AuthorVendorRepo,
} from "../config/authorTypes.js";
import type { NormalizedRuleProvider } from "../config/normalizedTypes.js";

export interface RuntimeContext {
  publishBaseUrl: string;
  subconverterUrl?: string;
}

export interface RenderProject {
  routeConfig: RouteKitConfig;
  template: AuthorProjectConfig["project"]["template"];
  vendorRepos: AuthorVendorRepo[];
  ruleProviders: NormalizedRuleProvider[];
  globalRemove: string[];
}
```

- [ ] **Step 5: Export and run GREEN**

Export the new types from `packages/core/src/index.ts`, then run:

```powershell
pnpm exec vitest run packages/core/tests/schemaV2.test.ts
pnpm --filter @clash-route-kit/core typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/core/src/config/authorTypes.ts packages/core/src/config/normalizedTypes.ts packages/core/src/render/renderTypes.ts packages/core/src/index.ts packages/core/tests/schemaV2.test.ts
git commit -m "feat: define schema v2 domain types"
```

### Task 2: Parse and serialize v1/v2 author documents without silent migration

**Files:**

- Create: `packages/core/src/config/schemaV2Parser.ts`
- Create: `packages/core/src/config/authorDocument.ts`
- Create: `packages/core/tests/fixtures/schema-v2-minimal.yaml`
- Modify: `packages/core/tests/schemaV2.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Consumes: phase A `valueReaders`, `parseLegacyProjectConfig`, `Diagnostic`.
- Produces: `ParseResult<T> = { ok: true; value: T; diagnostics: Diagnostic[] } | { ok: false; diagnostics: Diagnostic[] }`.
- Produces: `AuthorProjectDocument = { version: 1; config: RouteKitProjectConfig } | { version: 2; config: AuthorProjectConfig }`.
- Produces: `parseAuthorProjectConfig(yaml): ParseResult<AuthorProjectDocument>`.
- Produces: `serializeAuthorProjectConfig(config): string`.

- [ ] **Step 1: Add valid and invalid parser tests**

Create `packages/core/tests/fixtures/schema-v2-minimal.yaml`:

```yaml
schemaVersion: 2
project:
  template:
    output: Custom_Clash.ini
memberSets:
  standard:
    members:
      - builtin: DIRECT
proxyGroups:
  - id: proxy
    name: Proxy
    type: select
    members:
      - preset: standard
routes:
  - id: final
    policy:
      group: proxy
    source:
      type: final
ruleProviders: []
vendorRepos: []
```

Extend `packages/core/tests/schemaV2.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  parseAuthorProjectConfig,
  serializeAuthorProjectConfig,
} from "../src/index.js";

it("parses and serializes an explicit v2 document", async () => {
  const yaml = await readFile(
    fileURLToPath(new URL("./fixtures/schema-v2-minimal.yaml", import.meta.url)),
    "utf8",
  );
  const result = parseAuthorProjectConfig(yaml);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.diagnostics[0]?.message);
  expect(result.value.version).toBe(2);
  if (result.value.version !== 2) throw new Error("expected v2");
  expect(parseAuthorProjectConfig(serializeAuthorProjectConfig(result.value.config))).toMatchObject({
    ok: true,
    value: { version: 2 },
  });
});

it("returns v1 without writing or upgrading it", () => {
  const result = parseAuthorProjectConfig(`
publishBaseUrl: http://127.0.0.1:8787
template: { output: Custom_Clash.ini }
vendorRepos: []
customProxyGroups: []
ruleSets: []
ruleProviders: []
`);
  expect(result).toMatchObject({ ok: true, value: { version: 1 } });
});

it("rejects a numeric member at the exact path", () => {
  const result = parseAuthorProjectConfig(`
schemaVersion: 2
project: { template: { output: Custom_Clash.ini } }
memberSets: {}
proxyGroups:
  - id: proxy
    name: Proxy
    type: select
    members:
      - 123
routes:
  - id: final
    policy: { group: proxy }
    source: { type: final }
ruleProviders: []
vendorRepos: []
`);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected parse failure");
  expect(result.diagnostics[0]?.path).toBe("proxyGroups[0].members[0]");
});

it("rejects a policy containing both group and builtin", () => {
  const result = parseAuthorProjectConfig(`
schemaVersion: 2
project: { template: { output: Custom_Clash.ini } }
memberSets: {}
proxyGroups:
  - id: proxy
    name: Proxy
    type: select
    members:
      - builtin: DIRECT
routes:
  - id: final
    policy:
      group: proxy
      builtin: DIRECT
    source: { type: final }
ruleProviders: []
vendorRepos: []
`);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected parse failure");
  expect(result.diagnostics[0]?.path).toBe("routes[0].policy");
});

it("rejects a non-string provider output in the provider object", () => {
  const result = parseAuthorProjectConfig(`
schemaVersion: 2
project: { template: { output: Custom_Clash.ini } }
memberSets: {}
proxyGroups:
  - id: proxy
    name: Proxy
    type: select
    members:
      - builtin: DIRECT
routes:
  - id: provider
    policy: { group: proxy }
    source: { type: rule-provider, provider: custom }
  - id: final
    policy: { group: proxy }
    source: { type: final }
ruleProviders:
  - id: custom
    name: Custom
    output: 42
    behavior: domain
    enabled: true
    sources: []
vendorRepos: []
`);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected parse failure");
  expect(result.diagnostics[0]?.path).toBe("ruleProviders[0].output");
});
```

- [ ] **Step 2: Run parser tests and verify RED**

Run:

```powershell
pnpm exec vitest run packages/core/tests/schemaV2.test.ts
```

Expected: FAIL because the document parser and serializer do not exist.

- [ ] **Step 3: Implement discriminated member, policy and source parsers**

Create `packages/core/src/config/schemaV2Parser.ts`. Reuse the phase A readers and enforce exactly one discriminant key:

```ts
import type {
  AuthorNodeFilter,
  AuthorPolicyRef,
  AuthorProjectConfig,
  AuthorRouteSource,
  ProxyGroupMember,
} from "./authorTypes.js";
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

function exactlyOne(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
): string {
  const present = keys.filter((key) => value[key] !== undefined);
  if (present.length !== 1) {
    throw new Error(`${path}: expected exactly one of ${keys.join(", ")}`);
  }
  return present[0]!;
}

function parseMember(value: unknown, path: string): ProxyGroupMember {
  const member = readObject(value, path);
  assertKnownKeys(member, ["group", "builtin", "preset"], path);
  const key = exactlyOne(member, ["group", "builtin", "preset"], path);
  if (key === "builtin") {
    return { builtin: readEnum(member.builtin, ["DIRECT", "REJECT"] as const, `${path}.builtin`) };
  }
  return { [key]: readString(member[key], `${path}.${key}`) } as ProxyGroupMember;
}

function parsePolicy(value: unknown, path: string): AuthorPolicyRef {
  const policy = readObject(value, path);
  assertKnownKeys(policy, ["group", "builtin"], path);
  const key = exactlyOne(policy, ["group", "builtin"], path);
  return key === "group"
    ? { group: readString(policy.group, `${path}.group`) }
    : { builtin: readEnum(policy.builtin, ["DIRECT", "REJECT"] as const, `${path}.builtin`) };
}

function parseNodeFilter(value: unknown, path: string): AuthorNodeFilter {
  const filter = readObject(value, path);
  assertKnownKeys(filter, ["match", "scope"], path);
  const scope = filter.scope === undefined ? undefined : readObject(filter.scope, `${path}.scope`);
  if (scope) assertKnownKeys(scope, ["type", "value"], `${path}.scope`);
  return {
    match: readString(filter.match, `${path}.match`),
    ...(scope
      ? {
          scope: {
            type: readEnum(
              scope.type,
              ["subscription-group-id", "subscription-group-name"] as const,
              `${path}.scope.type`,
            ),
            value: readString(scope.value, `${path}.scope.value`),
          },
        }
      : {}),
  };
}

function parseRouteSource(value: unknown, path: string): AuthorRouteSource {
  const source = readObject(value, path);
  const type = readEnum(
    source.type,
    ["rule-provider", "geosite", "geoip", "final"] as const,
    `${path}.type`,
  );
  if (type === "rule-provider") {
    assertKnownKeys(source, ["type", "provider", "interval"], path);
    return {
      type,
      provider: readString(source.provider, `${path}.provider`),
      ...(source.interval === undefined ? {} : { interval: readOptionalNumber(source.interval, `${path}.interval`) as number }),
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
      ...(source.noResolve === undefined ? {} : { noResolve: readOptionalBoolean(source.noResolve, `${path}.noResolve`) }),
    };
  }
  assertKnownKeys(source, ["type"], path);
  return { type };
}
```

Implement parser functions for project/template/defaults, memberSets record, proxy groups, routes, rule providers and sources, and vendor repos. Use `assertKnownKeys` at every object level. `schemaVersion` must equal numeric literal `2`; any other number is a `schema.version.unsupported` parse failure.

- [ ] **Step 4: Implement the v1/v2 document wrapper**

Create `packages/core/src/config/authorDocument.ts`:

```ts
import YAML from "yaml";
import type { Diagnostic } from "./diagnostics.js";
import { parseLegacyProjectConfig } from "./legacyParser.js";
import { parseSchemaV2Config } from "./schemaV2Parser.js";
import type { AuthorProjectConfig } from "./authorTypes.js";
import type { RouteKitProjectConfig } from "../types.js";

export type ParseResult<T> =
  | { ok: true; value: T; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

export type AuthorProjectDocument =
  | { version: 1; config: RouteKitProjectConfig }
  | { version: 2; config: AuthorProjectConfig };

function failure(error: unknown): ParseResult<never> {
  const message = error instanceof Error ? error.message : String(error);
  const separator = message.indexOf(":");
  return {
    ok: false,
    diagnostics: [{
      code: "schema.invalid",
      severity: "error",
      path: separator > 0 ? message.slice(0, separator) : undefined,
      message: separator > 0 ? message.slice(separator + 1).trim() : message,
    }],
  };
}

export function parseAuthorProjectConfig(
  yaml: string,
): ParseResult<AuthorProjectDocument> {
  try {
    const value = YAML.parse(yaml) as unknown;
    const version = typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>).schemaVersion
      : undefined;
    return version === undefined
      ? { ok: true, value: { version: 1, config: parseLegacyProjectConfig(value) }, diagnostics: [] }
      : { ok: true, value: { version: 2, config: parseSchemaV2Config(value) }, diagnostics: [] };
  } catch (error: unknown) {
    return failure(error);
  }
}

export function serializeAuthorProjectConfig(
  config: AuthorProjectConfig,
): string {
  return YAML.stringify(config, { lineWidth: 0 }).replace(/\n?$/, "\n");
}
```

Export `parseSchemaV2Config` only internally; export the document parser/result types and serializer from Core index.

- [ ] **Step 5: Run GREEN and parser coverage**

Run:

```powershell
pnpm exec vitest run packages/core/tests/schemaV2.test.ts
pnpm --filter @clash-route-kit/core typecheck
```

Expected: PASS, including v1 discrimination and invalid nested-path cases.

- [ ] **Step 6: Commit**

```powershell
git add packages/core/src/config/schemaV2Parser.ts packages/core/src/config/authorDocument.ts packages/core/src/index.ts packages/core/tests/schemaV2.test.ts packages/core/tests/fixtures/schema-v2-minimal.yaml
git commit -m "feat: parse schema v2 author documents"
```

### Task 3: Validate v2 references, graphs and executable semantics

**Files:**

- Create: `packages/core/src/routing/authorGraphs.ts`
- Create: `packages/core/src/config/validateAuthor.ts`
- Create: `packages/core/tests/authorValidation.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Consumes: `AuthorProjectConfig`, phase A `Diagnostic` and `findDependencyCycles`.
- Produces: `createPresetGraph(config): DependencyGraph`.
- Produces: `createAuthorProxyGroupGraph(config): DependencyGraph`.
- Produces: `selectRouteIdsForGroup(config, groupId): string[]`.
- Produces: `validateAuthorProjectConfig(config): Diagnostic[]`.

- [ ] **Step 1: Write graph and validation RED tests**

Create `packages/core/tests/authorValidation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  selectRouteIdsForGroup,
  validateAuthorProjectConfig,
  type AuthorProjectConfig,
} from "../src/index.js";

function valid(): AuthorProjectConfig {
  return {
    schemaVersion: 2,
    project: { template: { output: "Custom_Clash.ini" } },
    memberSets: {
      regions: { members: [{ group: "hk" }, { group: "us" }] },
      standard: { members: [{ group: "auto" }, { preset: "regions" }] },
    },
    proxyGroups: [
      { id: "auto", name: "Auto", type: "url-test", members: [], nodeFilters: [{ match: ".*" }] },
      { id: "hk", name: "HK", type: "url-test", members: [], nodeFilters: [{ match: "HK" }] },
      { id: "us", name: "US", type: "url-test", members: [], nodeFilters: [{ match: "US" }] },
      { id: "chat", name: "Chat", type: "select", members: [{ preset: "standard" }] },
    ],
    routes: [
      { id: "telegram", policy: { group: "chat" }, source: { type: "geosite", value: "telegram" } },
      { id: "final", policy: { builtin: "DIRECT" }, source: { type: "final" } },
    ],
    ruleProviders: [],
    vendorRepos: [],
  };
}

it("selects inbound routes by stable group id", () => {
  expect(selectRouteIdsForGroup(valid(), "chat")).toEqual(["telegram"]);
});

it("reports preset cycles, group cycles and missing IDs", () => {
  const config = valid();
  config.memberSets.a = { members: [{ preset: "b" }] };
  config.memberSets.b = { members: [{ preset: "a" }] };
  config.proxyGroups[0]!.members = [{ group: "chat" }];
  config.proxyGroups[3]!.members = [{ group: "auto" }, { group: "missing" }];
  config.routes[0]!.policy = { group: "missing-policy" };

  const codes = validateAuthorProjectConfig(config).map((diagnostic) => diagnostic.code);
  expect(codes).toEqual(expect.arrayContaining([
    "preset.cycle",
    "group.cycle",
    "group.member.missing",
    "route.policy.missing",
  ]));
});

it("blocks enabled empty and mrs providers but permits disabled drafts", () => {
  const config = valid();
  config.ruleProviders = [
    { id: "bad", name: "Bad", output: "Bad.mrs", behavior: "domain", enabled: true, sources: [] },
    { id: "draft", name: "Draft", output: "Draft.mrs", behavior: "domain", enabled: false, sources: [] },
  ];
  const diagnostics = validateAuthorProjectConfig(config);
  expect(diagnostics).toContainEqual(expect.objectContaining({ code: "provider.sources.empty", severity: "error" }));
  expect(diagnostics).toContainEqual(expect.objectContaining({ code: "provider.output.unsupported", severity: "error" }));
  expect(diagnostics).toContainEqual(expect.objectContaining({ code: "provider.sources.disabled-empty", severity: "warning" }));
});

it("rejects URL and invalid-regex node filters", () => {
  const config = valid();
  config.proxyGroups[0]!.nodeFilters = [
    { match: "https://probe.example/204" },
    { match: "(" },
  ];
  expect(validateAuthorProjectConfig(config).map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
    "group.node-filter.url",
    "group.node-filter.regex",
  ]));
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
pnpm exec vitest run packages/core/tests/authorValidation.test.ts
```

Expected: FAIL because graph and validation exports do not exist.

- [ ] **Step 3: Implement author graphs**

Create `packages/core/src/routing/authorGraphs.ts`:

```ts
import type { AuthorProjectConfig, ProxyGroupMember } from "../config/authorTypes.js";
import type { DependencyGraph } from "./dependencyGraph.js";

function memberTargets(
  members: readonly ProxyGroupMember[],
  key: "group" | "preset",
): string[] {
  return members.flatMap((member) => key in member ? [member[key]] : []);
}

export function createPresetGraph(config: AuthorProjectConfig): DependencyGraph {
  return Object.fromEntries(Object.entries(config.memberSets).map(([id, set]) => [
    id,
    memberTargets(set.members, "preset"),
  ]));
}

export function createAuthorProxyGroupGraph(
  config: AuthorProjectConfig,
): DependencyGraph {
  const groups = new Set(config.proxyGroups.map((group) => group.id));
  return Object.fromEntries(config.proxyGroups.map((group) => [
    group.id,
    memberTargets(group.members, "group").filter((id) => groups.has(id)),
  ]));
}

export function selectRouteIdsForGroup(
  config: AuthorProjectConfig,
  groupId: string,
): string[] {
  return config.routes
    .filter((route) => "group" in route.policy && route.policy.group === groupId)
    .map((route) => route.id);
}
```

- [ ] **Step 4: Implement author diagnostics in deterministic passes**

Create `packages/core/src/config/validateAuthor.ts`. Use this public entry:

```ts
export function validateAuthorProjectConfig(
  config: AuthorProjectConfig,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  validateDuplicateIds(config, diagnostics);
  validateMemberSets(config, diagnostics);
  validateProxyGroups(config, diagnostics);
  validateProviders(config, diagnostics);
  validateRoutes(config, diagnostics);
  return diagnostics;
}
```

Implement these exact rules and codes:

| Rule | Code | Severity |
| --- | --- | --- |
| duplicate entity/source ID | `id.duplicate` | error |
| missing group member | `group.member.missing` | error |
| missing preset | `preset.missing` | error |
| preset cycle | `preset.cycle` | error |
| group cycle after preset expansion | `group.cycle` | error |
| empty group with no node filters | `group.members.empty` | error |
| URL node filter | `group.node-filter.url` | error |
| invalid regex | `group.node-filter.regex` | error |
| enabled provider with no source | `provider.sources.empty` | error |
| disabled provider with no source | `provider.sources.disabled-empty` | warning |
| enabled non-yaml output | `provider.output.unsupported` | error |
| disabled non-yaml output | `provider.output.disabled-unsupported` | warning |
| route missing policy group | `route.policy.missing` | error |
| route missing provider | `route.provider.missing` | error |
| route targets disabled provider | `route.provider.disabled` | error |
| no enabled FINAL | `route.final.missing` | error |
| multiple enabled FINAL | `route.final.multiple` | error |

Group-cycle validation must expand preset members first. Implement a pure `expandMemberSetForValidation` with an ancestor stack; preset-cycle diagnostics come from `findDependencyCycles(createPresetGraph(config))`, while group cycles use the expanded group adjacency.

- [ ] **Step 5: Run GREEN and export interfaces**

Run:

```powershell
pnpm exec vitest run packages/core/tests/authorValidation.test.ts
pnpm --filter @clash-route-kit/core typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/core/src/routing/authorGraphs.ts packages/core/src/config/validateAuthor.ts packages/core/src/index.ts packages/core/tests/authorValidation.test.ts
git commit -m "feat: validate schema v2 references"
```

### Task 4: Build deterministic v1 migration and explicit issue resolution

**Files:**

- Create: `packages/core/src/config/stableId.ts`
- Create: `packages/core/src/config/migrateV1.ts`
- Create: `packages/core/src/config/migrationResolution.ts`
- Create: `packages/core/tests/migrateV1.test.ts`
- Create: `packages/core/tests/fixtures/legacy-valid.yaml`
- Create: `packages/core/tests/fixtures/legacy-invalid-import.yaml`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Produces: `MigrationLocalSettingsPatch`.
- Produces: `MigrationIssue extends Diagnostic` with `issueId` and allowed resolutions.
- Produces: `MigrationReview` with `proposed`, `localSettingsPatch`, `idMap`, `generatedMemberSets`, `diagnostics`, and `semanticSummary`.
- Produces: `MigrationResolution` union.
- Produces: `migrateAuthorProjectConfig(v1): MigrationReview`.
- Produces: `applyMigrationResolutions(review, resolutions): MigrationReview`.
- Produces: `migrationCanApply(review): boolean`.

- [ ] **Step 1: Create migration fixtures**

Create `packages/core/tests/fixtures/legacy-valid.yaml` with two strategy groups sharing the same ordered options, one URL-test group, one GEOSITE route, one provider route, one FINAL route, one `.yaml` provider source, one vendor repo, `publishBaseUrl`, and `subconverterUrl`.

The repeated options must be exactly:

```yaml
      - Auto
      - HK
      - US
      - DIRECT
```

Create `packages/core/tests/fixtures/legacy-invalid-import.yaml` with:

```yaml
publishBaseUrl: http://127.0.0.1:8787
template: { output: Custom_Clash.ini }
vendorRepos: []
customProxyGroups:
  - name: Direct
    type: select
    options: [DIRECT]
    nodeFilters:
      - http://wifi.vivo.com.cn/generate_204
ruleSets:
  - id: legacy-mrs
    policy: Direct
    source:
      type: rule-provider
      behavior: domain
      file: Legacy.mrs
  - id: final
    policy: Direct
    source: { type: final }
ruleProviders:
  - name: Legacy
    output: Legacy.mrs
    behavior: domain
    sources: []
```

- [ ] **Step 2: Write deterministic migration RED tests**

Create `packages/core/tests/migrateV1.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyMigrationResolutions,
  migrateAuthorProjectConfig,
  migrationCanApply,
  parseRouteKitConfig,
} from "../src/index.js";

async function fixture(name: string) {
  return parseRouteKitConfig(await readFile(
    fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)),
    "utf8",
  ));
}

it("generates stable IDs and extracts repeated member lists once", async () => {
  const config = await fixture("legacy-valid.yaml");
  const first = migrateAuthorProjectConfig(config);
  const second = migrateAuthorProjectConfig(config);

  expect(first.idMap).toEqual(second.idMap);
  expect(first.generatedMemberSets).toHaveLength(1);
  const presetId = first.generatedMemberSets[0]!;
  expect(Object.keys(first.proposed.memberSets)).toContain(presetId);
  expect(first.proposed.proxyGroups.filter((group) =>
    group.members.some((member) => "preset" in member && member.preset === presetId),
  )).toHaveLength(2);
});

it("moves runtime URLs into a local settings patch", async () => {
  const review = migrateAuthorProjectConfig(await fixture("legacy-valid.yaml"));
  expect(review.proposed).not.toHaveProperty("publishBaseUrl");
  expect(review.localSettingsPatch).toEqual({
    serve: { publicBaseUrl: "http://127.0.0.1:8787" },
    subconverterUrl: "http://10.0.0.3:25500/sub",
  });
});

it("requires explicit resolutions for mrs, empty sources and URL filters", async () => {
  const review = migrateAuthorProjectConfig(await fixture("legacy-invalid-import.yaml"));
  expect(migrationCanApply(review)).toBe(false);
  expect(review.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
    "migration.node-filter.url",
    "migration.provider.output-unsupported",
    "migration.provider.sources-empty",
  ]));

  const resolved = applyMigrationResolutions(review, [
    { issueId: "proxyGroups[0].nodeFilters[0]", action: "remove-node-filter" },
    { issueId: "ruleProviders[0]", action: "disable-provider" },
    { issueId: "routes[0]", action: "disable-route" },
  ]);
  expect(migrationCanApply(resolved)).toBe(true);
  expect(resolved.proposed.ruleProviders[0]?.enabled).toBe(false);
  expect(resolved.proposed.routes[0]?.enabled).toBe(false);
});
```

- [ ] **Step 3: Run migration tests and verify RED**

Run:

```powershell
pnpm exec vitest run packages/core/tests/migrateV1.test.ts
```

Expected: FAIL because migration interfaces do not exist.

- [ ] **Step 4: Implement stable IDs and member signatures**

Create `packages/core/src/config/stableId.ts`:

```ts
function hash32(value: string): string {
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function asciiSlug(value: string): string {
  return value.normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function stableEntityId(
  prefix: string,
  source: string,
  used: Set<string>,
): string {
  const base = asciiSlug(source) || `${prefix}-${hash32(source)}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export function memberSignature(members: readonly ProxyGroupMember[]): string {
  return JSON.stringify(members);
}

export function stableMemberSetId(
  members: readonly ProxyGroupMember[],
  used: Set<string>,
): string {
  return stableEntityId("members", `members-${hash32(memberSignature(members))}`, used);
}
```

Import `ProxyGroupMember` from `authorTypes.ts`.

- [ ] **Step 5: Implement migration review types and conversion**

Create `packages/core/src/config/migrateV1.ts` with these public types:

```ts
export interface MigrationLocalSettingsPatch {
  serve?: { publicBaseUrl?: string };
  subconverterUrl?: string;
}

export type MigrationResolutionAction =
  | "remove-node-filter"
  | "disable-provider"
  | "drop-provider"
  | "map-provider-source"
  | "disable-route"
  | "drop-route"
  | "replace-geosite";

export interface MigrationIssue extends Diagnostic {
  issueId: string;
  resolutions: MigrationResolutionAction[];
  target:
    | { kind: "node-filter"; groupId: string; index: number }
    | { kind: "provider"; providerId: string }
    | { kind: "route"; routeId: string }
    | { kind: "validation" };
}

export interface MigrationSemanticSnapshot {
  proxyGroupLines: string[];
  ruleLines: string[];
  providerOutputs: string[];
}

export interface MigrationSemanticDifference {
  path: string;
  before?: string;
  after?: string;
  classification: "resolved-invalid-item" | "migration-mismatch";
  issueIds: string[];
}

export interface MigrationReview {
  sourceVersion: 1;
  proposed: AuthorProjectConfig;
  localSettingsPatch: MigrationLocalSettingsPatch;
  idMap: {
    proxyGroups: Record<string, string>;
    ruleProviders: Record<string, string>;
    vendorRepos: Record<string, string>;
  };
  generatedMemberSets: string[];
  diagnostics: MigrationIssue[];
  semanticSummary: {
    proxyGroups: number;
    routes: number;
    enabledProviders: number;
    disabledProviders: number;
  };
  semanticComparison: {
    before: MigrationSemanticSnapshot;
    after: MigrationSemanticSnapshot;
    equivalent: boolean;
    differences: MigrationSemanticDifference[];
  };
}
```

Add these private helper signatures in the same file so the public migration function contains no IO and every intermediate is deterministic:

```ts
interface MigrationIdMaps {
  proxyGroups: Record<string, string>;
  ruleProviders: Record<string, string>;
  vendorRepos: Record<string, string>;
}

function buildMigrationIdMaps(config: RouteKitProjectConfig): MigrationIdMaps;
function convertLegacyGroups(config: RouteKitProjectConfig, maps: MigrationIdMaps): AuthorProxyGroup[];
function convertLegacyProviders(config: RouteKitProjectConfig, maps: MigrationIdMaps): AuthorRuleProvider[];
function convertLegacyRoutes(config: RouteKitProjectConfig, maps: MigrationIdMaps): AuthorRoute[];
function convertLegacyRepos(config: RouteKitProjectConfig, maps: MigrationIdMaps): AuthorVendorRepo[];
function extractRepeatedMemberSets(
  groups: AuthorProxyGroup[],
): { groups: AuthorProxyGroup[]; memberSets: Record<string, AuthorMemberSet>; generatedIds: string[] };
function collectMigrationIssues(
  legacy: RouteKitProjectConfig,
  proposed: AuthorProjectConfig,
): MigrationIssue[];
function compareMigrationSemantics(
  legacy: RouteKitProjectConfig,
  proposed: AuthorProjectConfig,
  issues: readonly MigrationIssue[],
): MigrationReview["semanticComparison"];
function semanticMismatchIssues(
  comparison: MigrationReview["semanticComparison"],
): MigrationIssue[];

export function migrateAuthorProjectConfig(
  config: RouteKitProjectConfig,
): MigrationReview {
  const idMap = buildMigrationIdMaps(config);
  const extracted = extractRepeatedMemberSets(convertLegacyGroups(config, idMap));
  const proposed: AuthorProjectConfig = {
    schemaVersion: 2,
    project: {
      template: structuredClone(config.template),
      ...(config.defaults ? { defaults: structuredClone(config.defaults) } : {}),
    },
    memberSets: extracted.memberSets,
    proxyGroups: extracted.groups,
    routes: convertLegacyRoutes(config, idMap),
    ruleProviders: convertLegacyProviders(config, idMap),
    vendorRepos: convertLegacyRepos(config, idMap),
    globalRemove: [...(config.globalRemove ?? [])],
  };
  const migrationIssues = collectMigrationIssues(config, proposed);
  const semanticComparison = compareMigrationSemantics(config, proposed, migrationIssues);
  const diagnostics = [...migrationIssues, ...semanticMismatchIssues(semanticComparison)];
  const enabledProviders = proposed.ruleProviders.filter((provider) => provider.enabled).length;
  return {
    sourceVersion: 1,
    proposed,
    localSettingsPatch: {
      ...(config.publishBaseUrl.trim() ? { serve: { publicBaseUrl: config.publishBaseUrl } } : {}),
      ...(config.subconverterUrl?.trim() ? { subconverterUrl: config.subconverterUrl } : {}),
    },
    idMap,
    generatedMemberSets: extracted.generatedIds,
    diagnostics,
    semanticSummary: {
      proxyGroups: proposed.proxyGroups.length,
      routes: proposed.routes.length,
      enabledProviders,
      disabledProviders: proposed.ruleProviders.length - enabledProviders,
    },
    semanticComparison,
  };
}
```

Implement the helpers in this exact order:

1. Generate group/provider/vendor IDs from names with separate `used` sets.
2. Convert every legacy group option to `{ group: mappedId }` if it names a custom group, otherwise `{ builtin }` for `DIRECT`/`REJECT`; emit `migration.group-member.unknown` error for other strings.
3. Parse `!!GROUPID=value!!regex` and `!!GROUP=value!!regex` into typed node-filter scopes; plain filters become `{ match }`.
4. Convert provider sources and add stable source IDs.
5. Convert route policy names to ID/builtin refs and provider output files to provider IDs.
6. Set `enabled` from legacy values, defaulting to true.
7. Find identical member signatures used by at least two groups, generate one memberSet per signature, and replace each matching group's full member list with a single `{ preset }`.
8. Build `localSettingsPatch` from non-empty legacy `publishBaseUrl` and `subconverterUrl`.
9. Add migration issues for URL filters, enabled `.mrs`, enabled empty provider and missing references. Unknown GEOSITE is appended later by Local Server workspace analysis because Core does not read a Catalog.
10. Build `semanticComparison.before` from the legacy group/rule/provider render semantics and `after` from the proposed v2 semantics using a fixed runtime base URL. Differences linked to an unresolved migration issue use `resolved-invalid-item`. `semanticMismatchIssues` converts every unlinked `migration-mismatch` difference to an error `MigrationIssue` with `target: { kind: "validation" }`, so Web can show the exact before/after line rather than only counts.

Initial invalid provider/route candidates remain in `proposed` with their original enabled state; unresolved error diagnostics make `migrationCanApply` false.

- [ ] **Step 6: Implement explicit resolution application**

Create `packages/core/src/config/migrationResolution.ts`:

```ts
export type MigrationResolution =
  | { issueId: string; action: "remove-node-filter" }
  | { issueId: string; action: "disable-provider" }
  | { issueId: string; action: "drop-provider" }
  | { issueId: string; action: "map-provider-source"; source: AuthorRuleProviderSource }
  | { issueId: string; action: "disable-route" }
  | { issueId: string; action: "drop-route" }
  | { issueId: string; action: "replace-geosite"; value: string };

export function migrationCanApply(review: MigrationReview): boolean {
  return !review.diagnostics.some((diagnostic) => diagnostic.severity === "error");
}
```

Implement resolution application with stable targets rather than parsing display paths:

```ts
function authorIssue(diagnostic: Diagnostic): MigrationIssue {
  return {
    ...diagnostic,
    issueId: diagnostic.path ?? diagnostic.code,
    resolutions: [],
    target: { kind: "validation" },
  };
}

export function applyMigrationResolutions(
  review: MigrationReview,
  resolutions: readonly MigrationResolution[],
): MigrationReview {
  const proposed = structuredClone(review.proposed);
  const remaining = new Map(review.diagnostics.map((issue) => [issue.issueId, issue]));

  for (const resolution of resolutions) {
    const issue = remaining.get(resolution.issueId);
    if (!issue) throw new Error(`unknown migration issue: ${resolution.issueId}`);
    if (!issue.resolutions.includes(resolution.action)) {
      throw new Error(`resolution ${resolution.action} is not allowed for ${resolution.issueId}`);
    }

    if (resolution.action === "remove-node-filter" && issue.target.kind === "node-filter") {
      const group = proposed.proxyGroups.find((item) => item.id === issue.target.groupId);
      if (!group) throw new Error(`missing migration group: ${issue.target.groupId}`);
      group.nodeFilters = (group.nodeFilters ?? []).filter((_item, index) => index !== issue.target.index);
    } else if (issue.target.kind === "provider") {
      const index = proposed.ruleProviders.findIndex((item) => item.id === issue.target.providerId);
      if (index < 0) throw new Error(`missing migration provider: ${issue.target.providerId}`);
      if (resolution.action === "disable-provider") proposed.ruleProviders[index]!.enabled = false;
      else if (resolution.action === "drop-provider") proposed.ruleProviders.splice(index, 1);
      else if (resolution.action === "map-provider-source") proposed.ruleProviders[index]!.sources.push(structuredClone(resolution.source));
      else throw new Error(`invalid provider resolution: ${resolution.action}`);
    } else if (issue.target.kind === "route") {
      const index = proposed.routes.findIndex((item) => item.id === issue.target.routeId);
      if (index < 0) throw new Error(`missing migration route: ${issue.target.routeId}`);
      if (resolution.action === "disable-route") proposed.routes[index]!.enabled = false;
      else if (resolution.action === "drop-route") proposed.routes.splice(index, 1);
      else if (resolution.action === "replace-geosite" && proposed.routes[index]!.source.type === "geosite") {
        proposed.routes[index]!.source.value = resolution.value;
      } else throw new Error(`invalid route resolution: ${resolution.action}`);
    } else {
      throw new Error(`resolution target mismatch: ${resolution.issueId}`);
    }
    remaining.delete(resolution.issueId);
  }

  const validationIssues = validateAuthorProjectConfig(proposed)
    .filter((diagnostic) => diagnostic.severity === "error")
    .map(authorIssue);
  const baseDiagnostics = [...remaining.values(), ...validationIssues];
  const semanticComparison = compareMigrationSemantics(
    review.semanticComparison.before,
    proposed,
    baseDiagnostics,
  );
  const diagnostics = [...baseDiagnostics, ...semanticMismatchIssues(semanticComparison)];
  return {
    ...structuredClone(review),
    proposed,
    diagnostics,
    semanticComparison,
  };
}
```

Overload the private `compareMigrationSemantics` first parameter as `RouteKitProjectConfig | MigrationSemanticSnapshot`, so re-resolution reuses the immutable `before` snapshot. `authorIssue` and semantic mismatch targets are intentionally non-actionable (`resolutions: []`, `kind: "validation"`). The function never mutates `review`.

- [ ] **Step 7: Run migration GREEN tests**

Run:

```powershell
pnpm exec vitest run packages/core/tests/migrateV1.test.ts
pnpm --filter @clash-route-kit/core typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add packages/core/src/config/stableId.ts packages/core/src/config/migrateV1.ts packages/core/src/config/migrationResolution.ts packages/core/src/index.ts packages/core/tests/migrateV1.test.ts packages/core/tests/fixtures/legacy-valid.yaml packages/core/tests/fixtures/legacy-invalid-import.yaml
git commit -m "feat: add explicit v1 to v2 migration"
```

### Task 5: Normalize v2 and create the existing renderer input

**Files:**

- Create: `packages/core/src/config/normalize.ts`
- Create: `packages/core/src/render/createRenderProject.ts`
- Create: `packages/core/tests/normalizeProject.test.ts`
- Create: `packages/core/tests/renderEquivalence.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Consumes: `validateAuthorProjectConfig`, author graph types, `RuntimeContext`.
- Produces: `NormalizeResult = { ok: true; project: NormalizedProject; diagnostics: Diagnostic[] } | { ok: false; diagnostics: Diagnostic[] }`.
- Produces: `normalizeProjectConfig(config): NormalizeResult`.
- Produces: `validateNormalizedProject(project): Diagnostic[]`.
- Produces: `encodeNodeFilter(filter): string`.
- Produces: `createRenderProject(project, runtime): RenderProject`.

- [ ] **Step 1: Write preset expansion and disabled-item RED tests**

Create `packages/core/tests/normalizeProject.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  normalizeProjectConfig,
  type AuthorProjectConfig,
} from "../src/index.js";

function author(): AuthorProjectConfig {
  return {
    schemaVersion: 2,
    project: { template: { output: "Custom_Clash.ini" } },
    memberSets: {
      regions: { members: [{ group: "hk" }, { group: "us" }] },
      standard: { members: [{ group: "auto" }, { preset: "regions" }, { builtin: "DIRECT" }] },
    },
    proxyGroups: [
      { id: "auto", name: "Auto", type: "url-test", members: [], nodeFilters: [{ match: ".*" }] },
      { id: "hk", name: "Hong Kong", type: "url-test", members: [], nodeFilters: [{ match: "HK" }] },
      { id: "us", name: "United States", type: "url-test", members: [], nodeFilters: [{ match: "US" }] },
      { id: "chat", name: "Chat", type: "select", members: [{ preset: "standard" }] },
    ],
    routes: [
      { id: "telegram", policy: { group: "chat" }, source: { type: "geosite", value: "telegram" } },
      { id: "disabled", enabled: false, policy: { group: "chat" }, source: { type: "geosite", value: "example" } },
      { id: "final", policy: { builtin: "DIRECT" }, source: { type: "final" } },
    ],
    ruleProviders: [
      { id: "draft", name: "Draft", output: "Draft.mrs", behavior: "domain", enabled: false, sources: [] },
    ],
    vendorRepos: [],
  };
}

it("expands nested presets in declaration order and resolves group names", () => {
  const result = normalizeProjectConfig(author());
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.diagnostics[0]?.message);
  expect(result.project.proxyGroups.find((group) => group.id === "chat")?.members).toEqual([
    { type: "group", id: "auto", name: "Auto" },
    { type: "group", id: "hk", name: "Hong Kong" },
    { type: "group", id: "us", name: "United States" },
    { type: "builtin", value: "DIRECT" },
  ]);
});

it("omits disabled routes and providers from the executable model", () => {
  const result = normalizeProjectConfig(author());
  if (!result.ok) throw new Error(result.diagnostics[0]?.message);
  expect(result.project.routes.map((route) => route.id)).toEqual(["telegram", "final"]);
  expect(result.project.ruleProviders).toEqual([]);
});
```

- [ ] **Step 2: Write render-equivalence RED test**

Create `packages/core/tests/renderEquivalence.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createRenderProject,
  migrateAuthorProjectConfig,
  normalizeProjectConfig,
  parseRouteKitConfig,
  renderIni,
} from "../src/index.js";

it("keeps valid v1 and migrated v2 INI byte-for-byte equivalent", async () => {
  const legacy = parseRouteKitConfig(await readFile(
    fileURLToPath(new URL("./fixtures/legacy-valid.yaml", import.meta.url)),
    "utf8",
  ));
  const review = migrateAuthorProjectConfig(legacy);
  expect(review.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  const normalized = normalizeProjectConfig(review.proposed);
  expect(normalized.ok).toBe(true);
  if (!normalized.ok) throw new Error(normalized.diagnostics[0]?.message);
  const render = createRenderProject(normalized.project, {
    publishBaseUrl: legacy.publishBaseUrl,
    subconverterUrl: legacy.subconverterUrl,
  });

  expect(renderIni(render.routeConfig, render.template)).toBe(renderIni(legacy, legacy.template));
});
```

If `renderIni` currently accepts `RenderIniOptions` rather than the template object directly, pass an explicit object containing `enableRuleGenerator`, `overwriteOriginalRules`, and `clashRuleBase` on both sides.

- [ ] **Step 3: Run normalization tests and verify RED**

Run:

```powershell
pnpm exec vitest run packages/core/tests/normalizeProject.test.ts packages/core/tests/renderEquivalence.test.ts
```

Expected: FAIL because normalization and render-project functions do not exist.

- [ ] **Step 4: Implement normalization without repair logic**

Create `packages/core/src/config/normalize.ts`:

```ts
import { hasDiagnosticErrors, type Diagnostic } from "./diagnostics.js";
import { validateAuthorProjectConfig } from "./validateAuthor.js";
import type { AuthorProjectConfig, ProxyGroupMember } from "./authorTypes.js";
import type {
  NormalizedGroupMember,
  NormalizedProject,
} from "./normalizedTypes.js";

export type NormalizeResult =
  | { ok: true; project: NormalizedProject; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

function expandMembers(
  members: readonly ProxyGroupMember[],
  config: AuthorProjectConfig,
  groupNames: Map<string, string>,
  ancestors: readonly string[] = [],
): NormalizedGroupMember[] {
  return members.flatMap((member) => {
    if ("builtin" in member) return [{ type: "builtin" as const, value: member.builtin }];
    if ("group" in member) {
      const name = groupNames.get(member.group);
      if (!name) throw new Error(`missing group ${member.group}`);
      return [{ type: "group" as const, id: member.group, name }];
    }
    if (ancestors.includes(member.preset)) {
      throw new Error(`preset cycle ${[...ancestors, member.preset].join(" -> ")}`);
    }
    const preset = config.memberSets[member.preset];
    if (!preset) throw new Error(`missing preset ${member.preset}`);
    return expandMembers(preset.members, config, groupNames, [...ancestors, member.preset]);
  });
}
```

`normalizeProjectConfig` must first call `validateAuthorProjectConfig`; if any error exists, return `{ ok: false, diagnostics }` and never throw. After validation, build lookup maps and resolve:

- all group members after recursive preset expansion;
- route policy group IDs to `{ id, name }`;
- provider route IDs to provider `output` and `behavior`;
- only routes with `enabled !== false`;
- only providers with `enabled === true`;
- cloned vendor repos and global remove values.

Implement `validateNormalizedProject` to check no duplicate group/route/provider IDs, every normalized group member has a non-empty resolved name, every provider route's `providerId/output/behavior` matches a normalized provider, and exactly one FINAL exists.

- [ ] **Step 5: Implement node filter encoding and render mapping**

Create `packages/core/src/render/createRenderProject.ts`:

```ts
import type { AuthorNodeFilter } from "../config/authorTypes.js";
import type { NormalizedProject } from "../config/normalizedTypes.js";
import type { RenderProject, RuntimeContext } from "./renderTypes.js";

export function encodeNodeFilter(filter: AuthorNodeFilter): string {
  if (!filter.scope) return filter.match;
  const prefix = filter.scope.type === "subscription-group-id" ? "GROUPID" : "GROUP";
  return `!!${prefix}=${filter.scope.value}!!${filter.match}`;
}

export function createRenderProject(
  project: NormalizedProject,
  runtime: RuntimeContext,
): RenderProject {
  return {
    routeConfig: {
      publishBaseUrl: runtime.publishBaseUrl,
      ...(runtime.subconverterUrl ? { subconverterUrl: runtime.subconverterUrl } : {}),
      defaults: project.defaults,
      customProxyGroups: project.proxyGroups.map((group) => ({
        name: group.name,
        type: group.type,
        options: group.members.map((member) =>
          member.type === "group" ? member.name : member.value,
        ),
        nodeFilters: group.nodeFilters.map(encodeNodeFilter),
        ...(group.url === undefined ? {} : { url: group.url }),
        ...(group.interval === undefined ? {} : { interval: group.interval }),
        ...(group.timeout === undefined ? {} : { timeout: group.timeout }),
        ...(group.tolerance === undefined ? {} : { tolerance: group.tolerance }),
      })),
      ruleSets: project.routes.map((route) => ({
        id: route.id,
        section: route.section,
        policy: route.policy.type === "group" ? route.policy.name : route.policy.value,
        source: route.source.type === "rule-provider"
          ? {
              type: "rule-provider" as const,
              behavior: route.source.behavior,
              file: route.source.output,
              ...(route.source.interval === undefined ? {} : { interval: route.source.interval }),
            }
          : route.source,
      })),
    },
    template: project.template,
    vendorRepos: project.vendorRepos,
    ruleProviders: project.ruleProviders,
    globalRemove: project.globalRemove,
  };
}
```

Do not add fallback values here; fallback resolution stays in the existing renderer/default functions.

- [ ] **Step 6: Run GREEN and equivalence tests**

Run:

```powershell
pnpm exec vitest run packages/core/tests/normalizeProject.test.ts packages/core/tests/renderEquivalence.test.ts
pnpm --filter @clash-route-kit/core typecheck
```

Expected: PASS and byte-for-byte INI equality.

- [ ] **Step 7: Commit**

```powershell
git add packages/core/src/config/normalize.ts packages/core/src/render/createRenderProject.ts packages/core/src/index.ts packages/core/tests/normalizeProject.test.ts packages/core/tests/renderEquivalence.test.ts
git commit -m "feat: normalize schema v2 for rendering"
```

### Task 6: Add atomic stable-ID mutations

**Files:**

- Create: `packages/core/src/config/authorMutations.ts`
- Create: `packages/core/tests/authorMutations.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Produces: `MutationResult<T> = { ok: true; value: T } | { ok: false; diagnostics: Diagnostic[] }`.
- Produces: `replaceProxyGroup`, `removeProxyGroup`, `replaceRoute`, `removeRoute`, `reorderRoutes`, `replaceRuleProvider`, `removeRuleProvider`, `replaceMemberSet`, `removeMemberSet`, `replaceVendorRepo`.
- Guarantees: every mutation clones only changed collections, validates the entire next author config, and returns the original object untouched on failure.

- [ ] **Step 1: Write rename/reference and atomic-failure tests**

Create `packages/core/tests/authorMutations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  removeProxyGroup,
  replaceProxyGroup,
  reorderRoutes,
  type AuthorProjectConfig,
} from "../src/index.js";

function config(): AuthorProjectConfig {
  return {
    schemaVersion: 2,
    project: { template: { output: "Custom_Clash.ini" } },
    memberSets: {},
    proxyGroups: [
      { id: "chat", name: "Chat", type: "select", members: [{ builtin: "DIRECT" }] },
      { id: "parent", name: "Parent", type: "select", members: [{ group: "chat" }] },
    ],
    routes: [
      { id: "telegram", policy: { group: "chat" }, source: { type: "geosite", value: "telegram" } },
      { id: "final", policy: { builtin: "DIRECT" }, source: { type: "final" } },
    ],
    ruleProviders: [],
    vendorRepos: [],
  };
}

it("renames display text without rewriting stable references", () => {
  const start = config();
  const result = replaceProxyGroup(start, "chat", { ...start.proxyGroups[0]!, name: "💬 即时通讯" });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.diagnostics[0]?.message);
  expect(result.value.routes[0]?.policy).toEqual({ group: "chat" });
  expect(result.value.proxyGroups[1]?.members).toEqual([{ group: "chat" }]);
  expect(start.proxyGroups[0]?.name).toBe("Chat");
});

it("rejects deleting a referenced group without modifying the input", () => {
  const start = config();
  const result = removeProxyGroup(start, "chat");
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected failure");
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
    "group.member.missing",
    "route.policy.missing",
  ]));
  expect(start.proxyGroups).toHaveLength(2);
});

it("reorders all routes exactly once", () => {
  const result = reorderRoutes(config(), ["final", "telegram"]);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.diagnostics[0]?.message);
  expect(result.value.routes.map((route) => route.id)).toEqual(["final", "telegram"]);
});
```

- [ ] **Step 2: Run mutation tests and verify RED**

Run:

```powershell
pnpm exec vitest run packages/core/tests/authorMutations.test.ts
```

Expected: FAIL because stable-ID mutations do not exist.

- [ ] **Step 3: Implement one generic validated mutation helper**

Create `packages/core/src/config/authorMutations.ts`:

```ts
import type { Diagnostic } from "./diagnostics.js";
import type {
  AuthorMemberSet,
  AuthorProjectConfig,
  AuthorProxyGroup,
  AuthorRoute,
  AuthorRuleProvider,
  AuthorVendorRepo,
} from "./authorTypes.js";
import { validateAuthorProjectConfig } from "./validateAuthor.js";

export type MutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; diagnostics: Diagnostic[] };

function validated(next: AuthorProjectConfig): MutationResult<AuthorProjectConfig> {
  const diagnostics = validateAuthorProjectConfig(next);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  return errors.length > 0
    ? { ok: false, diagnostics }
    : { ok: true, value: next };
}

function replaceById<T extends { id: string }>(
  values: readonly T[],
  id: string,
  next: T,
): T[] {
  if (next.id !== id) throw new Error("stable ID cannot be changed by replace mutation");
  const index = values.findIndex((value) => value.id === id);
  if (index === -1) throw new Error(`entity ${id} not found`);
  const result = [...values];
  result[index] = structuredClone(next);
  return result;
}
```

Implement each public mutation as a small wrapper that constructs a new top-level config and calls `validated`. `reorderRoutes` must reject missing/duplicate IDs before validation and preserve no unlisted route. `replaceMemberSet` operates on the record key and does not allow key changes. `remove*` functions filter/delete then validate, so referenced deletions fail atomically.

- [ ] **Step 4: Run GREEN and Core typecheck**

Run:

```powershell
pnpm exec vitest run packages/core/tests/authorMutations.test.ts
pnpm --filter @clash-route-kit/core typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/core/src/config/authorMutations.ts packages/core/src/index.ts packages/core/tests/authorMutations.test.ts
git commit -m "feat: add stable id config mutations"
```

### Task 7: Add replace/merge INI import review on top of migration

**Files:**

- Create: `packages/core/src/config/importReview.ts`
- Create: `packages/core/tests/importReview.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Consumes: existing `parseIniToConfig`, `migrateAuthorProjectConfig`, stable ID functions and author validation.
- Produces: `ImportMode = "replace" | "merge"`.
- Produces: `IniImportReview` with source counts, added/replaced/conflict counts, proposed config and diagnostics.
- Produces: `analyzeIniImport(input): IniImportReview`.
- Produces: `applyIniImportReview(review): MutationResult<AuthorProjectConfig>`.

- [ ] **Step 1: Write replace, merge and failure RED tests**

Create `packages/core/tests/importReview.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  analyzeIniImport,
  applyIniImportReview,
  type AuthorProjectConfig,
} from "../src/index.js";

const current: AuthorProjectConfig = {
  schemaVersion: 2,
  project: { template: { output: "Custom_Clash.ini" } },
  memberSets: {},
  proxyGroups: [
    { id: "proxy", name: "Proxy", type: "select", members: [{ builtin: "DIRECT" }] },
  ],
  routes: [
    { id: "final", policy: { group: "proxy" }, source: { type: "final" } },
  ],
  ruleProviders: [],
  vendorRepos: [],
};

const ini = `
[custom]
custom_proxy_group=AI\`select\`[]DIRECT\`.*
ruleset=AI,[]GEOSITE,openai
ruleset=Proxy,[]FINAL
`;

it("previews a replace without mutating the current project", () => {
  const review = analyzeIniImport({ ini, mode: "replace", current });
  expect(review.summary).toMatchObject({ importedGroups: 1, importedRoutes: 2 });
  expect(current.proxyGroups.map((group) => group.id)).toEqual(["proxy"]);
  expect(applyIniImportReview(review).ok).toBe(true);
});

it("merges with collision-safe IDs and keeps one FINAL", () => {
  const review = analyzeIniImport({ ini, mode: "merge", current });
  expect(review.proposed.proxyGroups.some((group) => group.name === "AI")).toBe(true);
  expect(review.proposed.routes.filter((route) => route.source.type === "final")).toHaveLength(1);
  expect(review.summary.conflicts).toBeGreaterThanOrEqual(1);
});

it("refuses to apply unresolved provider placeholders", () => {
  const review = analyzeIniImport({
    ini: "[custom]\nruleset=Proxy,clash-domain:https://example.com/Legacy.mrs,86400\nruleset=Proxy,[]FINAL\n",
    mode: "merge",
    current,
  });
  expect(review.diagnostics.some((diagnostic) => diagnostic.severity === "error")).toBe(true);
  expect(applyIniImportReview(review).ok).toBe(false);
});
```

- [ ] **Step 2: Run import review tests and verify RED**

Run:

```powershell
pnpm exec vitest run packages/core/tests/importReview.test.ts
```

Expected: FAIL because the review API does not exist.

- [ ] **Step 3: Implement import analysis through the v1 migration path**

Create `packages/core/src/config/importReview.ts` with:

```ts
export interface AnalyzeIniImportInput {
  ini: string;
  mode: "replace" | "merge";
  current: AuthorProjectConfig;
}

export interface IniImportReview {
  mode: "replace" | "merge";
  proposed: AuthorProjectConfig;
  diagnostics: Diagnostic[];
  summary: {
    importedGroups: number;
    importedRoutes: number;
    importedProviders: number;
    added: number;
    replaced: number;
    conflicts: number;
  };
}
```

Implementation sequence:

1. Call `parseIniToConfig(input.ini)`.
2. Build a legacy scaffold with local placeholder URLs, imported groups/routes, and placeholder providers; placeholders and their routes are disabled.
3. Call `migrateAuthorProjectConfig(scaffold)`.
4. For `replace`, preserve `current.project`, `current.vendorRepos`, and `current.globalRemove` while replacing imported routing entities with the migration proposal.
5. For `merge`, append imported entities using `stableEntityId` against current IDs; remap every internal imported group/provider reference to collision-safe IDs.
6. Keep the current enabled FINAL and drop the imported FINAL in merge mode; add an info diagnostic `import.final.kept-current`.
7. Carry migration errors into the review and run `validateAuthorProjectConfig` on the proposed result.

`applyIniImportReview` returns `{ ok: false, diagnostics }` when any error exists; otherwise it returns a deep-cloned proposed config. It performs no file IO.

- [ ] **Step 4: Run GREEN, then the full Core phase gate**

Run:

```powershell
pnpm exec vitest run packages/core/tests/importReview.test.ts
pnpm exec vitest run packages/core/tests/schemaV2.test.ts packages/core/tests/authorValidation.test.ts packages/core/tests/migrateV1.test.ts packages/core/tests/normalizeProject.test.ts packages/core/tests/renderEquivalence.test.ts packages/core/tests/authorMutations.test.ts packages/core/tests/importReview.test.ts
pnpm --filter @clash-route-kit/core typecheck
pnpm --filter @clash-route-kit/core build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/core/src/config/importReview.ts packages/core/src/index.ts packages/core/tests/importReview.test.ts
git commit -m "feat: add reviewed ini imports for schema v2"
```

### Task 8: Audit Schema v2 coverage and public type consistency

**Files:**

- Review: `packages/core/src/config/`
- Review: `packages/core/src/routing/`
- Review: `packages/core/src/render/`
- Review: `packages/core/src/index.ts`
- Review: `docs/superpowers/specs/2026-08-10-web-console-workflow-redesign-design.md`

**Interfaces:**

- Verifies: all public names in the roadmap contract exist with one signature.
- Verifies: Core remains browser-safe and IO-free.

- [ ] **Step 1: Search required public exports**

Run:

```powershell
rg -n "parseAuthorProjectConfig|migrateAuthorProjectConfig|normalizeProjectConfig|validateAuthorProjectConfig|validateNormalizedProject|createRenderProject|replaceProxyGroup|analyzeIniImport" packages/core/src/index.ts
```

Expected: each required export appears exactly once.

- [ ] **Step 2: Search forbidden dependencies and legacy name references in new code**

Run:

```powershell
rg -n "node:|react|vite|express|fastify|simple-git" packages/core/src
rg -n "policy: string|options: string\[\]|source\.file" packages/core/src/config packages/core/src/routing packages/core/src/render
```

Expected: the forbidden dependency search returns no matches; legacy string forms appear only inside explicit v1 conversion or final render mapping.

- [ ] **Step 3: Run the full repository test/type gate**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
```

Expected: every command exits 0.

- [ ] **Step 4: Run placeholder and consistency scans on this plan implementation**

Run:

```powershell
rg -n "T[B]D|T[O]DO|implement l[a]ter|fill in d[e]tails" packages/core/src packages/core/tests
git diff --check
git status --short
```

Expected: no placeholders or whitespace errors; only intended phase changes and known user-owned files remain.

- [ ] **Step 5: Commit final test-only corrections if present**

If the audit required corrections, stage only the corrected Core/test files:

```powershell
git add packages/core/src packages/core/tests
git commit -m "test: complete schema v2 coverage"
```

If no correction was required, do not create an empty commit.
