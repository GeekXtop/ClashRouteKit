# Routes 原语优先编辑器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将配置模型和 Web 编辑器从 `modules/proxyGroups` 抽象切换为直接编辑 SubConverter 的 `ruleset` 与 `custom_proxy_group`。

**Architecture:** 新 schema 使用 `ruleSets` 和 `customProxyGroups` 作为一等字段：每个 `ruleSets[]` item 对应最终 INI 中一条 `ruleset=...`，每个 `customProxyGroups[]` item 对应一条 `custom_proxy_group=...`。这是破坏式直接替换：Core 不再读取旧 `modules/proxyGroups`，CLI/Web 默认配置文件改为 `config/routes.yaml`，Web UI 只展示新命名和新编辑器。

**Tech Stack:** TypeScript、React 19、Vite、Vitest、`yaml`、`@clash-route-kit/core`、本地 Vite middleware、Playwright MCP 浏览器 QA。

---

## 背景判断

当前实现把最终 INI 拆成两层工程抽象：

```text
modules     -> ruleset=...
proxyGroups -> custom_proxy_group=...
```

这导致 UI 让用户编辑 `Modules` 和 `Policies`，但用户实际关心的是 SubConverter 文件中的：

```ini
ruleset=AI,[]GEOSITE,openai
custom_proxy_group=AI`select`[]Proxy`[]Auto`[]Direct
```

下一阶段要大改这个心智模型。`ruleProviders` 仍然保留，因为它不是 INI 原语，而是本项目生成 `output/rules/*.yaml` 的数据源，供 `ruleset` 引用。

## 新配置模型

目标 YAML 改为 `config/routes.yaml`，不再保留 `config/modules.yaml` 作为默认路径。字段改为：

```yaml
customProxyGroups:
  - name: Proxy
    type: select
    options:
      - Auto
      - Direct
    nodeFilters:
      - .*

ruleSets:
  - id: ai-provider
    enabled: true
    policy: AI
    source:
      type: rule-provider
      behavior: domain
      file: AI_Domain.yaml
      interval: 28800
  - id: ai-openai
    policy: AI
    source:
      type: geosite
      value: openai
  - id: china-ip
    policy: Direct
    source:
      type: geoip
      value: cn
      noResolve: true
  - id: final
    policy: 🐟 漏网之鱼
    source:
      type: final
```

对应输出：

```ini
ruleset=AI,clash-domain:<publishBaseUrl>/rules/AI_Domain.yaml,28800
ruleset=AI,[]GEOSITE,openai
ruleset=Direct,[]GEOIP,cn,no-resolve
ruleset=🐟 漏网之鱼,[]FINAL
custom_proxy_group=Proxy`select`[]Auto`[]Direct`.*
```

## 命名决策

- UI 中 `Modules` 改为 `RuleSets`。
- UI 中 `Policies` 改为 `Custom Proxy Groups`。
- 代码中新增 `RuleSet`、`RuleSetSource`、`CustomProxyGroup`。
- `policy` 字段暂时保留，因为 SubConverter `ruleset=<policy>,...` 第一段就是策略组名；UI 文案显示为“目标策略组”。
- `ruleProviders` 保留现名，说明其作用是生成 provider YAML，不等同于 `ruleset`。
- 不保留 legacy schema：`modules`、`proxyGroups`、`RouteModule`、`ProxyGroup` 直接删除或改名，不提供读取兼容。

## 文件结构

- 修改 `packages/core/src/types.ts`
  新增 routes-first 类型，删除旧 `RouteModule` / `ProxyGroup` schema。
- 修改 `packages/core/src/configDocument.ts`
  只接受 `customProxyGroups` / `ruleSets` 新 schema。
- 修改 `packages/core/src/ini.ts`
  改为从 `ruleSets` 和 `customProxyGroups` 渲染 INI。
- 修改 `packages/core/tests/configDocument.test.ts`
  覆盖新 schema 解析、序列化和旧 schema 拒绝。
- 修改 `packages/core/tests/renderIni.test.ts`
  覆盖每类 `ruleset` source 和 `custom_proxy_group` 输出。
- 删除 `config/modules.yaml`
  不保留旧配置文件。
- 创建 `config/routes.yaml`
  直接写入 `customProxyGroups` / `ruleSets` 新 schema。
- 修改 `apps/cli/src/index.ts`
  默认配置文件从 `config/modules.yaml` 改为 `config/routes.yaml`。
- 修改 `apps/web/vite.config.ts`
  默认配置文件从 `config/modules.yaml` 改为 `config/routes.yaml`。
- 修改 `apps/web/src/config.ts`
  raw import 从 `config/modules.yaml` 改为 `config/routes.yaml`。
- 修改 `apps/web/src/configMutations.ts`
  用 `ruleSet` 和 `customProxyGroup` mutation helper 替代 module/policy helper。
- 修改 `apps/web/tests/configMutations.test.ts`
  改测新 helper。
