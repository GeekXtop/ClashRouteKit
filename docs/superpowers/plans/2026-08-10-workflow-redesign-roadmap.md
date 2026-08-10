# ClashRouteKit Workflow Redesign Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以五个可独立验收的阶段，把当前 v1 配置和三页控制台演进为统一校验、Schema v2、独立 Local Server、四页工作流，以及本地优先且 GitHub 可选的输出闭环。

**Architecture:** 交付顺序固定为“健康门禁 → Schema v2/Core → Local Server/CLI → Web 工作流 → 输出/GitHub 发布”。每一阶段只依赖前一阶段公开接口，必须在自己的测试、类型检查和配置门禁通过后才能进入下一阶段；任一阶段都不得用 UI 层补救 Core 或 Server 应承担的语义。

**Tech Stack:** pnpm 9.1.4 workspace、Node.js 22、TypeScript 5.8 strict ESM/NodeNext、YAML 2.8、React 19、Vite 7、Ant Design 5、Vitest 3.2、Testing Library、GitHub Actions。

## Global Constraints

- 项目作者配置继续使用 YAML，当前阶段保留一个物理 `config/routes.yaml`，不引入数据库或多文件项目事务。
- 没有 `schemaVersion` 的文件视为 v1；普通加载不得静默写回，v1 → v2 只能经过显式复核和原子应用。
- Schema v2 使用稳定 ID、typed member、`memberSets` 和 provider ID 引用；显示名称不得继续承担关系键职责。
- 作者配置、本地运行设置、规范化领域模型和渲染输入必须保持四层边界。
- `.clashroutekit/local.yaml` 是 ignored 本地设置；CLI 参数 > 环境变量 > 本地设置 > 默认值。
- Core 不依赖 Node 文件系统、HTTP、React 或 Git；`local-server` 负责 Node IO、工作区校验和 HTTP 适配。
- Web 不得直接导入 CLI 源码，也不得在构建期内联仓库中的 `config/routes.yaml`。
- 路由页只编排规则；策略组抽屉是唯一详情入口，命中规则只显示计数和筛选动作，不常驻显示完整 INI。
- 输出页默认打开“设备配置”，同页并列“GitHub 发布（可选）”；本地生成设备配置不依赖 GitHub。
- GitHub 发布只提交并推送 `main`，`publish` 分支由 GitHub Actions 生成；同一发布目标使用 concurrency 取消旧运行。
- 订阅 URL 与 Token 只存在设备配置组件会话内存和必要的瞬时请求中，不写项目文件、本地设置、Git、日志或浏览器持久存储。
- 没有专用 Mihomo 生成器前，启用的 `.mrs` provider 是阻断错误；禁用的不完整导入项不得进入规范化渲染模型。
- Web 草稿允许 warning 保存，不允许 error 写盘；`check`、`generate` 和 GitHub 发布对纯配置 error 使用同一结果。
- 保留策略组、RuleSet、provider 和项目设置抽屉的显式保存语义；取消或关闭不得提交抽屉草稿。
- 桌面验收宽度为 1200px，移动验收宽度为 360px；主任务不得依赖悬停或横向滚动。
- 仓库使用两个空格、双引号、多行尾逗号和显式 `.js` 本地 ESM 导入；修改配置驱动行为必须补充 Vitest。
- 执行前必须检查 `git status --short`；不得回滚或覆盖用户现有修改，也不得把无关的 `.agents/active.md` 或 `config/routes.yaml` 修改带入计划文档提交。

---

## Baseline to Preserve

| Area | Current evidence | Roadmap treatment |
| --- | --- | --- |
| Project config | `config/routes.yaml` 约 41.7 KB / 1435 行，52 个策略组、52 条路由、14 个 provider | 阶段 A 先建立门禁；阶段 B 再迁移为 v2，不先拆物理文件 |
| Validation | CLI `check` 与 Web 草稿校验不一致 | 阶段 A 统一 v1 纯配置诊断；阶段 B 扩展到 v2 |
| Runtime boundary | `apps/web/vite.config.ts` 相对导入 `apps/cli/src` | 阶段 C 新建公开 `@clash-route-kit/local-server` 包 |
| Web boot | `apps/web/src/config.ts` 构建期内联具体 YAML | 阶段 D 改为 API 项目快照和空/损坏/v1/v2 状态 |
| Routing UX | 策略组上下文、抽屉、命中规则和 INI 预览重复 | 阶段 D 删除只读详情与常驻预览，抽屉成为唯一详情入口 |
| Output UX | 本地模板、GitHub、设备配置纵向排列并暗示依赖 | 阶段 E 改为默认设备配置 + 可选 GitHub 发布双标签 |
| GitHub flow | 本地按钮声称推送 `publish`，实际 `git push` 当前分支 | 阶段 E 强制 `main`，Actions 负责 `publish`，并追踪 workflow 状态 |

