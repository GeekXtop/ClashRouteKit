# Import Template Placeholder Rule Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. This plan is closed; task and verification checkboxes are marked complete.

**Goal:** 导入 SubConverter 模板时自动补齐本地规则源占位，允许待补全规则源保存，并让 core/CLI 支持 `domain`、`classical`、`ipcidr` 三种 rule-provider 生成。

## Execution Status

- [x] Task 1：core provider behavior 泛化与 classical/ipcidr 生成。
- [x] Task 2：CLI generate 按 behavior 分派并泛化 summary。
- [x] Task 3：导入模板自动补齐本地规则源占位。
- [x] Task 4：校验分级、保存放行 warnings、autosave 失败不静默。
- [x] Task 5：规则库侧边栏显示待补全标签。
- [x] Follow-up：路由页展示引用空规则源的「规则源待补全」提示。
- [x] Verification：目标回归、core build、typecheck、全量测试、`pnpm check`、`pnpm generate` 均已通过。

**Architecture:** 先在 core 把 provider 生成能力从 domain-only 泛化为按 `ProviderBehavior` 分派，再让 CLI 生成流程复用同一套分派函数。Web 侧导入保持 `replaceImportedConfig` 纯 mutation：导入模板替换策略组和路由顺序，同时保留已有 `ruleProviders` 并追加空占位；校验返回 errors/warnings，保存只被 errors 阻断。UI 层只做现有状态条和规则库侧边栏标签，不引入新的全局提醒系统。

**Tech Stack:** TypeScript、ES modules / NodeNext、React 19、AntD v5、Vitest + Testing Library、pnpm workspace。

## Global Constraints

- `RuleProviderConfig.behavior` 从 `"domain"` 放宽到 `ProviderBehavior`（`"domain" | "classical" | "ipcidr"`）。
- `validateDraftConfig` 返回 `{ errors: string[]; warnings: string[] }`；`canSaveProject` 只看 `errors`。
- 空规则源 `sources: []` 是 warning，文案为「规则源 X 待补全：尚未指定数据源」，允许保存。
- `rule-provider` RuleSet 的 `file` 为空或引用不存在 provider output 仍是 error。
- 导入模板新建占位规则源时一律 `sources: []`，不做 URL 到 vendor 的自动映射。
- 现有规则源全量保留；同名 `output` 复用不重建。
- `clash-domain → domain`、`clash-classic → classical`、`clash-ipcidr → ipcidr` 已由 core import parser 解析为 `RuleProviderRuleSetSource.behavior`。
- 本期不做全局统一提醒系统；只用现有 `status/message` 和规则库列表「待补全」标签。
- serve/dev 运行时通过 Vite import CLI，再 import core dist；新增 core 运行时导出后必须执行 `pnpm --filter @clash-route-kit/core build`。
- ESM/NodeNext：相对 import 保留显式 `.js` 后缀。
- 测试文件沿用现有 Vitest 风格；组件测试首行使用 `// @vitest-environment jsdom`，AntD 组件测试用 `AppProviders` 包裹。
- 修改文件内容使用 `apply_patch`，避免编码漂移。

---

## 文件结构

| 文件 | 责任 | 动作 |
|---|---|---|
| `packages/core/src/types.ts` | provider behavior/input/summary/rule 类型泛化 | 修改 |
| `packages/core/src/rules.ts` | 新增 classical/ipcidr 生成、summary、按 behavior 分派 | 修改 |
| `packages/core/src/index.ts` | re-export 新函数和类型 | 修改 |
| `packages/core/tests/ruleProvider.test.ts` | core provider 生成行为测试 | 修改 |
| `apps/cli/src/program.ts` | generate 按 provider.behavior 分派，summary 字段泛化 | 修改 |
| `apps/cli/src/index.ts` | generate CLI 输出字段泛化 | 修改 |
| `apps/cli/src/serveApi.ts` | API generate action 输出字段泛化 | 修改 |
| `apps/cli/tests/cli.test.ts` | classical/ipcidr/空占位 provider 生成测试 | 修改 |
| `apps/cli/tests/serveApi.test.ts` | generate action summary 文案测试 | 修改 |
| `apps/web/src/configMutations.ts` | 导入模板时保留/补齐 ruleProviders | 修改 |
| `apps/web/tests/configMutations.test.ts` | 导入模板规则源占位测试 | 修改 |
| `apps/web/src/draftValidation.ts` | 校验分级 errors/warnings | 修改 |
| `apps/web/src/projectController.ts` | SaveReadiness 携带 warnings，只用 errors 阻断保存 | 修改 |
| `apps/web/src/App.tsx` | autosave blocked error 不静默，保存后 warning message | 修改 |
| `apps/web/src/useProjectDraftActions.ts` | importTemplate message 反映待补全数量 | 修改 |
| `apps/web/tests/draftValidation.test.ts` | 分级校验测试 | 修改 |
| `apps/web/tests/projectController.test.ts` | canSaveProject warning 可保存测试 | 修改 |
| `apps/web/src/components/LibrarySidebar.tsx` | 空 sources provider 加「待补全」标签 | 修改 |
| `apps/web/tests/librarySidebar.test.tsx` | 标签展示测试 | 修改 |