- 修改 `apps/web/src/draftValidation.ts`
  校验 `ruleSets` 和 `customProxyGroups`。
- 修改 `apps/web/tests/draftValidation.test.ts`
  覆盖新 schema 诊断。
- 修改 `apps/web/src/projectController.ts`
  视图状态从 `modules/policies` 改为 `ruleSets/customProxyGroups`。
- 修改 `apps/web/tests/projectController.test.ts`
  更新 selection 和 save readiness 测试。
- 创建 `apps/web/src/components/RuleSetList.tsx`
  替代 `ModuleList.tsx`。
- 创建 `apps/web/src/components/RuleSetEditor.tsx`
  替代 `ModuleEditor.tsx`。
- 创建 `apps/web/src/components/CustomProxyGroupList.tsx`
  替代 `PolicyList.tsx`。
- 创建 `apps/web/src/components/CustomProxyGroupEditor.tsx`
  替代 `PolicyEditor.tsx`。
- 创建 `apps/web/src/components/CustomProxyGroupWorkspace.tsx`
  替代 `PolicyWorkspace.tsx`。
- 修改 `apps/web/src/components/AppShell.tsx`
  导航改为 RuleSets / Custom Proxy Groups。
- 修改 `apps/web/src/components/WorkspaceRouter.tsx`
  接入新组件和新回调。
- 修改 `apps/web/src/routeSummary.ts`
  摘要行直接对应 `ruleSets`。
- 修改 `apps/web/src/components/PreviewWorkspace.tsx`
  预览显示 `ruleset=` 行级结果。
- 修改 `apps/web/src/components/InspectorPanel.tsx`
  文案改为 SubConverter 原语。
- 修改 `apps/web/src/App.tsx`
  连接新 mutation helper 和 selection。
- 修改 `apps/web/src/styles.css`
  只做新组件必要布局，不做视觉大重构。
- 修改 `README.md`
  文档说明 `ruleSets/customProxyGroups` 与最终 INI 的一一映射。
- 修改 `docs/superpowers/plans/2026-06-06-web-editor-hardening.md`
  标记其 UI 稳定化任务被本计划吸收和改序。

## 任务 1：引入 routes-first Core 类型

**文件：**
- 修改：`packages/core/src/types.ts`
- 修改：`packages/core/src/index.ts`

- [ ] **步骤 1：写类型替换补丁**

在 `packages/core/src/types.ts` 中新增：

```ts
export interface RuleProviderRuleSetSource {
  type: "rule-provider";
  behavior: ProviderBehavior;
  file: string;
  interval?: number;
}

export interface GeositeRuleSetSource {
  type: "geosite";
  value: string;
}

export interface GeoipRuleSetSource {
  type: "geoip";
  value: string;
  noResolve?: boolean;
}

export interface FinalRuleSetSource {
  type: "final";
}

export type RuleSetSource =
  | RuleProviderRuleSetSource
  | GeositeRuleSetSource
  | GeoipRuleSetSource
  | FinalRuleSetSource;

export interface RuleSet {
  id: string;
  enabled?: boolean;
  policy: string;
  source: RuleSetSource;
}

export interface CustomProxyGroup {
  name: string;
  type: "select" | "url-test" | "fallback" | "load-balance";
  options: string[];
  nodeFilters?: string[];
  url?: string;
  interval?: number;
  tolerance?: number;
}

export interface RouteKitConfig {
  publishBaseUrl: string;
  customProxyGroups: CustomProxyGroup[];
  ruleSets: RuleSet[];
}
```

`RouteKitProjectConfig` 继续继承新 `RouteKitConfig`：

```ts
export interface RouteKitProjectConfig extends RouteKitConfig {
  template: {
    output: string;
  };
  vendorRepos: VendorRepoConfig[];
  ruleProviders?: RuleProviderConfig[];
}
```

- [ ] **步骤 2：确认 typecheck 失败点**

运行：

```powershell
pnpm typecheck
```

预期：Web 和 core 多处因为仍读取 `config.modules`、`config.proxyGroups` 失败。先不要修 UI，只确认直接替换影响面。

## 任务 2：让 Config Document 只接受新 schema

**文件：**
- 修改：`packages/core/src/configDocument.ts`
- 修改：`packages/core/tests/configDocument.test.ts`

- [ ] **步骤 1：编写失败测试**

将 `packages/core/tests/configDocument.test.ts` 的旧 `proxyGroups/modules` fixture 替换为新 schema，并增加旧 schema 拒绝测试：