## Plan Set and Dependency Order

```text
Plan A: config-health-gates
        ↓ exports Diagnostic + validateLegacyProjectConfig
Plan B: schema-v2-core
        ↓ exports AuthorProjectConfig + normalize/migrate/mutations
Plan C: local-server-boundary
        ↓ exports repositories, runtime settings, HTTP/Git/catalog APIs
Plan D: web-workflow-redesign
        ↓ exports four-page UI and project/routing/library flows
Plan E: output-github-publish
        ↓ completes local device output and optional GitHub publishing
```

1. [Config Health Gates](./2026-08-10-config-health-gates.md)
2. [Schema v2 and Core](./2026-08-10-schema-v2-core.md)
3. [Local Server and CLI Boundary](./2026-08-10-local-server-boundary.md)
4. [Web Workflow Redesign](./2026-08-10-web-workflow-redesign.md)
5. [Output and GitHub Publish](./2026-08-10-output-github-publish.md)

## Cross-Plan Interface Contract

These names are fixed across the five plans. A later phase may add fields, but it must not silently rename an earlier public interface.

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
): boolean;

export function validateLegacyProjectConfig(
  config: RouteKitProjectConfig,
): Diagnostic[];
```

```ts
export type AuthorProjectDocument =
  | { version: 1; config: RouteKitProjectConfig }
  | { version: 2; config: AuthorProjectConfig };

export function parseAuthorProjectConfig(
  yaml: string,
): ParseResult<AuthorProjectDocument>;

export function migrateAuthorProjectConfig(
  config: RouteKitProjectConfig,
): MigrationReview;

export function normalizeProjectConfig(
  config: AuthorProjectConfig,
): NormalizeResult;

export function validateAuthorProjectConfig(
  config: AuthorProjectConfig,
): Diagnostic[];

export function validateNormalizedProject(
  project: NormalizedProject,
): Diagnostic[];
```

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

```ts
export interface RuntimeContext {
  publishBaseUrl: string;
  subconverterUrl?: string;
}

export function createRenderProject(
  project: NormalizedProject,
  runtime: RuntimeContext,
): RenderProject;
```

```ts
export type ProjectSnapshot =
  | { state: "missing"; diagnostics: Diagnostic[] }
  | { state: "invalid"; revision: string; yaml: string; diagnostics: Diagnostic[] }
  | { state: "legacy"; revision: string; yaml: string; config: RouteKitProjectConfig; diagnostics: Diagnostic[] }
  | { state: "ready"; revision: string; yaml: string; config: AuthorProjectConfig; diagnostics: Diagnostic[] };