---

### Task 1: core provider behavior 泛化与 classical/ipcidr 生成

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/rules.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/ruleProvider.test.ts`

**Interfaces:**
- Consumes: `ProviderBehavior`、现有 `generateDomainProvider(input)`。
- Produces:
  - `RuleProviderConfig.behavior: ProviderBehavior`
  - `ProviderInput { source: string; rules: string[]; exclude?: string[] }`
  - `ProviderSummary { inputRules: number; outputRules: number; excludedRules: number }`
  - `ProviderRule { key: string; rule: string; payload: string }`
  - `generateClassicalProvider(input: ProviderInput): string`
  - `generateIpcidrProvider(input: ProviderInput): string`
  - `generateRuleProvider(behavior: ProviderBehavior, input: ProviderInput): string`
  - `summarizeRuleProvider(behavior: ProviderBehavior, input: ProviderInput): ProviderSummary`
  - `collectRuleProviderRules(behavior: ProviderBehavior, input: ProviderInput): ProviderRule[]`

- [x] **Step 1: 写失败测试**

在 `packages/core/tests/ruleProvider.test.ts` 的 import 增加新函数：

```ts
import {
  convertDomainListCommunity,
  generateClassicalProvider,
  generateDomainProvider,
  generateIpcidrProvider,
  generateRuleProvider,
  summarizeRuleProvider,
} from "../src/index.js";
```

在文件底部追加：

```ts
describe("generateClassicalProvider", () => {
  it("keeps complete supported rule lines with dedupe, sorting, and excludes", () => {
    const yaml = generateClassicalProvider({
      source: "config/rules/Mixed.list",
      rules: [
        "DOMAIN-SUFFIX,example.com",
        "IP-CIDR,192.0.2.0/24,no-resolve",
        "PROCESS-NAME,Telegram.exe",
        "domain-suffix,example.com",
      ],
      exclude: ["PROCESS-NAME,Telegram.exe"],
    });

    expect(yaml).toContain("# 生成自 config/rules/Mixed.list");
    expect(yaml).toContain("# 总数: 2");
    expect(yaml).toContain("  - 'DOMAIN-SUFFIX,example.com'");
    expect(yaml).toContain("  - 'IP-CIDR,192.0.2.0/24,no-resolve'");
    expect(yaml).not.toContain("Telegram.exe");
  });
});