```ts
const yaml = [
  "publishBaseUrl: http://127.0.0.1:8787",
  "template:",
  "  output: Custom_Clash.ini",
  "vendorRepos: []",
  "customProxyGroups:",
  "  - name: Proxy",
  "    type: select",
  "    options:",
  "      - DIRECT",
  "ruleSets:",
  "  - id: ai-provider",
  "    policy: Proxy",
  "    source:",
  "      type: rule-provider",
  "      behavior: domain",
  "      file: AI_Domain.yaml",
  "  - id: ai-openai",
  "    policy: Proxy",
  "    source:",
  "      type: geosite",
  "      value: openai",
  "  - id: final",
  "    policy: Proxy",
  "    source:",
  "      type: final",
  "",
].join("\n");

it("parses routes-first config documents", () => {
  const config = parseRouteKitConfig(yaml);

  expect(config.customProxyGroups).toEqual([
    { name: "Proxy", type: "select", options: ["DIRECT"] },
  ]);
  expect(config.ruleSets).toEqual([
    {
      id: "ai-provider",
      policy: "Proxy",
      source: { type: "rule-provider", behavior: "domain", file: "AI_Domain.yaml" },
    },
    {
      id: "ai-openai",
      policy: "Proxy",
      source: { type: "geosite", value: "openai" },
    },
    {
      id: "final",
      policy: "Proxy",
      source: { type: "final" },
    },
  ]);
});

it("serializes only routes-first fields", () => {
  const config = parseRouteKitConfig(yaml);
  const yaml = serializeRouteKitConfig(config);

  expect(yaml).toContain("customProxyGroups:");
  expect(yaml).toContain("ruleSets:");
  expect(yaml).not.toContain("proxyGroups:");
  expect(yaml).not.toContain("modules:");
});

it("rejects legacy modules/proxyGroups documents", () => {
  expect(() =>
    parseRouteKitConfig([
      "publishBaseUrl: http://127.0.0.1:8787",
      "template:",
      "  output: Custom_Clash.ini",
      "vendorRepos: []",
      "proxyGroups: []",
      "modules: []",
      "",
    ].join("\n")),
  ).toThrow("Invalid RouteKit project config");
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```powershell
pnpm test -- packages/core/tests/configDocument.test.ts
```

预期：失败，因为 parser 仍要求 `proxyGroups/modules`。

- [ ] **步骤 3：实现严格新 schema parser**

将 `packages/core/src/configDocument.ts` 改为只校验新字段：

```ts
function assertRouteKitProjectConfig(value: unknown): asserts value is RouteKitProjectConfig {
  if (!isRecord(value)) throw new Error("Invalid RouteKit project config: expected object");

  const template = value.template;
  if (
    typeof value.publishBaseUrl !== "string" ||
    !isRecord(template) ||
    typeof template.output !== "string" ||
    !Array.isArray(value.vendorRepos) ||
    !Array.isArray(value.customProxyGroups) ||
    !Array.isArray(value.ruleSets)
  ) {
    throw new Error("Invalid RouteKit project config");
  }
}
```

更新 `parseRouteKitConfig` 和 `serializeRouteKitConfig`：

```ts
export function parseRouteKitConfig(text: string): RouteKitProjectConfig {
  const parsed = YAML.parse(text) as unknown;
  assertRouteKitProjectConfig(parsed);
  return parsed;
}

export function serializeRouteKitConfig(config: RouteKitProjectConfig): string {
  return YAML.stringify(config, { lineWidth: 0 }).replace(/\n?$/, "\n");
}
```

- [ ] **步骤 4：验证 core config tests**

运行：

```powershell
pnpm test -- packages/core/tests/configDocument.test.ts
```

预期：通过。

## 任务 3：改造 INI 渲染为一项一行

**文件：**
- 修改：`packages/core/src/ini.ts`
- 修改：`packages/core/tests/renderIni.test.ts`

- [ ] **步骤 1：编写失败测试**

在 `packages/core/tests/renderIni.test.ts` 增加：

```ts
it("renders ruleSets directly as SubConverter ruleset lines", () => {
  const ini = renderIni({
    publishBaseUrl: "https://raw.githubusercontent.com/acme/routes/publish",
    customProxyGroups: [
      { name: "AI", type: "select", options: ["Proxy", "Direct"] },
    ],
    ruleSets: [
      {
        id: "ai-provider",
        policy: "AI",
        source: { type: "rule-provider", behavior: "domain", file: "AI_Domain.yaml", interval: 300 },
      },
      {
        id: "ai-geosite",
        policy: "AI",
        source: { type: "geosite", value: "openai" },
      },
      {
        id: "telegram-ip",
        policy: "Proxy",
        source: { type: "geoip", value: "telegram", noResolve: true },
      },
      {
        id: "final",
        policy: "AI",
        source: { type: "final" },
      },
    ],
  });

  expect(ini).toContain("ruleset=AI,clash-domain:https://raw.githubusercontent.com/acme/routes/publish/rules/AI_Domain.yaml,300");
  expect(ini).toContain("ruleset=AI,[]GEOSITE,openai");
  expect(ini).toContain("ruleset=Proxy,[]GEOIP,telegram,no-resolve");
  expect(ini).toContain("ruleset=AI,[]FINAL");
  expect(ini).toContain("custom_proxy_group=AI`select`[]Proxy`[]Direct");
});

