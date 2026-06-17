# ClashRouteKit 控制台重设计 · 计划 3/4：CLI 接入

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 CLI `generate` 应用项目级全局移除清单（`globalRemove`）到所有 provider、并把模板开关（`enableRuleGenerator`/`overwriteOriginalRules`/`clashRuleBase`）透传给 `renderIni`；新增 `import <ini>` 命令（用计划 2 的 `parseIniToConfig` 反解析 INI 成脚手架配置）；`preview` 输出按 `section` 分组。

**Architecture:** 仍是「core 出纯函数、cli 做文件 IO」。改动集中在 `apps/cli/src/program.ts`（generate/preview 流程 + 新增 `importIni`）与入口分发 `apps/cli/src/index.ts`。沿用现有 mkdtemp 集成测试范式（[apps/cli/tests/cli.test.ts](apps/cli/tests/cli.test.ts)）。

**Tech Stack:** TypeScript（NodeNext）、vitest、yaml、node:fs/promises。

**前置：** 计划 1（`renderIni(config, options)`、`template` 开关、`globalRemove`）+ 计划 2（`parseIniToConfig`）已合并。

---

## 现状已核实

- [generateOutputs](apps/cli/src/program.ts#L296) 在 [program.ts:301](apps/cli/src/program.ts#L301) 调 `renderIni(config)`（未传开关）；在 [program.ts:335-338](apps/cli/src/program.ts#L335) 把 `provider.exclude` + `provider.remove` 拼成 `exclude` 传给 `generateDomainProvider`。
- [previewRules](apps/cli/src/program.ts#L398) 逐条输出 `<SOURCE> -> <policy>`，无分段。
- 入口 [index.ts:10-73](apps/cli/src/index.ts#L10) 按 `process.argv[2]` 分发 `generate/preview/check/sync-vendor/subconvert-url`，无 `import`。
- 测试范式：`mkdtemp` → 写 `routes.yaml` + 源文件 → 调 program 函数 → `readFile` 产物断言。

---

## 文件结构

- **Modify** `apps/cli/src/program.ts` — generate 应用 `globalRemove` + 传模板开关；新增 `importIni` + `ImportResult`；preview 分段。
- **Modify** `apps/cli/src/index.ts` — 新增 `import` 命令分发 + 更新 usage。
- **Test** `apps/cli/tests/cli.test.ts` — 追加 globalRemove / 模板开关 / preview 分段用例。
- **Test** `apps/cli/tests/importIni.test.ts` — `importIni` 集成测试。

---

## Task 1：generate 应用项目级 globalRemove 到所有 provider

**Files:**
- Modify: `apps/cli/src/program.ts:335-338`
- Test: `apps/cli/tests/cli.test.ts`

- [x] **Step 1: 写失败测试**

在 `apps/cli/tests/cli.test.ts` 的 `describe("CLI program", ...)` 内追加：

```ts
  it("applies project-level globalRemove to every provider output", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await mkdir(path.join(root, "config/rules"), { recursive: true });
    await writeFile(path.join(root, "config/rules/A.list"), "DOMAIN-SUFFIX,keep.example\nDOMAIN-SUFFIX,ban.example\n", "utf8");
    await writeFile(path.join(root, "config/rules/B.list"), "DOMAIN-SUFFIX,ban.example\nDOMAIN-SUFFIX,other.example\n", "utf8");
    await writeFile(
      path.join(root, "routes.yaml"),
      [
        "publishBaseUrl: http://127.0.0.1:8787",
        "template:",
        "  output: Custom_Clash.ini",
        "globalRemove:",
        "  - ban.example",
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
        "  - name: A",
        "    output: A_Domain.yaml",
        "    behavior: domain",
        "    sources:",
        "      - name: A",
        "        type: clash-list",
        "        path: config/rules/A.list",
        "  - name: B",
        "    output: B_Domain.yaml",
        "    behavior: domain",
        "    sources:",
        "      - name: B",
        "        type: clash-list",
        "        path: config/rules/B.list",
        "",
      ].join("\n"),
      "utf8",
    );

    await generateOutputs({ root, configFile: "routes.yaml" });

    const a = await readFile(path.join(root, "output/rules/A_Domain.yaml"), "utf8");
    const b = await readFile(path.join(root, "output/rules/B_Domain.yaml"), "utf8");
    expect(a).toContain("'+.keep.example'");
    expect(a).not.toContain("ban.example");
    expect(b).toContain("'+.other.example'");
    expect(b).not.toContain("ban.example");
  });
```

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run -t "globalRemove to every provider"`
Expected: FAIL（`ban.example` 仍出现在产物里 —— 当前未应用 globalRemove）。

- [x] **Step 3: 实现 —— 在 exclude 拼接中加入 globalRemove**

把 `apps/cli/src/program.ts:335-338` 的 exclude 定义替换为：

```ts
    const exclude = [
      ...(config.globalRemove ?? []),
      ...(provider.exclude ?? []),
      ...(provider.remove ?? []),
    ];
```

- [x] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run apps/cli/tests/cli.test.ts`
Expected: PASS（原「excludes configured rules」用例的 `result.providers` 统计不受影响 —— 该用例 config 无 `globalRemove`，`config.globalRemove ?? []` 为空）。

- [x] **Step 5: 提交**

```bash
git add apps/cli/src/program.ts apps/cli/tests/cli.test.ts
git commit -m "feat(cli): apply project-level globalRemove to all providers"
```

---

## Task 2：generate 透传模板开关给 renderIni

**Files:**
- Modify: `apps/cli/src/program.ts:301`
- Test: `apps/cli/tests/cli.test.ts`

- [x] **Step 1: 写失败测试**

追加：

```ts
  it("passes template flags through to the rendered INI", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(
      path.join(root, "routes.yaml"),
      [
        "publishBaseUrl: http://127.0.0.1:8787",
        "template:",
        "  output: Custom_Clash.ini",
        "  enableRuleGenerator: false",
        "  clashRuleBase: https://example.com/Base.yml",
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
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await generateOutputs({ root, configFile: "routes.yaml" });
    const ini = await readFile(result.templatePath, "utf8");
    expect(ini).toContain("enable_rule_generator=false");
    expect(ini).toContain("clash_rule_base=https://example.com/Base.yml");
  });
```

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run -t "template flags through"`
Expected: FAIL（当前 `renderIni(config)` 未传开关，输出仍是 `enable_rule_generator=true`、无 clash_rule_base）。

- [x] **Step 3: 实现 —— 传 options**

把 `apps/cli/src/program.ts:301` 的：

```ts
  await writeFile(templatePath, renderIni(config), "utf8");
```

替换为：

```ts
  await writeFile(
    templatePath,
    renderIni(config, {
      enableRuleGenerator: config.template.enableRuleGenerator,
      overwriteOriginalRules: config.template.overwriteOriginalRules,
      clashRuleBase: config.template.clashRuleBase,
    }),
    "utf8",
  );
```

- [x] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run apps/cli/tests/cli.test.ts`
Expected: PASS（其它用例 config 无这些字段 → `undefined` → `renderIni` 内 `?? true` 回到默认，向后兼容）。

- [x] **Step 5: 提交**

```bash
git add apps/cli/src/program.ts apps/cli/tests/cli.test.ts
git commit -m "feat(cli): forward template flags to renderIni in generate"
```

---

## Task 3：新增 `import <ini>` 命令

**Files:**
- Modify: `apps/cli/src/program.ts`（import 块 + 新增 `importIni`/`ImportResult`）
- Modify: `apps/cli/src/index.ts`
- Test: `apps/cli/tests/importIni.test.ts`

- [x] **Step 1: 写失败测试**

新建 `apps/cli/tests/importIni.test.ts`：

```ts
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { importIni } from "../src/program.js";

describe("CLI importIni", () => {
  it("parses a SubConverter INI into a scaffold routes config", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-import-"));
    const ini = [
      "; Generated by ClashRouteKit",
      "[custom]",
      "; 海外类目",
      "ruleset=AI,[]GEOSITE,openai",
      "ruleset=AI,[]FINAL",
      "custom_proxy_group=AI`select`[]DIRECT",
      "enable_rule_generator=true",
      "",
    ].join("\n");
    await writeFile(path.join(root, "in.ini"), ini, "utf8");

    const result = await importIni({ root, configFile: "routes.yaml", iniFile: "in.ini" });

    expect(result.ruleSets.find((r) => r.source.type === "geosite")?.source).toEqual({
      type: "geosite",
      value: "openai",
    });
    expect(result.customProxyGroups).toEqual([{ name: "AI", type: "select", options: ["DIRECT"] }]);

    const scaffold = await readFile(result.scaffoldPath, "utf8");
    expect(scaffold).toContain("value: openai");
    expect(scaffold).toContain("publishBaseUrl:");
  });
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run apps/cli/tests/importIni.test.ts`
Expected: FAIL（`importIni` 未导出）。

- [x] **Step 3: 实现 importIni**

在 `apps/cli/src/program.ts` 顶部 core import 块（[program.ts:7-19](apps/cli/src/program.ts#L7)）加入 `parseIniToConfig`、`serializeRouteKitConfig` 与类型 `ImportedConfig`：

```ts
import {
  collectDomainProviderRules,
  convertDomainListCommunity,
  generateDomainProvider,
  parseIniToConfig,
  renderIni,
  serializeRouteKitConfig,
  summarizeDomainProvider,
  type DomainProviderRule,
  type DomainProviderSummary,
  type ImportedConfig,
  type RouteKitProjectConfig,
  type RuleProviderSource,
  type SourceBase,
  type VendorRepoConfig,
} from "@clash-route-kit/core";
```

在 `previewRules` 之前（约 [program.ts:397](apps/cli/src/program.ts#L397)）追加：

```ts
export interface ImportResult extends ImportedConfig {
  scaffoldPath: string;
}

export async function importIni(
  options: ProgramOptions & { iniFile: string },
): Promise<ImportResult> {
  const iniText = await readFile(resolveInputPath(options.root, options.iniFile), "utf8");
  const imported = parseIniToConfig(iniText);

  const scaffold: RouteKitProjectConfig = {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    customProxyGroups: imported.customProxyGroups,
    ruleSets: imported.ruleSets,
    ruleProviders: [],
  };

  const scaffoldPath = path.join(options.root, "output/imported-routes.yaml");
  await mkdir(path.dirname(scaffoldPath), { recursive: true });
  await writeFile(scaffoldPath, serializeRouteKitConfig(scaffold), "utf8");

  return { ...imported, scaffoldPath };
}
```

- [x] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run apps/cli/tests/importIni.test.ts`
Expected: PASS。

- [x] **Step 5: 接入入口分发**

在 `apps/cli/src/index.ts` 的 import 块加入 `importIni`：

```ts
import {
  buildSubconverterUrl,
  checkConfig,
  generateOutputs,
  importIni,
  previewRules,
  resolveProjectRoot,
  syncVendor,
} from "./program.js";
```

在 `subconvert-url` 分支（[index.ts:60-71](apps/cli/src/index.ts#L60)）之后、`console.log("Usage...")` 之前插入：

```ts
  if (command === "import") {
    const iniFile = process.argv[3];
    if (!iniFile) {
      console.error("Usage: clash-route-kit import <ini-file>");
      process.exitCode = 1;
      return;
    }
    const result = await importIni({ root, configFile, iniFile });
    console.log(
      `[import] groups=${result.customProxyGroups.length} ruleSets=${result.ruleSets.length} warnings=${result.warnings.length}`,
    );
    for (const warning of result.warnings) {
      console.warn(`[import] ${warning}`);
    }
    console.log(`[import] scaffold: ${result.scaffoldPath}`);
    return;
  }
```

并把 usage 行更新为：

```ts
  console.log(
    "Usage: clash-route-kit <generate|preview|check|sync-vendor|subconvert-url|import>",
  );
```

- [x] **Step 6: 类型检查 + 提交**

Run: `pnpm typecheck`
Expected: PASS。

```bash
git add apps/cli/src/program.ts apps/cli/src/index.ts apps/cli/tests/importIni.test.ts
git commit -m "feat(cli): add import command to parse SubConverter INI into scaffold config"
```

---

## Task 4：preview 按 section 分组输出

**Files:**
- Modify: `apps/cli/src/program.ts:398-426`
- Test: `apps/cli/tests/cli.test.ts`

- [x] **Step 1: 写失败测试**

追加：

```ts
  it("groups preview output by ruleSet section", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(
      path.join(root, "routes.yaml"),
      [
        "publishBaseUrl: http://127.0.0.1:8787",
        "template:",
        "  output: Custom_Clash.ini",
        "customProxyGroups:",
        "  - name: AI",
        "    type: select",
        "    options:",
        "      - DIRECT",
        "ruleSets:",
        "  - id: openai",
        "    section: 海外类目",
        "    policy: AI",
        "    source:",
        "      type: geosite",
        "      value: openai",
        "  - id: final",
        "    policy: AI",
        "    source:",
        "      type: final",
        "",
      ].join("\n"),
      "utf8",
    );

    const lines = await previewRules({ root, configFile: "routes.yaml" });
    expect(lines).toContain("# 海外类目");
    expect(lines.indexOf("# 海外类目")).toBeLessThan(lines.indexOf("GEOSITE openai -> AI"));
  });
```

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run -t "preview output by ruleSet section"`
Expected: FAIL（输出无 `# 海外类目`）。

- [x] **Step 3: 实现 —— preview 追踪 section**

把 `apps/cli/src/program.ts:398-426` 的 `previewRules` 整体替换为：

```ts
export async function previewRules(options: ProgramOptions): Promise<string[]> {
  const config = await readConfig(options);
  const lines: string[] = [];
  let lastSection: string | undefined;
  for (const ruleSet of config.ruleSets) {
    if (ruleSet.enabled === false) continue;
    if (ruleSet.section && ruleSet.section !== lastSection) {
      lines.push(`# ${ruleSet.section}`);
      lastSection = ruleSet.section;
    }

    const source = ruleSet.source;
    if (source.type === "rule-provider") {
      lines.push(`${source.behavior.toUpperCase()} ${source.file} -> ${ruleSet.policy}`);
      continue;
    }
    if (source.type === "geosite") {
      lines.push(`GEOSITE ${source.value} -> ${ruleSet.policy}`);
      continue;
    }
    if (source.type === "geoip") {
      lines.push(`GEOIP ${source.value} -> ${ruleSet.policy}`);
      continue;
    }
    if (source.type === "final") {
      lines.push(`FINAL -> ${ruleSet.policy}`);
      continue;
    }

    const unsupported: never = source;
    throw new Error(`Unsupported ruleSet source: ${String(unsupported)}`);
  }
  return lines;
}
```

- [x] **Step 4: 运行测试 + 全量 + 提交**

Run: `pnpm exec vitest run apps/cli/tests/cli.test.ts`
Expected: PASS（原「previews rule order」用例无 section → 不插入 `#` 行，仍含 `GEOSITE github -> 💻 Tech` 与 `FINAL -> 🚀 手动选择`）。

Run: `pnpm typecheck && pnpm test`
Expected: PASS（全工作区）。

```bash
git add apps/cli/src/program.ts apps/cli/tests/cli.test.ts
git commit -m "feat(cli): group preview output by ruleSet section"
```

---

## Self-Review

**1. Spec coverage：** 全局移除清单应用 → Task 1；模板开关写出 → Task 2；导入 INI #8 的 CLI 入口 → Task 3；分段在 preview 可见 → Task 4。（generate 的 INI 段注释由计划 1 的 `renderIni` 负责。）

**2. Placeholder 扫描：** 无；每步含完整代码与命令。

**3. 类型一致性：** `importIni` 返回 `ImportResult extends ImportedConfig`（core 计划 2 定义）+ `scaffoldPath`；`renderIni` 第二参数字段名 `enableRuleGenerator/overwriteOriginalRules/clashRuleBase` 与 core 计划 1 的 `RenderIniOptions`、`template` 字段一致；`config.globalRemove` 与 core 计划 1 的 `RouteKitProjectConfig.globalRemove` 一致；`resolveInputPath` 复用 [program.ts:156](apps/cli/src/program.ts#L156)。