describe("generateIpcidrProvider", () => {
  it("keeps only IP-CIDR and IP-CIDR6 values with dedupe, sorting, and excludes", () => {
    const yaml = generateIpcidrProvider({
      source: "config/rules/IP.list",
      rules: [
        "DOMAIN-SUFFIX,ignored.example",
        "IP-CIDR,192.0.2.0/24,no-resolve",
        "IP-CIDR6,2001:db8::/32,no-resolve",
        "ip-cidr,192.0.2.0/24",
        "IP-CIDR,198.51.100.0/24",
      ],
      exclude: ["198.51.100.0/24"],
    });

    expect(yaml).toContain("# 总数: 2");
    expect(yaml).toContain("  - '192.0.2.0/24'");
    expect(yaml).toContain("  - '2001:db8::/32'");
    expect(yaml).not.toContain("ignored.example");
    expect(yaml).not.toContain("198.51.100.0/24");
  });

  it("dispatches provider generation and summaries by behavior", () => {
    const input = {
      source: "config/rules/Mixed.list",
      rules: ["DOMAIN-SUFFIX,example.com", "IP-CIDR,192.0.2.0/24,no-resolve"],
    };

    expect(generateRuleProvider("domain", input)).toContain("'+.example.com'");
    expect(generateRuleProvider("classical", input)).toContain("'IP-CIDR,192.0.2.0/24,no-resolve'");
    expect(generateRuleProvider("ipcidr", input)).toContain("'192.0.2.0/24'");
    expect(summarizeRuleProvider("ipcidr", input)).toEqual({
      inputRules: 2,
      outputRules: 1,
      excludedRules: 0,
    });
  });
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run packages/core/tests/ruleProvider.test.ts`

Expected: FAIL，提示 `generateClassicalProvider` / `generateIpcidrProvider` / `generateRuleProvider` / `summarizeRuleProvider` 未导出。

- [x] **Step 3: 修改 core 类型**

把 `packages/core/src/types.ts` 中 provider 类型段改成：

```ts
export interface RuleProviderConfig {
  name: string;
  output: string;
  behavior: ProviderBehavior;
  exclude?: string[];
  remove?: string[];
  sources: RuleProviderSource[];
}

export interface ProviderInput {
  source: string;
  rules: string[];
  exclude?: string[];
}

export interface ProviderSummary {
  inputRules: number;
  outputRules: number;
  excludedRules: number;
}

export interface ProviderRule {
  key: string;
  rule: string;
  payload: string;
}

export type DomainProviderInput = ProviderInput;

export interface DomainProviderSummary extends ProviderSummary {
  domainRules: number;
}

export type DomainProviderRule = ProviderRule;
```

- [x] **Step 4: 实现 rules.ts 泛化函数**

在 `packages/core/src/rules.ts` 的 import 中加入：

```ts
  ProviderBehavior,
  ProviderInput,
  ProviderRule,
  ProviderSummary,
```

在 `parseRule` 后新增：

```ts
function quotePayload(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function renderProviderYaml(source: string, payload: string[]): string {
  const lines = [`# 生成自 ${source}`, `# 总数: ${payload.length}`, "", "payload:"];
  for (const entry of payload) {
    lines.push(`  - ${entry}`);
  }
  lines.push("");
  return lines.join("\n");
}
```

把 `normalizeDomainRule` 中 payload 构造改为复用 `quotePayload`：

```ts
payload: quotePayload(`+.${rule.value}`),
```

和：

```ts
payload: quotePayload(rule.value),
```

在 `collectDomainProviderRules` 后新增：

```ts
function normalizeClassicalRule(rawRule: string): ProviderRule | null {
  const trimmed = rawRule.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  return {
    payload: quotePayload(trimmed),
    key: trimmed.toLowerCase(),
    rule: trimmed,
  };
}

export function collectClassicalProviderRules(input: ProviderInput): ProviderRule[] {
  const rules: ProviderRule[] = [];
  const seen = new Set<string>();
  const excluded = new Set(
    (input.exclude ?? [])
      .map(normalizeClassicalRule)
      .filter((rule): rule is ProviderRule => rule !== null)
      .map((rule) => rule.key),
  );

  for (const rawRule of input.rules) {
    const rule = normalizeClassicalRule(rawRule);
    if (!rule || excluded.has(rule.key)) continue;
    if (!seen.has(rule.key)) {
      seen.add(rule.key);
      rules.push(rule);
    }
  }
  return rules.sort((left, right) => left.rule.localeCompare(right.rule));
}

function normalizeIpcidrRule(rawRule: string): ProviderRule | null {
  const trimmed = rawRule.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const parsed = parseRule(trimmed.includes(",") ? trimmed : `IP-CIDR,${trimmed}`);
  if (!parsed || (parsed.kind !== "IP-CIDR" && parsed.kind !== "IP-CIDR6")) return null;
  return {
    payload: quotePayload(parsed.value),
    key: parsed.value.toLowerCase(),
    rule: parsed.value,
  };
}

export function collectIpcidrProviderRules(input: ProviderInput): ProviderRule[] {
  const rules: ProviderRule[] = [];
  const seen = new Set<string>();
  const excluded = new Set(
    (input.exclude ?? [])
      .map(normalizeIpcidrRule)
      .filter((rule): rule is ProviderRule => rule !== null)
      .map((rule) => rule.key),
  );

  for (const rawRule of input.rules) {
    const rule = normalizeIpcidrRule(rawRule);
    if (!rule || excluded.has(rule.key)) continue;
    if (!seen.has(rule.key)) {
      seen.add(rule.key);
      rules.push(rule);
    }
  }
  return rules.sort((left, right) => left.rule.localeCompare(right.rule));
}
```

把 `domainPayload` 和 `generateDomainProvider` 改为：

```ts
function domainPayload(rules: string[], exclude: string[] = []): string[] {
  return collectDomainProviderRules({
    source: "",
    rules,
    exclude,
  }).map((rule) => rule.payload);
}

export function generateDomainProvider(input: DomainProviderInput): string {
  return renderProviderYaml(input.source, domainPayload(input.rules, input.exclude));
}
```

在 `summarizeDomainProvider` 后新增：

```ts
export function generateClassicalProvider(input: ProviderInput): string {
  return renderProviderYaml(input.source, collectClassicalProviderRules(input).map((rule) => rule.payload));
}

export function generateIpcidrProvider(input: ProviderInput): string {
  return renderProviderYaml(input.source, collectIpcidrProviderRules(input).map((rule) => rule.payload));
}

export function collectRuleProviderRules(behavior: ProviderBehavior, input: ProviderInput): ProviderRule[] {
  if (behavior === "domain") return collectDomainProviderRules(input);
  if (behavior === "classical") return collectClassicalProviderRules(input);
  return collectIpcidrProviderRules(input);
}

export function generateRuleProvider(behavior: ProviderBehavior, input: ProviderInput): string {
  if (behavior === "domain") return generateDomainProvider(input);
  if (behavior === "classical") return generateClassicalProvider(input);
  return generateIpcidrProvider(input);
}

export function summarizeRuleProvider(behavior: ProviderBehavior, input: ProviderInput): ProviderSummary {
  const outputRules = collectRuleProviderRules(behavior, input).length;
  const unexcluded = collectRuleProviderRules(behavior, { ...input, exclude: [] }).length;
  return {
    inputRules: input.rules.length,
    outputRules,
    excludedRules: unexcluded - outputRules,
  };
}
```

- [x] **Step 5: 更新 index.ts re-export**

在 `packages/core/src/index.ts` 的 rules export 中加入：

```ts
  collectClassicalProviderRules,
  collectIpcidrProviderRules,
  collectRuleProviderRules,
  generateClassicalProvider,
  generateIpcidrProvider,
  generateRuleProvider,
  summarizeRuleProvider,
```

在 type export 中加入：

```ts
  ProviderInput,
  ProviderRule,
  ProviderSummary,
```

- [x] **Step 6: 运行 core 测试**

Run: `pnpm exec vitest run packages/core/tests/ruleProvider.test.ts packages/core/tests/rules.test.ts`

Expected: PASS。

---

### Task 2: CLI generate 按 behavior 分派并泛化 summary

**Files:**
- Modify: `apps/cli/src/program.ts`
- Modify: `apps/cli/src/index.ts`
- Modify: `apps/cli/src/serveApi.ts`
- Test: `apps/cli/tests/cli.test.ts`
- Test: `apps/cli/tests/serveApi.test.ts`

**Interfaces:**
- Consumes: `generateRuleProvider(behavior, input)`、`summarizeRuleProvider(behavior, input)`、`collectRuleProviderRules(behavior, input)`。
- Produces: `SourceContributionSummary.outputRules`；`ProviderOutputSummary` 使用 `ProviderSummary`，不再要求 provider summary 有 `domainRules`。

- [x] **Step 1: 写失败测试**

在 `apps/cli/tests/cli.test.ts` 的 CLI program describe 内追加：

```ts
  it("generates classical, ipcidr, and empty placeholder provider outputs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await mkdir(path.join(root, "config/rules"), { recursive: true });
    await writeFile(
      path.join(root, "config/rules/Mixed.list"),
      [
        "DOMAIN-SUFFIX,example.com",
        "IP-CIDR,192.0.2.0/24,no-resolve",
        "PROCESS-NAME,Telegram.exe",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(root, "routes.yaml"),
      [
        "publishBaseUrl: http://127.0.0.1:8787",
        "template:",
        "  output: Custom_Clash.ini",
        "customProxyGroups:",
        "  - name: Proxy",
        "    type: select",
        "    options:",
        "      - DIRECT",
        "ruleSets:",
        "  - id: final",
        "    policy: Proxy",
        "    source:",
        "      type: final",
        "ruleProviders:",
        "  - name: MixedClassical",
        "    output: Mixed_Classical.yaml",
        "    behavior: classical",
        "    sources:",
        "      - name: Mixed",
        "        type: clash-list",
        "        path: config/rules/Mixed.list",
        "  - name: MixedIP",
        "    output: Mixed_IP.yaml",
        "    behavior: ipcidr",
        "    sources:",
        "      - name: Mixed",
        "        type: clash-list",
        "        path: config/rules/Mixed.list",
        "  - name: Placeholder",
        "    output: Placeholder_Classical.yaml",
        "    behavior: classical",
        "    sources: []",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await generateOutputs({ root, configFile: "routes.yaml" });

    const classical = await readFile(path.join(root, "output/rules/Mixed_Classical.yaml"), "utf8");
    const ipcidr = await readFile(path.join(root, "output/rules/Mixed_IP.yaml"), "utf8");
    const placeholder = await readFile(path.join(root, "output/rules/Placeholder_Classical.yaml"), "utf8");
    expect(classical).toContain("'DOMAIN-SUFFIX,example.com'");
    expect(classical).toContain("'PROCESS-NAME,Telegram.exe'");
    expect(ipcidr).toContain("'192.0.2.0/24'");
    expect(ipcidr).not.toContain("example.com");
    expect(placeholder).toContain("payload:");
    expect(placeholder).toContain("# 总数: 0");
    expect(result.providers.find((provider) => provider.name === "MixedIP")?.outputRules).toBe(1);
  });
```

在 `apps/cli/tests/serveApi.test.ts` 的 generate summary fake result 中把 provider 改为：

```ts
          {
            name: "AI",
            output: "AI_Domain.yaml",
            path: "E:/repo/output/rules/AI_Domain.yaml",
            inputRules: 9,
            outputRules: 6,
            excludedRules: 1,
            sources: [
              { name: "Local", type: "clash-list", inputRules: 9, outputRules: 6 },
            ],
          },
```

并把断言改为：

```ts
    expect(result.output).toContain("[generate] summary: AI output=6 excluded=1 sources=[Local:6/9]");
```

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run apps/cli/tests/cli.test.ts apps/cli/tests/serveApi.test.ts`

Expected: FAIL，因为 CLI 仍硬编码 domain generator 和 `domainRules` 字段。

- [x] **Step 3: 修改 program.ts import 与接口**

把 `apps/cli/src/program.ts` 从 core import 的 domain-only 项替换为：

```ts
  collectRuleProviderRules,
  convertDomainListCommunity,
  generateRuleProvider,
  parseIniToConfig,
  renderIni,
  serializeRouteKitConfig,
  summarizeRuleProvider,
  type ImportedConfig,
  type ProviderRule,
  type ProviderSummary,
  type RouteKitProjectConfig,
  type RuleProviderSource,
  type SourceBase,
  type VendorRepoConfig,
```

把 summary 接口改为：

```ts
export interface SourceContributionSummary {
  name: string;
  type: RuleProviderSource["type"];
  inputRules: number;
  outputRules: number;
}

export interface ProviderOutputSummary extends ProviderSummary {
  name: string;
  output: string;
  path: string;
  sources: SourceContributionSummary[];
}
```

把 `DomainProviderRule` 类型引用改为 `ProviderRule`。

- [x] **Step 4: 修改 generateOutputs provider 循环**

在 `generateOutputs` 中把 provider source summary 与生成逻辑改为：

```ts
      const sourceSummary = summarizeRuleProvider(provider.behavior, {
        source: sourceLabel(source),
        rules: sourceRules,
      });
      sourceRulesForReport.push({
        source: source.name,
        rules: collectRuleProviderRules(provider.behavior, {
          source: sourceLabel(source),
          rules: sourceRules,
        }),
      });
      sources.push({
        name: source.name,
        type: source.type,
        inputRules: sourceSummary.inputRules,
        outputRules: sourceSummary.outputRules,
      });
```

把 `generateDomainProvider` 调用改为：

```ts
      generateRuleProvider(provider.behavior, {
        source: provider.sources.map(sourceLabel).join(", "),
        rules,
        exclude,
      }),
```

把 final report collection 改为：

```ts
    finalProviderRules.push({
      provider: provider.name,
      rules: collectRuleProviderRules(provider.behavior, {
        source: provider.name,
        rules,
        exclude,
      }),
    });
```

把 provider summary spread 改为：

```ts
      ...summarizeRuleProvider(provider.behavior, {
        source: provider.name,
        rules,
        exclude,
      }),
```

- [x] **Step 5: 修改 CLI 输出文案**

在 `apps/cli/src/index.ts` 和 `apps/cli/src/serveApi.ts` 中把 source map 改为：

```ts
.map((source) => `${source.name}:${source.outputRules}/${source.inputRules}`)
```

把 summary 行改为：

```ts
`[generate] summary: ${provider.name} output=${provider.outputRules} excluded=${provider.excludedRules} sources=[${sources}]`
```

- [x] **Step 6: 更新旧测试期望**

在 `apps/cli/tests/cli.test.ts` 中把已有 `domainRules` 期望替换为 `outputRules`：

```ts
sources: [
  {
    name: "DeveloperList",
    type: "clash-list",
    inputRules: 4,
    outputRules: 4,
  },
],
```

顶层 provider 不再期望 `domainRules`。

- [x] **Step 7: 运行 CLI 测试**

Run: `pnpm exec vitest run apps/cli/tests/cli.test.ts apps/cli/tests/serveApi.test.ts`

Expected: PASS。

---

### Task 3: 导入模板自动补齐本地规则源占位

**Files:**
- Modify: `apps/web/src/configMutations.ts`
- Test: `apps/web/tests/configMutations.test.ts`

**Interfaces:**
- Consumes: `ImportedConfig.ruleSets` 中 `source.type === "rule-provider"` 的 `{ file, behavior }`。
- Produces: `replaceImportedConfig(config, imported)` 保留所有现有 `ruleProviders`，并追加缺失 `output` 的空占位 `{ name, output, behavior, sources: [] }`。

- [x] **Step 1: 写失败测试**

在 `apps/web/tests/configMutations.test.ts` 的 `config mutation helpers` describe 内追加：

```ts
  it("replaces imported templates and creates placeholder rule providers for missing outputs", () => {
    const config = {
      ...createConfig(),
      ruleProviders: [
        {
          name: "ExistingAI",
          output: "AI_Domain.yaml",
          behavior: "domain",
          sources: [{ name: "AI", type: "clash-list", path: "config/rules/AI.list" }],
        },
        {
          name: "KeepEvenUnused",
          output: "Unused_Domain.yaml",
          behavior: "domain",
          sources: [],
        },
      ] satisfies RuleProviderConfig[],
    };
    const imported: ImportedConfig = {
      customProxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
      ruleSets: [
        {
          id: "ai",
          policy: "Proxy",
          source: { type: "rule-provider", behavior: "domain", file: "AI_Domain.yaml" },
        },
        {
          id: "custom-classical-ip",
          policy: "Proxy",
          source: { type: "rule-provider", behavior: "classical", file: "Custom_Direct_Classical_IP.yaml" },
        },
        {
          id: "custom-ipcidr",
          policy: "Proxy",
          source: { type: "rule-provider", behavior: "ipcidr", file: "Custom_IP.yaml" },
        },
        { id: "final", policy: "Proxy", source: { type: "final" } },
      ],
      warnings: [],
    };

    const next = replaceImportedConfig(config, imported);

    expect(next.ruleProviders?.map((provider) => provider.output)).toEqual([
      "AI_Domain.yaml",
      "Unused_Domain.yaml",
      "Custom_Direct_Classical_IP.yaml",
      "Custom_IP.yaml",
    ]);
    expect(next.ruleProviders?.find((provider) => provider.output === "AI_Domain.yaml")?.name).toBe("ExistingAI");
    expect(next.ruleProviders?.find((provider) => provider.output === "Custom_Direct_Classical_IP.yaml")).toEqual({
      name: "Custom_Direct_Classical_IP",
      output: "Custom_Direct_Classical_IP.yaml",
      behavior: "classical",
      sources: [],
    });
    expect(next.ruleProviders?.find((provider) => provider.output === "Custom_IP.yaml")?.behavior).toBe("ipcidr");
  });
```

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run apps/web/tests/configMutations.test.ts`

Expected: FAIL，因为 `replaceImportedConfig` 当前不处理 `ruleProviders`。

- [x] **Step 3: 增加占位生成 helper**

在 `apps/web/src/configMutations.ts` 中 `cloneRuleProvider` 后新增：

```ts
function providerNameFromOutput(output: string): string {
  return output
    .replace(/\.(ya?ml)$/i, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "Provider";
}

function importedProviderPlaceholders(
  config: RouteKitProjectConfig,
  imported: ImportedConfig,
): RuleProviderConfig[] {
  const existingProviders = (config.ruleProviders ?? []).map(cloneRuleProvider);
  const existingOutputs = new Set(existingProviders.map((provider) => provider.output));
  const names = existingProviders.map((provider) => provider.name);
  const placeholders: RuleProviderConfig[] = [];

  for (const ruleSet of imported.ruleSets) {
    const source = ruleSet.source;
    if (source.type !== "rule-provider") continue;
    const output = source.file.trim();
    if (!output || existingOutputs.has(output)) continue;
    existingOutputs.add(output);
    const name = nextName(names, providerNameFromOutput(output));
    names.push(name);
    placeholders.push({
      name,
      output,
      behavior: source.behavior,
      sources: [],
    });
  }

  return [...existingProviders, ...placeholders];
}
```

- [x] **Step 4: 修改 replaceImportedConfig**

把 `replaceImportedConfig` return 补上：

```ts
    ruleProviders: importedProviderPlaceholders(config, imported),
```

完整返回应保留 `publishBaseUrl`、`template`、`vendorRepos`、`globalRemove` 等 infra 字段，只替换 `customProxyGroups`、`ruleSets`，并合并 `ruleProviders`。

- [x] **Step 5: 运行 mutation 测试**

Run: `pnpm exec vitest run apps/web/tests/configMutations.test.ts`

Expected: PASS。

---

### Task 4: 校验分级、保存放行 warnings、autosave 失败不静默

**Files:**
- Modify: `apps/web/src/draftValidation.ts`
- Modify: `apps/web/src/projectController.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/useProjectDraftActions.ts`
- Test: `apps/web/tests/draftValidation.test.ts`
- Test: `apps/web/tests/projectController.test.ts`

**Interfaces:**
- Consumes: `validateDraftConfig(config)`.
- Produces:
  - `DraftDiagnostics { errors: string[]; warnings: string[] }`
  - `SaveReadiness = { ok: true; warnings: string[] } | { ok: false; reason: string; warnings: string[] }`
  - `markProjectSaved` 使用 warnings 数量生成保存成功 message。

- [x] **Step 1: 写失败测试**

在 `apps/web/tests/draftValidation.test.ts` 更新 valid expectations，把 `toEqual([])` 改为：

```ts
expect(validateDraftConfig(createConfig())).toEqual({ errors: [], warnings: [] });
```

对错误测试，把原数组包进 `errors`，并增加 `warnings: []`。例如：

```ts
expect(validateDraftConfig(config)).toEqual({
  errors: [
    "custom_proxy_group 名称不能重复：Proxy",
    "RuleSet ai 引用了不存在的 custom_proxy_group：Missing",
    "RuleSet final 引用了不存在的 custom_proxy_group：Gone",
  ],
  warnings: [],
});
```

再追加：

```ts
  it("warns but does not error for empty placeholder rule providers", () => {
    const config = createConfig({
      ruleProviders: [
        { name: "CustomDirect", output: "Custom_Direct_Classical_IP.yaml", behavior: "classical", sources: [] },
      ] satisfies RuleProviderConfig[],
      ruleSets: [
        {
          id: "custom-direct",
          policy: "AI",
          source: { type: "rule-provider", behavior: "classical", file: "Custom_Direct_Classical_IP.yaml" },
        },
        { id: "final", policy: "Proxy", source: { type: "final" } },
      ],
    });

    expect(validateDraftConfig(config)).toEqual({
      errors: [],
      warnings: ["规则源 CustomDirect 待补全：尚未指定数据源"],
    });
  });
```

在 `apps/web/tests/projectController.test.ts` 追加：

```ts
  it("allows saving drafts that only have placeholder provider warnings", () => {
    const config = createConfig();
    const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });
    const dirty = applyDraftConfig(controller, {
      ...config,
      ruleSets: [
        {
          id: "custom-direct",
          policy: "Proxy",
          source: { type: "rule-provider", behavior: "classical", file: "Custom_Direct_Classical_IP.yaml" },
        },
        { id: "final", policy: "Proxy", source: { type: "final" } },
      ],
      ruleProviders: [
        { name: "CustomDirect", output: "Custom_Direct_Classical_IP.yaml", behavior: "classical", sources: [] },
      ],
    });

    expect(canSaveProject(dirty)).toEqual({
      ok: true,
      warnings: ["规则源 CustomDirect 待补全：尚未指定数据源"],
    });
  });
```

把已有 `expect(canSaveProject(next)).toEqual({ ok: true })` 改为：

```ts
expect(canSaveProject(next)).toEqual({ ok: true, warnings: [] });
```

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run apps/web/tests/draftValidation.test.ts apps/web/tests/projectController.test.ts`

Expected: FAIL，因为返回结构和 save readiness 尚未更新。

- [x] **Step 3: 修改 draftValidation 返回结构**

在 `apps/web/src/draftValidation.ts` 顶部新增：

```ts
export interface DraftDiagnostics {
  errors: string[];
  warnings: string[];
}
```

把 `validateDraftConfig` 签名和局部变量改为：

```ts
export function validateDraftConfig(config: RouteKitProjectConfig): DraftDiagnostics {
  const errors: string[] = [];
  const warnings: string[] = [];
```

把所有 `diagnostics` error 传参改成 `errors`。在 provider loop 中把空 sources 处理改为 warning：

```ts
    if (provider.sources.length === 0) {
      warnings.push(`规则源 ${provider.name} 待补全：尚未指定数据源`);
    }
```

函数末尾返回：

```ts
  return { errors, warnings };
```

保留 source path/name/entry 校验为 errors：

```ts
    for (const source of provider.sources) {
      validateRuleProviderSource(provider, source, errors);
    }
```

- [x] **Step 4: 修改 projectController readiness 和保存 message**

在 `apps/web/src/projectController.ts` 中把 `SaveReadiness` 改为：

```ts
export type SaveReadiness =
  | { ok: true; warnings: string[] }
  | {
      ok: false;
      reason: string;
      warnings: string[];
    };
```

把 `markProjectSaved` 内 message 改为：

```ts
  const warnings = validateDraftConfig(snapshot.config).warnings;
```

并把返回对象中的 message 改为：

```ts
    message: warnings.length > 0
      ? `已保存，${warnings.length} 个规则源待补全数据源`
      : "已保存 config/routes.yaml，可运行检查、生成和提交",
```

把 `canSaveProject` 改为：

```ts
export function canSaveProject(state: ProjectControllerState): SaveReadiness {
  if (!state.dirty) {
    return {
      ok: false,
      reason: "没有未保存的修改",
      warnings: validateDraftConfig(state.draftConfig).warnings,
    };
  }

  const diagnostics = validateDraftConfig(state.draftConfig);
  if (diagnostics.errors.length > 0) {
    return {
      ok: false,
      reason: diagnostics.errors[0]!,
      warnings: diagnostics.warnings,
    };
  }

  return { ok: true, warnings: diagnostics.warnings };
}
```

- [x] **Step 5: 修改 App autosave 阻断处理**

把 `apps/web/src/App.tsx` autosave effect 开头改为：

```ts
    if (!project.dirty) return;
    const readiness = canSaveProject(project);
    if (!readiness.ok) {
      if (project.status !== "error" || project.message !== readiness.reason) {
        setProject((current) => setProjectStatus(current, "error", readiness.reason));
      }
      return;
    }
```

其余保存逻辑保持防抖不变。

- [x] **Step 6: 修改 importTemplate message**

在 `apps/web/src/useProjectDraftActions.ts` import 中加入：

```ts
import { validateDraftConfig } from "./draftValidation.js";
```

把 `importTemplate` 内 return 前改为：

```ts
          const importWarnings = imported.warnings.length;
          const placeholderWarnings = validateDraftConfig(next.draftConfig).warnings.length;
          const warningCount = importWarnings + placeholderWarnings;
```

message 改为：

```ts
            message: warningCount
              ? `已覆盖导入模板，${warningCount} 条警告（${placeholderWarnings} 个规则源待补全）`
              : "已覆盖导入模板",
```

- [x] **Step 7: 运行 web 校验测试**

Run: `pnpm exec vitest run apps/web/tests/draftValidation.test.ts apps/web/tests/projectController.test.ts`

Expected: PASS。

---

### Task 5: 规则库侧边栏显示待补全标签

**Files:**
- Modify: `apps/web/src/components/LibrarySidebar.tsx`
- Test: `apps/web/tests/librarySidebar.test.tsx`

**Interfaces:**
- Consumes: `RuleProviderConfig.sources`.
- Produces: `sources.length === 0` 的 provider 行显示「待补全」标签。

- [x] **Step 1: 写失败测试**

在 `apps/web/tests/librarySidebar.test.tsx` 追加：

```tsx
it("marks empty rule providers as incomplete", () => {
  render(
    <AppProviders>
      <LibrarySidebar
        repos={[]}
        listFiles={[]}
        providers={[
          { name: "CustomDirect", output: "Custom_Direct_Classical_IP.yaml", behavior: "classical", sources: [] },
          {
            name: "AI",
            output: "AI_Domain.yaml",
            behavior: "domain",
            sources: [{ name: "AI", type: "clash-list", path: "config/rules/AI.list" }],
          },
        ]}
        selection={null}
        syncingRepo={null}
        onSelect={() => {}}
        onSyncRepo={() => {}}
        onSyncAll={() => {}}
        onAddRepo={() => {}}
        onEditRepo={() => {}}
        onNewList={() => {}}
        onNewProvider={() => {}}
      />
    </AppProviders>,
  );

  expect(screen.getByText("待补全")).toBeTruthy();
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run apps/web/tests/librarySidebar.test.tsx`

Expected: FAIL，因为当前 provider 行没有标签。

- [x] **Step 3: 修改 LibrarySidebar provider row**

在 `LibrarySidebar.tsx` 的 `providerRows` 中，把 provider name 后加标签：

```tsx
      <span className="rk-lib-name">{provider.name}</span>
      {provider.sources.length === 0 ? <span className="rk-tag warn">待补全</span> : null}
```

如果现有 CSS 没有 `rk-tag warn` 可复用，则在同任务里追加到全局样式文件中已有 tag 风格附近；如果已有同名 class，复用即可。新增样式应简短：

```css
.rk-tag.warn {
  border-color: #f59e0b;
  color: #92400e;
  background: #fffbeb;
}
```

- [x] **Step 4: 运行组件测试**

Run: `pnpm exec vitest run apps/web/tests/librarySidebar.test.tsx apps/web/tests/libraryPage.test.tsx`

Expected: PASS。

---

## 收尾校验

- [x] Run: `pnpm exec vitest run packages/core/tests/ruleProvider.test.ts packages/core/tests/rules.test.ts` Expected: PASS。
- [x] Run: `pnpm exec vitest run apps/cli/tests/cli.test.ts apps/cli/tests/serveApi.test.ts` Expected: PASS。
- [x] Run: `pnpm exec vitest run apps/web/tests/configMutations.test.ts apps/web/tests/draftValidation.test.ts apps/web/tests/projectController.test.ts apps/web/tests/librarySidebar.test.tsx apps/web/tests/libraryPage.test.tsx` Expected: PASS。
- [x] Run: `pnpm --filter @clash-route-kit/core build` Expected: PASS；确保 Vite/serve 读取到新的 core runtime exports。
- [x] Run: `pnpm typecheck` Expected: PASS。
- [x] Run: `pnpm test` Expected: PASS。
- [x] Run: `pnpm check` Expected: PASS。
- [x] 手动 `pnpm dev`：导入包含 `clash-classic:` / `clash-ipcidr:` 远程 ruleset 的模板，确认 `config/routes.yaml` 被保存，规则库出现空占位 provider 和「待补全」标签，页面消息显示待补全数量。

## Self-Review 记录

- **Spec 覆盖**：覆盖导入模板补 ruleProviders、保留现有规则源、空占位 warning、autosave 阻断提示、规则库待补全标签、core classical/ipcidr 生成、CLI generate 分派和 core dist 构建注意。
- **非目标边界**：没有加入 URL→vendor 自动映射，也没有设计全局统一提醒系统。
- **占位符扫描**：未发现占位式步骤；每个任务都有测试、实现位置、关键代码和验证命令。
- **类型一致性**：`ProviderInput` / `ProviderSummary` / `ProviderRule` 在 core 定义并由 CLI 使用；`SaveReadiness.warnings` 和 `DraftDiagnostics.warnings` 文案一致；`RuleProviderConfig.behavior` 与 `RuleProviderRuleSetSource.behavior` 都使用 `ProviderBehavior`。