it("skips disabled ruleSet entries", () => {
  const ini = renderIni({
    publishBaseUrl: "http://127.0.0.1:8787",
    customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
    ruleSets: [
      { id: "off", enabled: false, policy: "Proxy", source: { type: "geosite", value: "youtube" } },
    ],
  });

  expect(ini).not.toContain("youtube");
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```powershell
pnpm test -- packages/core/tests/renderIni.test.ts
```

预期：失败，因为 `renderIni` 仍读取 `modules/proxyGroups`。

- [ ] **步骤 3：实现新渲染**

将 `packages/core/src/ini.ts` 改为：

```ts
import type { CustomProxyGroup, ProviderBehavior, RouteKitConfig, RuleSet } from "./types.js";

function providerKind(behavior: ProviderBehavior): string {
  if (behavior === "domain") return "clash-domain";
  if (behavior === "classical") return "clash-classic";
  if (behavior === "ipcidr") return "clash-ipcidr";
  throw new Error(`Unsupported provider behavior: ${behavior satisfies never}`);
}

function publishRulesUrl(baseUrl: string, file: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/rules/${file}`;
}

function renderRuleSet(ruleSet: RuleSet, publishBaseUrl: string): string[] {
  if (ruleSet.enabled === false) return [];

  const source = ruleSet.source;
  if (source.type === "rule-provider") {
    return [
      `ruleset=${ruleSet.policy},${providerKind(source.behavior)}:${publishRulesUrl(
        publishBaseUrl,
        source.file,
      )},${source.interval ?? 28800}`,
    ];
  }
  if (source.type === "geosite") {
    return [`ruleset=${ruleSet.policy},[]GEOSITE,${source.value}`];
  }
  if (source.type === "geoip") {
    return [`ruleset=${ruleSet.policy},[]GEOIP,${source.value}${source.noResolve !== false ? ",no-resolve" : ""}`];
  }
  if (source.type === "final") {
    return [`ruleset=${ruleSet.policy},[]FINAL`];
  }
  throw new Error(`Unsupported ruleSet source: ${String(source satisfies never)}`);
}

function renderCustomProxyGroup(group: CustomProxyGroup): string {
  const optionRefs = group.options.map((option) => `[]${option}`);
  const options = [...optionRefs, ...(group.nodeFilters ?? [])].join("`");
  if (group.type === "select") {
    return `custom_proxy_group=${group.name}\`select\`${options}`;
  }

  const url = group.url ?? "https://cp.cloudflare.com/generate_204";
  const interval = group.interval ?? 300;
  const tolerance = group.tolerance ?? 50;
  return `custom_proxy_group=${group.name}\`${group.type}\`${options}\`${url}\`${interval},,${tolerance}`;
}

export function renderIni(config: RouteKitConfig): string {
  const ruleLines = config.ruleSets.flatMap((ruleSet) => renderRuleSet(ruleSet, config.publishBaseUrl));
  const groupLines = config.customProxyGroups.map(renderCustomProxyGroup);

  return [
    "; Generated by ClashRouteKit",
    "[custom]",
    "",
    ...ruleLines,
    "",
    ...groupLines,
    "",
    "enable_rule_generator=true",
    "overwrite_original_rules=true",
    "",
  ].join("\n");
}
```

- [ ] **步骤 4：验证 core 渲染测试**

运行：

```powershell
pnpm test -- packages/core/tests/renderIni.test.ts packages/core/tests/configDocument.test.ts
```

预期：通过。

## 任务 4：直接替换配置文件

**文件：**
- 删除：`config/modules.yaml`
- 创建：`config/routes.yaml`
- 修改：`apps/cli/src/index.ts`
- 修改：`apps/web/vite.config.ts`
- 修改：`apps/web/src/config.ts`
- 修改：`apps/web/tests/localProject.test.ts`
- 修改：`apps/web/tests/routeKitApi.test.ts`
- 修改：`apps/cli/tests/cli.test.ts`

- [ ] **步骤 1：创建新配置文件并删除旧文件**

创建 `config/routes.yaml`，内容使用新 schema：

```yaml
customProxyGroups:
ruleSets:
```

直接按当前业务含义展开：

- 当前策略组写入 `customProxyGroups[]`。
- 每个 provider 引用写成一个独立 `ruleSets[]` item：
  `source.type: rule-provider`、`source.behavior`、`source.file`、`source.interval`。
- 每个 GEOSITE 写成一个独立 `ruleSets[]` item：
  `source.type: geosite`、`source.value`。
- 每个 GEOIP 写成一个独立 `ruleSets[]` item：
  `source.type: geoip`、`source.value`、`source.noResolve: true`。
- FINAL 写成 `source.type: final`。
- 不启用的规则行带 `enabled: false`。
- `id` 使用稳定可读形式，例如 `ai-provider-ai-domain`、`ai-geosite-openai`、`china-geoip-cn`。

删除 `config/modules.yaml`，不要留下同内容副本。

- [ ] **步骤 2：更新默认配置路径**

在 `apps/cli/src/index.ts`：

```ts
const configFile = process.env.CLASH_ROUTE_KIT_CONFIG ?? "config/routes.yaml";
```

在 `apps/web/vite.config.ts`：

```ts
const configFile = process.env.CLASH_ROUTE_KIT_CONFIG ?? "config/routes.yaml";
```

在 `apps/web/src/config.ts`：

```ts
import routesYaml from "../../../config/routes.yaml?raw";

export const bundledProjectConfig = parseRouteKitConfig(routesYaml);
export const bundledProjectConfigYaml = routesYaml;
```

- [ ] **步骤 3：更新测试 fixture 和路径**

在 `apps/web/tests/localProject.test.ts`、`apps/web/tests/routeKitApi.test.ts` 和 `apps/cli/tests/cli.test.ts` 中把 fixture 的 `proxyGroups/modules` 替换为：

```ts
customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
ruleSets: [{ id: "ai-geosite-openai", policy: "Proxy", source: { type: "geosite", value: "openai" } }],
```

所有默认路径断言从 `config/modules.yaml` 改为 `config/routes.yaml`。测试里临时文件名从 `modules.yaml` 改为 `routes.yaml`。

- [ ] **步骤 4：验证配置读写**

运行：

```powershell
pnpm test -- packages/core/tests/configDocument.test.ts apps/web/tests/localProject.test.ts apps/web/tests/routeKitApi.test.ts
pnpm test -- apps/cli/tests/cli.test.ts
pnpm check
pnpm generate
```

预期：配置可以读取，CLI check/generate 成功。

## 任务 5：重写 Web Mutation Helper

**文件：**
- 修改：`apps/web/src/configMutations.ts`
- 修改：`apps/web/tests/configMutations.test.ts`

- [ ] **步骤 1：编写新 helper 测试**

将 `apps/web/tests/configMutations.test.ts` 的 module/policy 测试替换为：

```ts
import {
  addRuleSet,
  createRuleSet,
  deleteRuleSet,
  renameCustomProxyGroup,
  setCustomProxyGroupListField,
  updateCustomProxyGroup,
  updateRuleSet,
} from "../src/configMutations.js";

it("creates and updates ruleSet entries immutably", () => {
  const config = createConfig();
  const created = createRuleSet(config, { sourceType: "geosite" });
  const added = addRuleSet(config, created);
  const updated = updateRuleSet(added, created.id, {
    policy: "Proxy",
    source: { type: "geosite", value: "openai" },
  });

  expect(created).toEqual({
    id: "ruleset",
    policy: "Proxy",
    source: { type: "geosite", value: "" },
  });
  expect(updated.ruleSets.at(-1)).toEqual({
    id: "ruleset",
    policy: "Proxy",
    source: { type: "geosite", value: "openai" },
  });
  expect(config.ruleSets).toHaveLength(1);
});

it("renames custom proxy groups and updates ruleset policy references", () => {
  const config = createConfig();
  const renamed = renameCustomProxyGroup(config, "Proxy", "Main");

  expect(renamed.customProxyGroups[0]?.name).toBe("Main");
  expect(renamed.ruleSets[0]?.policy).toBe("Main");
});

it("normalizes custom proxy group options and node filters", () => {
  const config = createConfig();
  const options = setCustomProxyGroupListField(config, "Proxy", "options", [" DIRECT ", "", "DIRECT", "Auto"]);

  expect(options.customProxyGroups[0]?.options).toEqual(["DIRECT", "Auto"]);
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```powershell
pnpm test -- apps/web/tests/configMutations.test.ts
```

预期：失败，因为 helper 名称还没改。

- [ ] **步骤 3：实现新 helper**

在 `apps/web/src/configMutations.ts`：

- 删除 `createModule/addModule/updateModule/deleteModule/toggleModule`。
- 新增 `createRuleSet/addRuleSet/updateRuleSet/deleteRuleSet/toggleRuleSet`。
- 删除 `ProxyGroup` helper，新增 `CustomProxyGroup` helper。
- 不添加 deprecated wrapper；所有调用点在本阶段直接改到新 helper。

核心实现：

```ts
export function createRuleSet(
  config: RouteKitProjectConfig,
  options: { sourceType: RuleSetSource["type"] },
): RuleSet {
  return {
    id: nextName(config.ruleSets.map((ruleSet) => ruleSet.id), "ruleset"),
    policy: config.customProxyGroups[0]?.name ?? "DIRECT",
    source: createRuleSetSource(options.sourceType),
  };
}

export function updateRuleSet(
  config: RouteKitProjectConfig,
  ruleSetId: string,
  patch: Partial<RuleSet>,
): RouteKitProjectConfig {
  return {
    ...config,
    ruleSets: config.ruleSets.map((ruleSet) =>
      ruleSet.id === ruleSetId ? { ...ruleSet, ...patch } : ruleSet,
    ),
  };
}
```

- [ ] **步骤 4：验证 mutation tests**

运行：

```powershell
pnpm test -- apps/web/tests/configMutations.test.ts
```

预期：通过。

## 任务 6：重写草稿校验

**文件：**
- 修改：`apps/web/src/draftValidation.ts`
- 修改：`apps/web/tests/draftValidation.test.ts`
- 修改：`apps/web/src/projectController.ts`
- 修改：`apps/web/tests/projectController.test.ts`

- [ ] **步骤 1：更新校验测试**

`apps/web/tests/draftValidation.test.ts` 覆盖：

```ts
it("reports missing custom proxy group references from ruleSets", () => {
  const config = createConfig({
    ruleSets: [{ id: "bad", policy: "Missing", source: { type: "geosite", value: "openai" } }],
  });

  expect(validateDraftConfig(config)).toEqual([
    "RuleSet bad 引用了不存在的 custom_proxy_group：Missing",
  ]);
});

it("reports invalid ruleset sources", () => {
  const config = createConfig({
    ruleSets: [
      { id: "empty-geosite", policy: "Proxy", source: { type: "geosite", value: "" } },
      { id: "empty-provider", policy: "Proxy", source: { type: "rule-provider", behavior: "domain", file: "" } },
    ],
  });

  expect(validateDraftConfig(config)).toEqual([
    "RuleSet empty-geosite 的 GEOSITE 不能为空",
    "RuleSet empty-provider 的 provider 文件不能为空",
  ]);
});

it("requires at least one final ruleset", () => {
  const config = createConfig({ ruleSets: [{ id: "cn", policy: "Proxy", source: { type: "geosite", value: "cn" } }] });

  expect(validateDraftConfig(config)).toContain("ruleSets 需要包含一条 FINAL 兜底规则");
});
```

- [ ] **步骤 2：实现校验**

在 `apps/web/src/draftValidation.ts` 改为遍历：

- `config.customProxyGroups`
- `config.ruleSets`
- `config.ruleProviders`

诊断规则：

- `customProxyGroups[].name` 不重复、不为空。
- `ruleSets[].id` 不重复、不为空。
- `ruleSets[].policy` 必须引用存在的 `customProxyGroups[].name`，或为内置 `DIRECT/REJECT` 时明确允许。
- `source.type === "rule-provider"` 时 `file` 不能为空，并且应匹配已有 `ruleProviders[].output` 或允许外部 URL。
- `source.type === "geosite"` / `geoip` 时 `value` 不能为空。
- 至少一条启用的 `source.type === "final"`。

- [ ] **步骤 3：验证**

运行：

```powershell
pnpm test -- apps/web/tests/draftValidation.test.ts apps/web/tests/projectController.test.ts
```

预期：通过。

## 任务 7：Web 视图重命名和组件替换

**文件：**
- 修改：`apps/web/src/projectController.ts`
- 修改：`apps/web/src/App.tsx`
- 修改：`apps/web/src/components/AppShell.tsx`
- 修改：`apps/web/src/components/WorkspaceRouter.tsx`
- 创建：`apps/web/src/components/RuleSetList.tsx`
- 创建：`apps/web/src/components/RuleSetEditor.tsx`
- 创建：`apps/web/src/components/CustomProxyGroupList.tsx`
- 创建：`apps/web/src/components/CustomProxyGroupEditor.tsx`
- 创建：`apps/web/src/components/CustomProxyGroupWorkspace.tsx`
- 删除或停止使用：`ModuleList.tsx`、`ModuleEditor.tsx`、`PolicyList.tsx`、`PolicyEditor.tsx`、`PolicyWorkspace.tsx`

- [ ] **步骤 1：更新视图类型**

在 `apps/web/src/projectController.ts`：

```ts
export type ProjectView =
  | "project"
  | "ruleSets"
  | "customProxyGroups"
  | "providers"
  | "rules"
  | "preview"
  | "publish";
```

状态字段改名：

```ts
selectedRuleSetId: string;
selectedCustomProxyGroupName: string;
```

默认视图：

```ts
selectedView: "ruleSets",
```

- [ ] **步骤 2：改导航**

在 `apps/web/src/components/AppShell.tsx`：

```tsx
{ view: "ruleSets", label: "RuleSets", description: "ruleset 行编辑", icon: <Route size={17} /> },
{ view: "customProxyGroups", label: "Proxy Groups", description: "custom_proxy_group", icon: <Layers3 size={17} /> },
```

移除 `Modules` / `Policies` 文案。

- [ ] **步骤 3：实现 RuleSet 列表**

创建 `apps/web/src/components/RuleSetList.tsx`：

```tsx
import { Plus } from "lucide-react";
import type { RuleSet } from "@clash-route-kit/core";

function sourceLabel(ruleSet: RuleSet): string {
  const source = ruleSet.source;
  if (source.type === "rule-provider") return `${source.behavior}:${source.file}`;
  if (source.type === "geosite") return `[]GEOSITE,${source.value}`;
  if (source.type === "geoip") return `[]GEOIP,${source.value}`;
  return "[]FINAL";
}

export function RuleSetList({
  ruleSets,
  selectedRuleSetId,
  onCreateRuleSet,
  onSelectRuleSet,
  onToggleRuleSet,
}: {
  ruleSets: RuleSet[];
  selectedRuleSetId: string;
  onCreateRuleSet: () => void;
  onSelectRuleSet: (ruleSetId: string) => void;
  onToggleRuleSet: (ruleSetId: string) => void;
}) {
  return (
    <aside className="entity-list">
      <div className="entity-list-header">
        <div>
          <h2>RuleSets</h2>
          <span>{ruleSets.length} ruleset lines</span>
        </div>
        <button className="icon-button" type="button" aria-label="create ruleset" onClick={onCreateRuleSet}>
          <Plus size={16} />
        </button>
      </div>
      <div className="entity-items">
        {ruleSets.map((ruleSet) => (
          <button
            className={`entity-row ${ruleSet.id === selectedRuleSetId ? "active" : ""}`}
            key={ruleSet.id}
            type="button"
            onClick={() => onSelectRuleSet(ruleSet.id)}
          >
            <strong>{ruleSet.policy}</strong>
            <span>{sourceLabel(ruleSet)}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **步骤 4：实现 RuleSet 编辑器**

创建 `apps/web/src/components/RuleSetEditor.tsx`，字段必须直接对应 `ruleset=`：

- `id`：本地标识。
- `enabled`：是否输出这一行。
- `policy`：`ruleset=` 第一段。
- `source.type`：`rule-provider` / `geosite` / `geoip` / `final`。
- source fields：provider file/behavior/interval、geosite value、geoip value/noResolve。
- 底部显示只读预览：`ruleset=<policy>,...`。

在组件内先放一个局部预览 helper，避免为了 UI 预览改 core 导出：

```tsx
function previewRuleSetLine(ruleSet: RuleSet, publishBaseUrl: string): string {
  const source = ruleSet.source;
  if (source.type === "rule-provider") {
    const kind = source.behavior === "domain"
      ? "clash-domain"
      : source.behavior === "classical"
        ? "clash-classic"
        : "clash-ipcidr";
    return `ruleset=${ruleSet.policy},${kind}:${publishBaseUrl.replace(/\/+$/, "")}/rules/${source.file},${source.interval ?? 28800}`;
  }
  if (source.type === "geosite") return `ruleset=${ruleSet.policy},[]GEOSITE,${source.value}`;
  if (source.type === "geoip") {
    return `ruleset=${ruleSet.policy},[]GEOIP,${source.value}${source.noResolve !== false ? ",no-resolve" : ""}`;
  }
  return `ruleset=${ruleSet.policy},[]FINAL`;
}
```

- [ ] **步骤 5：实现 Custom Proxy Group 组件**

把现有 `PolicyList/PolicyEditor/PolicyWorkspace` 复制改名为：

- `CustomProxyGroupList`
- `CustomProxyGroupEditor`
- `CustomProxyGroupWorkspace`

文案必须显示：

- 标题：`Custom Proxy Groups`
- 表单提示：`输出为 custom_proxy_group=<name>\`<type>\`...`
- 删除确认：`删除 custom_proxy_group <name>？`

- [ ] **步骤 6：接入 WorkspaceRouter 和 App**

`WorkspaceRouter` 中：

- `project.selectedView === "ruleSets"` 渲染 `RuleSetList + RuleSetEditor`。
- `project.selectedView === "customProxyGroups"` 渲染 `CustomProxyGroupWorkspace`。
- Preview 的 policy filter 改为来自 `config.customProxyGroups.map((group) => group.name)`。

`App.tsx` 中：

- `selectedRuleSet` 从 `config.ruleSets` 取。
- `selectedCustomProxyGroup` 从 `config.customProxyGroups` 取。
- `enabledCount` 从 `config.ruleSets.filter((ruleSet) => ruleSet.enabled !== false)` 计算。

- [ ] **步骤 7：验证 UI 类型**

运行：

```powershell
pnpm typecheck
pnpm build
```

预期：通过。

## 任务 8：预览和摘要直接展示 INI 原语

**文件：**
- 修改：`apps/web/src/routeSummary.ts`
- 修改：`apps/web/tests/routeSummary.test.ts`
- 修改：`apps/web/src/components/PreviewWorkspace.tsx`
- 修改：`apps/web/src/components/InspectorPanel.tsx`

- [ ] **步骤 1：更新 route summary 测试**

`apps/web/tests/routeSummary.test.ts` 应断言每一行对应一个 `ruleSets[]`：

```ts
expect(createRouteSummary(config)).toEqual([
  {
    id: "ai-geosite-openai",
    enabled: true,
    policy: "AI",
    source: "[]GEOSITE,openai",
    output: "ruleset=AI,[]GEOSITE,openai",
  },
]);
```

- [ ] **步骤 2：实现摘要**

`routeSummary.ts` 不再按 module 聚合 provider/geosite/geoip；直接 map `config.ruleSets`。

- [ ] **步骤 3：更新 PreviewWorkspace**

Preview 表头使用：

- `状态`
- `ruleset`
- `目标 custom_proxy_group`
- `source`

不要再显示 `module id` 作为主概念。

- [ ] **步骤 4：验证**

运行：

```powershell
pnpm test -- apps/web/tests/routeSummary.test.ts
pnpm typecheck
```

预期：通过。

## 任务 9：文档和旧计划衔接

**文件：**
- 修改：`README.md`
- 修改：`docs/superpowers/plans/2026-06-06-web-editor-hardening.md`
- 修改：`docs/superpowers/plans/2026-06-06-web-full-config-editor.md`

- [ ] **步骤 1：更新 README 配置说明**

README 中新增：

```md
## 配置模型

ClashRouteKit 的主配置文件是 `config/routes.yaml`。Web 编辑器直接编辑 SubConverter custom 配置中的两个核心原语：

- `ruleSets`：每一项输出为一条 `ruleset=...`。
- `customProxyGroups`：每一项输出为一条 `custom_proxy_group=...`。

`ruleProviders` 用于生成 `output/rules/*.yaml`，供 `ruleSets` 中的 `rule-provider` source 引用。

旧版 `config/modules.yaml`、`modules` 和 `proxyGroups` 不再作为默认配置或兼容输入。需要使用本阶段后的 `config/routes.yaml`。
```

- [ ] **步骤 2：标记 hardening 计划被吸收**

在 `docs/superpowers/plans/2026-06-06-web-editor-hardening.md` 顶部追加：

```md
> 状态：本计划被 `2026-06-07-routes-first-editor.md` 吸收并改序。样式回归、规则文件 dirty 状态和发布门禁仍要做，但先执行 Routes 原语模型大改。
```

- [ ] **步骤 3：在 full config 计划追加后续方向**

在 `docs/superpowers/plans/2026-06-06-web-full-config-editor.md` 的样式回归记录后追加：

```md
## 后续模型大改

用户确认最终应直接编辑 SubConverter 的 `ruleset` 和 `custom_proxy_group`。下一阶段不再强化 `modules/proxyGroups` 心智模型，而是直接替换为 `ruleSets/customProxyGroups` schema 与 UI。
```

## 任务 10：完整验证和浏览器 QA

**文件：**
- 无新增代码文件。

- [ ] **步骤 1：运行完整命令验证**

运行：

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm check
pnpm generate
git diff --check
```

预期：

- Vitest 全部通过。
- TypeScript workspace typecheck 通过。
- Vite production build 通过。
- `pnpm check` 无诊断。
- `pnpm generate` 生成的 `output/templates/Custom_Clash.ini` 包含预期 `ruleset=` 和 `custom_proxy_group=`。
- `git diff --check` 没有空白错误；Windows LF/CRLF warning 可以接受。

- [ ] **步骤 2：浏览器 QA**

运行：

```powershell
pnpm dev
```

打开本地 Vite URL，验证：

- 左侧导航显示 `RuleSets` 和 `Proxy Groups`，不再显示 `Modules` / `Policies`。
- RuleSets 列表每一项对应一条 `ruleset=`，选中后编辑器底部能看到生成行。
- 新增 GEOSITE ruleset 后，Preview 立即出现对应 `ruleset=<policy>,[]GEOSITE,<value>`。
- 新增 rule-provider ruleset 后，Preview 出现 `clash-domain:<publishBaseUrl>/rules/<file>`。
- Custom Proxy Groups 编辑器底部显示对应 `custom_proxy_group=` 预览。
- 保存后 `config/routes.yaml` 写入 `ruleSets` / `customProxyGroups`，仓库中不再使用 `config/modules.yaml`。
- 1280x864 和 390x844 均无横向溢出，控制台无 error/warning。

## 自检

- 范围覆盖：本计划覆盖 core schema、INI 渲染、配置文件直接替换、Web mutation、Web UI、预览、校验、文档和 QA。
- 模型一致性：用户最终编辑的是 `ruleset` 和 `custom_proxy_group`；`ruleProviders` 保留为 provider YAML 生成器。
- 兼容决策：不做旧 `modules/proxyGroups` 兼容；旧 schema 会被 parser 拒绝。
- 风险控制：虽然默认配置文件改为 `config/routes.yaml`，但本地 API 仍只操作配置文件和 `config/rules/*.list`，不扩大文件系统访问范围。
- 验证路径：每个大改层都有聚焦测试，最终用完整命令和浏览器 QA 收口。