export interface ProjectRepository {
  read(): Promise<ProjectSnapshot>;
  save(input: SaveProjectInput): Promise<ProjectSnapshot>;
  applyMigration(input: ApplyMigrationInput): Promise<ProjectSnapshot>;
}
```

```ts
export type ProjectView = "project" | "library" | "routing" | "output";

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
```

## Phase Gates

### Gate A — Current v1 is trustworthy

- Core deep parser rejects invalid nested v1 data.
- Core pure diagnostics cover duplicate/missing references, cycles, URL node filters, FINAL, provider state, `.mrs` and behavior mismatch.
- Web save, CLI `check`, `generate` and current publish action consume the same pure diagnostics.
- Current `config/routes.yaml` has no executable `.mrs`, no URL node filter and no enabled empty provider.
- Missing non-authoritative GEOSITE catalog entries are warnings; `tag@attribute` checks use the base tag.

Run:

```powershell
pnpm exec vitest run packages/core/tests/configDocument.test.ts packages/core/tests/legacyValidation.test.ts apps/cli/tests/cli.test.ts apps/web/tests/projectController.test.ts
pnpm typecheck
pnpm check
pnpm generate
```

Expected: every command exits 0; `pnpm check` may print warning diagnostics but no error diagnostics.

### Gate B — Schema v2 is semantically complete

- v2 deep parser, serializer, migration, normalization, stable-ID mutation and dependency graphs pass.
- Valid v1 fixtures produce render-equivalent v2 output.
- Invalid migration items remain unresolved until explicitly disabled, mapped or dropped.
- Renaming a strategy group changes only `name`; references continue to use its stable `id`.

Run:

```powershell
pnpm exec vitest run packages/core/tests/schemaV2.test.ts packages/core/tests/migrateV1.test.ts packages/core/tests/normalizeProject.test.ts packages/core/tests/authorMutations.test.ts packages/core/tests/renderEquivalence.test.ts
pnpm --filter @clash-route-kit/core typecheck
pnpm --filter @clash-route-kit/core build
```

Expected: all tests pass and Core builds without Node/DOM type dependencies.

### Gate C — Node IO has one owner

- `@clash-route-kit/local-server` owns atomic config IO, local settings, workspace diagnostics, catalog/vendor/rule-file operations, generation, Git and HTTP.
- CLI is a command adapter over Core and Local Server.
- Vite imports the Local Server package public entry; no Web file imports `apps/cli/src`.
- `.clashroutekit/local.yaml` precedence and ignored status are tested.

Run:

```powershell
pnpm exec vitest run packages/local-server/tests apps/cli/tests apps/web/tests/viteConfig.test.ts
pnpm typecheck
pnpm build
rg -n "apps/cli/src|\.\./cli/src" apps/web packages/local-server
```

Expected: tests/typecheck/build pass; `rg` returns exit code 1 with no matches.

### Gate D — Four work domains are usable

- Navigation is exactly `项目 / 规则库 / 路由 / 输出`.
- Missing, invalid, v1 and v2 projects have explicit states; import is the Project page primary action.
- Import and migration use preview + explicit apply, with no partial write on failure.
- Routing has one group-detail entry, no copied inbound rule list and no permanent INI preview.
- Library surfaces incomplete and blocking providers before browsing.

Run:

```powershell
pnpm exec vitest run apps/web/tests/projectPage.test.tsx apps/web/tests/importFlow.test.tsx apps/web/tests/libraryPage.test.tsx apps/web/tests/routingPage.test.tsx apps/web/tests/proxyGroupDrawer.test.tsx
pnpm --filter @clash-route-kit/web typecheck
pnpm --filter @clash-route-kit/web build
```

Expected: tests, typecheck and build pass.

### Gate E — Local output and optional GitHub publish both close

- Output defaults to Device Config and works with only the local template.
- Advanced conversion options are collapsed by default and retain all existing conversion parameters.
- Subscription data is absent from project saves, local settings, logs and persistent storage.
- GitHub publish refuses non-`main`, reports validation/commit/push/Actions separately and marks remote latest only after Actions success.
- `publish.yml` contains concurrency and remains the only writer of the `publish` branch.

Run:

```powershell
pnpm exec vitest run packages/local-server/tests/deviceConfig.test.ts packages/local-server/tests/githubPublish.test.ts apps/web/tests/outputPage.test.tsx apps/web/tests/deviceConfigTab.test.tsx apps/web/tests/githubPublishTab.test.tsx
pnpm test
pnpm typecheck
pnpm build
pnpm check
pnpm generate
```

Expected: every command exits 0.

## Design Acceptance Coverage

| # | Design acceptance criterion | Owning plan/task | Verification gate |
| --- | --- | --- | --- |
| 1 | Import is the Project page primary action | Plan D Tasks 2–3 | Gate D `projectPage.test.tsx` and `importFlow.test.tsx` |
| 2 | v1 is never silently rewritten; review shows issues and semantics | Plan B Task 4, Plan C Task 2, Plan D Task 3 | Gates B–D migration tests and atomic repository tests |
| 3 | Stable IDs survive display-name changes | Plan B Tasks 1 and 6 | Gate B `authorMutations.test.ts` |
| 4 | Repeated members use one `memberSets` declaration without reordering | Plan B Tasks 4–5 | Gate B migration and normalization tests |
| 5 | Invalid nested config is rejected by Core | Plan A Task 2, Plan B Task 2 | Gates A–B parser tests |
| 6 | Web save, CLI check, generate and publish share pure errors | Plan A Tasks 3–5, Plan E Task 4 | Gates A and E diagnostic assertions |
| 7 | Empty enabled provider, `.mrs`, missing ref and cycles block generation | Plan A Task 3, Plan B Task 3 | Gates A–B validation tests |
| 8 | LAN/SubConverter values live outside versioned author config | Plan B Task 4, Plan C Task 2 | Gates B–C migration/local-settings tests |
| 9 | Group members, downstream refs and health checks have one drawer editor | Plan D Task 5 | Gate D `proxyGroupDrawer.test.tsx` |
| 10 | Inbound rules remain only in the main route list | Plan D Task 5 | Gate D routing/drawer tests |
| 11 | Routing and Output do not permanently duplicate full INI | Plan D Task 5, Plan E Tasks 3 and 5 | Gates D–E component tests |
| 12 | Local device config works without GitHub | Plan E Tasks 1–3 | Gate E local-only device tests and Scenario 1 |
| 13 | Output defaults to Device Config beside optional GitHub Publish | Plan E Task 5 | Gate E `outputPage.test.tsx` |
| 14 | Publish pushes `main`; Actions alone writes `publish` with concurrency | Plan E Tasks 4–5 | Gate E GitHub/workflow assertions |
| 15 | Web imports neither CLI source nor bundled `routes.yaml` | Plan C Task 6, Plan D Task 1 | Gates C–D boundary searches |
| 16 | Subscription URLs/Tokens are not persisted or logged | Plan E Tasks 2, 3 and 6 | Gate E privacy tests and searches |
| 17 | All four tasks work at 1200px and 360px without hover/horizontal-scroll dependency | Plan D Task 6, Plan E Task 6 | Browser acceptance in Gates D–E |

Every specification acceptance item has exactly one primary owning task and at least one executable gate. Cross-cutting rows may cite a second plan only where the boundary itself is the acceptance condition.

## Execution Tasks

### Task 1: Complete and review Plan A

**Files:**

- Execute: `docs/superpowers/plans/2026-08-10-config-health-gates.md`
- Review: `packages/core/src/config/`, `apps/cli/src/`, `apps/web/src/`, `config/routes.yaml`

**Interfaces:**

- Produces: `Diagnostic`, `hasDiagnosticErrors`, `validateLegacyProjectConfig`.
- Produces: a v1 configuration for which `pnpm check` and `pnpm generate` are trustworthy gates.

- [ ] **Step 1: Execute every unchecked task in Plan A in order**

Run the exact RED/GREEN commands and commits recorded in Plan A.

- [ ] **Step 2: Run Gate A**

Run the Gate A command block above.

Expected: exit code 0 for all commands and no error-severity diagnostics.

- [ ] **Step 3: Record the phase boundary commit**

```powershell
git log -1 --oneline
git status --short
```

Expected: the latest commit is the final Plan A commit; only known user-owned changes may remain.

### Task 2: Complete and review Plan B

**Files:**

- Execute: `docs/superpowers/plans/2026-08-10-schema-v2-core.md`
- Review: `packages/core/src/config/`, `packages/core/src/routing/`, `packages/core/src/render/`

**Interfaces:**

- Consumes: Plan A diagnostics and generic dependency graph.
- Produces: all Schema v2, migration, normalization, mutation and render-project interfaces listed above.

- [ ] **Step 1: Execute every unchecked task in Plan B in order**

Run the exact RED/GREEN commands and commits recorded in Plan B.

- [ ] **Step 2: Run Gate B**

Run the Gate B command block above.

Expected: Core tests and build pass without Node/DOM imports.

- [ ] **Step 3: Inspect the public Core surface**

```powershell
rg -n "parseAuthorProjectConfig|migrateAuthorProjectConfig|normalizeProjectConfig|validateAuthorProjectConfig|validateNormalizedProject|createRenderProject" packages/core/src/index.ts
```

Expected: all six public functions are exported exactly once.

### Task 3: Complete and review Plan C

**Files:**

- Execute: `docs/superpowers/plans/2026-08-10-local-server-boundary.md`
- Review: `packages/local-server/`, `apps/cli/`, `apps/web/vite.config.ts`

**Interfaces:**

- Consumes: Core author/normalized/render interfaces.
- Produces: `ProjectRepository`, `ProjectSnapshot`, local settings resolution, workspace validation and public HTTP handler.

- [ ] **Step 1: Execute every unchecked task in Plan C in order**

Run the exact RED/GREEN commands and commits recorded in Plan C.

- [ ] **Step 2: Run Gate C**

Run the Gate C command block above.

Expected: Local Server, CLI and Vite boundary tests pass; no Web-to-CLI source import remains.

- [ ] **Step 3: Inspect dependency direction**

```powershell
pnpm list -r --depth 0
rg -n "node:|react|vite|git" packages/core/src
```

Expected: `@clash-route-kit/local-server` appears as a workspace package; the Core search has no forbidden runtime imports.

### Task 4: Complete and review Plan D

**Files:**

- Execute: `docs/superpowers/plans/2026-08-10-web-workflow-redesign.md`
- Review: `apps/web/src/features/project/`, `apps/web/src/features/library/`, `apps/web/src/features/routing/`, `apps/web/src/shared/`

**Interfaces:**

- Consumes: Core v2 and Local Server project/catalog APIs.
- Produces: four-page navigation, Project import/migration flows, stable-ID Library and Routing workflows.

- [ ] **Step 1: Execute every unchecked task in Plan D in order**

Run the exact RED/GREEN commands and commits recorded in Plan D.

- [ ] **Step 2: Run Gate D**

Run the Gate D command block above.

Expected: component tests, Web typecheck and Web build pass.

- [ ] **Step 3: Run the two-width browser acceptance in Plan D**

Start the development server with `pnpm dev`, then complete the 1200px and 360px checks specified in Plan D.

Expected: no console errors, no duplicate main scroll area, and every primary action remains keyboard reachable.

### Task 5: Complete and review Plan E

**Files:**

- Execute: `docs/superpowers/plans/2026-08-10-output-github-publish.md`
- Review: `apps/web/src/features/output/`, `packages/local-server/src/output/`, `packages/local-server/src/git/`, `.github/workflows/publish.yml`

**Interfaces:**

- Consumes: final project snapshot, runtime settings, render project and Git adapters.
- Produces: `TemplateSourceStatus`, device config generation and GitHub publish/Actions status APIs.

- [ ] **Step 1: Execute every unchecked task in Plan E in order**

Run the exact RED/GREEN commands and commits recorded in Plan E.

- [ ] **Step 2: Run Gate E**

Run the Gate E command block above.

Expected: the full repository gate passes.

- [ ] **Step 3: Run both end-to-end scenarios**

Scenario 1: migrate a v1 project, repair rules, edit routing, and generate a device configuration without configuring GitHub.

Scenario 2: on `main`, review changes, publish through GitHub Actions, wait for success, and generate a device configuration from the remote template.

Expected: Scenario 1 never requires GitHub; Scenario 2 marks the remote template latest only after the matching Actions run succeeds.

## Final Repository Acceptance

- [ ] `pnpm test` exits 0.
- [ ] `pnpm typecheck` exits 0.
- [ ] `pnpm build` exits 0.
- [ ] `pnpm check` exits 0 with no error-severity diagnostics.
- [ ] `pnpm generate` exits 0 and only creates reproducible ignored output.
- [ ] `rg -n "apps/cli/src|routes.yaml\?raw|bundledProjectConfig" apps/web` returns no matches.
- [ ] `rg -n "构建并推送 publish 分支|发布到 GitHub" apps/web/src` returns no obsolete action copy.
- [ ] `rg -n "localStorage|sessionStorage" apps/web/src/features/output` returns no subscription persistence.
- [ ] `git diff --check` exits 0.
- [ ] Four-page browser acceptance passes at 1200px and 360px.
- [ ] The design acceptance criteria in `docs/superpowers/specs/2026-08-10-web-console-workflow-redesign-design.md` each map to a completed phase gate.
