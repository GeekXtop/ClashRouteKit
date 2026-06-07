# Web 完整配置编辑器实施计划

> **给 agentic worker 的说明：** 必须按任务逐项执行本计划，并使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans。步骤使用 checkbox（`- [ ]`）语法追踪进度。

**目标：** 将 Web 编辑器从“模块编辑 MVP”推进为完整的本地 `config/modules.yaml` 编辑器，覆盖策略组、rule provider、规则文件和保存前草稿校验。

**架构：** 继续保持 local-first：浏览器只访问本地 Vite dev server API，`config/modules.yaml` 与 `config/rules/*.list` 是唯一可写配置面。新增能力仍通过纯 TypeScript mutation/validation helper 驱动，React 组件只负责呈现和调用这些 helper；本地 API 只允许访问固定目录和固定命令。

**技术栈：** React 19、TypeScript、Vite middleware、Vitest、`@clash-route-kit/core`、Node.js `fs`、本地 Git。

---

## 架构决策：不做默认 Docker 部署

本阶段不新增 `Dockerfile`、`docker-compose.yml` 或容器化发布流程。

原因：

- 当前产品方向是 local-first，本地 clone、本地 Web UI、本地 Git 凭据和 GitHub Actions 发布。
- Docker 会让 Windows 路径挂载、Git Credential Manager、SSH key、pnpm cache 和文件权限变复杂。
- 浏览器写入的是当前 Git checkout 内的固定文件；容器化后反而需要额外解释 volume 映射。

允许的后续可选项：

- devcontainer，用于统一开发环境。
- 可选 SubConverter + output server 辅助 compose，用于本地转换调试。

这些不属于当前阶段，也不影响主工作流。

## 当前状态

已经完成：

- Web UI 从本地 `/api/project/config` 加载并保存 `config/modules.yaml`。
- 模块编辑支持 `id`、`policy`、`enabled`、`geosite`、`geoip` 和 provider 引用。
- 发布面板支持 Save -> Check -> Generate -> Git Status -> Commit -> Push。
- YAML diff、dirty 状态和保存就绪状态已经存在。

仍是只读或缺口：

- `PolicyWorkspace.tsx` 只展示 `proxyGroups` 摘要。
- `ProviderWorkspace.tsx` 只展示 `ruleProviders` 摘要。
- 没有 `config/rules/*.list` 文件编辑器。
- `check` 仍以已保存文件为输入；保存前草稿校验还不完整。
- README 的 Local-first usage 仍是英文，且需要明确 Docker 不是默认路径。

## 文件结构

- 修改 `apps/web/src/configMutations.ts`
  添加策略组和 rule provider 的不可变 mutation helper。
- 修改 `apps/web/tests/configMutations.test.ts`
  覆盖新增 mutation helper。
- 创建 `apps/web/src/draftValidation.ts`
  对内存中的 `RouteKitProjectConfig` 做保存前校验。
- 创建 `apps/web/tests/draftValidation.test.ts`
  覆盖策略引用、重复名称、provider 输出和规则文件引用校验。
- 修改 `apps/web/src/projectController.ts`
  让 `canSaveProject` 使用 `draftValidation`。
- 修改 `apps/web/tests/projectController.test.ts`
  覆盖草稿校验接入后的保存就绪状态。
- 创建 `apps/web/src/ruleFiles.ts`
  浏览器端规则文件 API client。
- 创建 `apps/web/tests/ruleFiles.test.ts`
  覆盖规则文件列表、读取和写入请求。
- 修改 `apps/web/dev/routeKitApi.ts`
  添加只允许访问 `config/rules/*.list` 的本地 API。
- 修改 `apps/web/tests/routeKitApi.test.ts`
  覆盖规则文件 API 的路径安全约束。
- 创建 `apps/web/src/components/PolicyEditor.tsx`
  编辑单个策略组。
- 创建 `apps/web/src/components/PolicyList.tsx`
  策略组列表和选择。
- 修改 `apps/web/src/components/PolicyWorkspace.tsx`
  从只读摘要改为列表 + 编辑器。
- 创建 `apps/web/src/components/RuleProviderEditor.tsx`
  编辑单个 rule provider 及 sources。
- 创建 `apps/web/src/components/RuleProviderList.tsx`
  Rule provider 列表和选择。
- 修改 `apps/web/src/components/ProviderWorkspace.tsx`
  从只读摘要改为列表 + 编辑器。
- 创建 `apps/web/src/components/RuleFileWorkspace.tsx`
  列出、读取、编辑和保存 `config/rules/*.list`。
- 修改 `apps/web/src/components/AppShell.tsx`
  增加 Rules 视图入口。
- 修改 `apps/web/src/components/WorkspaceRouter.tsx`
  接入 Policy、Provider、Rules 工作区的编辑回调。
- 修改 `apps/web/src/projectController.ts`
  增加 `selectedPolicyName`、`selectedProviderName`、`selectedRuleFile` 选择状态。
- 修改 `apps/web/src/App.tsx`
  连接新增 mutation helper、规则文件状态和工作区 props。
- 修改 `apps/web/src/styles.css`
  复用现有 editor shell 样式，补齐策略、provider、规则文件编辑器样式。
- 修改 `README.md`
  将 Local-first usage 改成中文，并补充 Docker 非默认说明。

## 任务 1：添加策略组和 Rule Provider Mutation Helper

**文件：**
- 修改：`apps/web/src/configMutations.ts`
- 修改：`apps/web/tests/configMutations.test.ts`

- [x] **步骤 1：编写失败测试**

先修改 `apps/web/tests/configMutations.test.ts` 顶部 type import：

```ts
import type {
  ProviderReference,
  ProxyGroup,
  RouteKitProjectConfig,
  RuleProviderConfig,
  RuleProviderSource,
} from "@clash-route-kit/core";
```

再把新增 helper 加到现有 `../src/configMutations.js` import：

```ts
import {
  addProxyGroup,
  createProxyGroup,
  deleteProxyGroup,
  renameProxyGroup,
  setProxyGroupListField,
  updateProxyGroup,
  addRuleProvider,
  createRuleProvider,
  deleteRuleProvider,
  setRuleProviderListField,
  setRuleProviderSources,
  updateRuleProvider,
} from "../src/configMutations.js";
```

然后在 `describe("config mutation helpers", () => { ... })` 内追加：

```ts
it("creates and updates proxy groups immutably", () => {
  const config = createConfig();
  const created = createProxyGroup(config);
  const added = addProxyGroup(config, created);
  const updated = updateProxyGroup(added, created.name, {
    type: "url-test",
    url: "http://www.gstatic.com/generate_204",
    interval: 300,
    tolerance: 50,
  });

  expect(created).toEqual({
    name: "Policy",
    type: "select",
    options: ["DIRECT"],
  });
  expect(updated.proxyGroups.at(-1)).toEqual({
    name: "Policy",
    type: "url-test",
    options: ["DIRECT"],
    url: "http://www.gstatic.com/generate_204",
    interval: 300,
    tolerance: 50,
  });
  expect(config.proxyGroups).toHaveLength(1);
});

it("renames proxy groups and updates module/final references", () => {
  const config = createConfig();
  const renamed = renameProxyGroup(config, "Proxy", "Main");

  expect(renamed.proxyGroups[0]?.name).toBe("Main");
  expect(renamed.modules[0]?.policy).toBe("Main");
  expect(renamed.final.policy).toBe("Main");
  expect(config.proxyGroups[0]?.name).toBe("Proxy");
});

it("rejects duplicate proxy group names and protects referenced deletes", () => {
  const config = {
    ...createConfig(),
    proxyGroups: [
      { name: "Proxy", type: "select", options: ["DIRECT"] },
      { name: "Unused", type: "select", options: ["Proxy"] },
    ] satisfies ProxyGroup[],
  };

  expect(() => addProxyGroup(config, { name: "Proxy", type: "select", options: ["DIRECT"] })).toThrow("already exists");
  expect(() => deleteProxyGroup(config, "Proxy")).toThrow("Policy group is still referenced: Proxy");
  expect(deleteProxyGroup(config, "Unused").proxyGroups.map((group) => group.name)).toEqual(["Proxy"]);
});

it("normalizes proxy group option and node filter lists", () => {
  const config = createConfig();
  const options = setProxyGroupListField(config, "Proxy", "options", [" DIRECT ", "", "Proxy", "DIRECT"]);
  const filters = setProxyGroupListField(options, "Proxy", "nodeFilters", [" 香港", "香港 ", ""]);

  expect(filters.proxyGroups[0]?.options).toEqual(["DIRECT", "Proxy"]);
  expect(filters.proxyGroups[0]?.nodeFilters).toEqual(["香港"]);
});

it("creates and updates rule providers immutably", () => {
  const config = createConfig();
  const created = createRuleProvider(config);
  const added = addRuleProvider(config, created);
  const sources: RuleProviderSource[] = [
    { name: "Custom", type: "clash-list", path: "config/rules/Custom.list" },
  ];
  const updated = setRuleProviderSources(
    updateRuleProvider(added, created.name, { output: "Policy_Domain.yaml" }),
    created.name,
    sources,
  );

  expect(created).toEqual({
    name: "Provider",
    output: "Provider_Domain.yaml",
    behavior: "domain",
    sources: [],
  });
  expect(updated.ruleProviders?.at(-1)).toEqual({
    name: "Provider",
    output: "Policy_Domain.yaml",
    behavior: "domain",
    sources,
  });
  expect(config.ruleProviders).toEqual([]);
});

it("rejects duplicate rule provider names and outputs", () => {
  const config = {
    ...createConfig(),
    ruleProviders: [
      { name: "AI", output: "AI_Domain.yaml", behavior: "domain", sources: [] },
    ] satisfies RuleProviderConfig[],
  };

  expect(() => addRuleProvider(config, { name: "AI", output: "Other.yaml", behavior: "domain", sources: [] })).toThrow("already exists");
  expect(() => addRuleProvider(config, { name: "Tech", output: "AI_Domain.yaml", behavior: "domain", sources: [] })).toThrow("output already exists");
});

it("normalizes rule provider exclude and remove lists", () => {
  const config = {
    ...createConfig(),
    ruleProviders: [
      { name: "AI", output: "AI_Domain.yaml", behavior: "domain", sources: [] },
    ],
  };

  const excluded = setRuleProviderListField(config, "AI", "exclude", [" DOMAIN,example.com ", "", "DOMAIN,example.com"]);
  const removed = setRuleProviderListField(excluded, "AI", "remove", ["DOMAIN-SUFFIX,old.example"]);

  expect(removed.ruleProviders?.[0]?.exclude).toEqual(["DOMAIN,example.com"]);
  expect(removed.ruleProviders?.[0]?.remove).toEqual(["DOMAIN-SUFFIX,old.example"]);
});

it("deletes rule providers without mutating the original config", () => {
  const config = {
    ...createConfig(),
    ruleProviders: [
      { name: "AI", output: "AI_Domain.yaml", behavior: "domain", sources: [] },
    ],
  };

  expect(deleteRuleProvider(config, "AI").ruleProviders).toEqual([]);
  expect(config.ruleProviders).toHaveLength(1);
});
```

- [x] **步骤 2：运行测试并确认失败**

运行：

```powershell
pnpm test -- apps/web/tests/configMutations.test.ts
```

预期：失败，缺少新增导出函数。

- [x] **步骤 3：实现 mutation helper**

在 `apps/web/src/configMutations.ts` 中扩展 import：

```ts
import type {
  ProviderReference,
  ProxyGroup,
  RouteKitProjectConfig,
  RouteModule,
  RuleProviderConfig,
  RuleProviderSource,
} from "@clash-route-kit/core";
```

添加策略组 helper：

```ts
type ProxyGroupListField = "options" | "nodeFilters";

function normalizeList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function nextName(existing: string[], baseName: string): string {
  const names = new Set(existing);
  if (!names.has(baseName)) return baseName;
  let suffix = 2;
  while (names.has(`${baseName}-${suffix}`)) suffix += 1;
  return `${baseName}-${suffix}`;
}

function cloneProxyGroup(group: ProxyGroup): ProxyGroup {
  return {
    ...group,
    options: [...group.options],
    nodeFilters: group.nodeFilters ? [...group.nodeFilters] : undefined,
  };
}

export function createProxyGroup(config: RouteKitProjectConfig): ProxyGroup {
  return {
    name: nextName(config.proxyGroups.map((group) => group.name), "Policy"),
    type: "select",
    options: ["DIRECT"],
  };
}

export function addProxyGroup(config: RouteKitProjectConfig, group: ProxyGroup): RouteKitProjectConfig {
  const name = group.name.trim();
  if (!name) throw new Error("Policy group name is required");
  if (config.proxyGroups.some((item) => item.name === name)) {
    throw new Error(`Policy group "${name}" already exists`);
  }
  return {
    ...config,
    proxyGroups: [...config.proxyGroups, cloneProxyGroup({ ...group, name })],
  };
}

export function updateProxyGroup(
  config: RouteKitProjectConfig,
  groupName: string,
  patch: Partial<ProxyGroup>,
): RouteKitProjectConfig {
  let found = false;
  const proxyGroups = config.proxyGroups.map((group) => {
    if (group.name !== groupName) return group;
    found = true;
    return cloneProxyGroup({ ...group, ...patch, name: patch.name ?? group.name });
  });
  return found ? { ...config, proxyGroups } : config;
}

export function renameProxyGroup(
  config: RouteKitProjectConfig,
  groupName: string,
  nextGroupName: string,
): RouteKitProjectConfig {
  const name = nextGroupName.trim();
  if (!name) throw new Error("Policy group name is required");
  if (name !== groupName && config.proxyGroups.some((group) => group.name === name)) {
    throw new Error(`Policy group "${name}" already exists`);
  }
  return {
    ...config,
    proxyGroups: config.proxyGroups.map((group) =>
      group.name === groupName ? cloneProxyGroup({ ...group, name }) : group,
    ),
    modules: config.modules.map((module) =>
      module.policy === groupName ? { ...module, policy: name } : module,
    ),
    final: {
      policy: config.final.policy === groupName ? name : config.final.policy,
    },
  };
}

export function deleteProxyGroup(config: RouteKitProjectConfig, groupName: string): RouteKitProjectConfig {
  const referenced =
    config.final.policy === groupName ||
    config.modules.some((module) => module.policy === groupName);
  if (referenced) throw new Error(`Policy group is still referenced: ${groupName}`);
  return {
    ...config,
    proxyGroups: config.proxyGroups.filter((group) => group.name !== groupName),
  };
}

export function setProxyGroupListField(
  config: RouteKitProjectConfig,
  groupName: string,
  field: ProxyGroupListField,
  values: string[],
): RouteKitProjectConfig {
  return updateProxyGroup(config, groupName, {
    [field]: normalizeList(values),
  });
}
```

添加 rule provider helper：

```ts
type RuleProviderListField = "exclude" | "remove";

function cloneRuleProviderSources(sources: RuleProviderSource[]): RuleProviderSource[] {
  return sources.map((source) => ({ ...source }));
}

function cloneRuleProvider(provider: RuleProviderConfig): RuleProviderConfig {
  return {
    ...provider,
    exclude: provider.exclude ? [...provider.exclude] : undefined,
    remove: provider.remove ? [...provider.remove] : undefined,
    sources: cloneRuleProviderSources(provider.sources),
  };
}

export function createRuleProvider(config: RouteKitProjectConfig): RuleProviderConfig {
  const name = nextName((config.ruleProviders ?? []).map((provider) => provider.name), "Provider");
  return {
    name,
    output: `${name}_Domain.yaml`,
    behavior: "domain",
    sources: [],
  };
}

export function addRuleProvider(
  config: RouteKitProjectConfig,
  provider: RuleProviderConfig,
): RouteKitProjectConfig {
  const name = provider.name.trim();
  const output = provider.output.trim();
  if (!name) throw new Error("Rule provider name is required");
  if (!output) throw new Error("Rule provider output is required");
  const providers = config.ruleProviders ?? [];
  if (providers.some((item) => item.name === name)) {
    throw new Error(`Rule provider "${name}" already exists`);
  }
  if (providers.some((item) => item.output === output)) {
    throw new Error(`Rule provider output already exists: ${output}`);
  }
  return {
    ...config,
    ruleProviders: [...providers, cloneRuleProvider({ ...provider, name, output })],
  };
}

export function updateRuleProvider(
  config: RouteKitProjectConfig,
  providerName: string,
  patch: Partial<RuleProviderConfig>,
): RouteKitProjectConfig {
  let found = false;
  const providers = (config.ruleProviders ?? []).map((provider) => {
    if (provider.name !== providerName) return provider;
    found = true;
    return cloneRuleProvider({ ...provider, ...patch });
  });
  return found ? { ...config, ruleProviders: providers } : config;
}

export function deleteRuleProvider(config: RouteKitProjectConfig, providerName: string): RouteKitProjectConfig {
  return {
    ...config,
    ruleProviders: (config.ruleProviders ?? []).filter((provider) => provider.name !== providerName),
  };
}

export function setRuleProviderSources(
  config: RouteKitProjectConfig,
  providerName: string,
  sources: RuleProviderSource[],
): RouteKitProjectConfig {
  return updateRuleProvider(config, providerName, {
    sources: cloneRuleProviderSources(sources),
  });
}

export function setRuleProviderListField(
  config: RouteKitProjectConfig,
  providerName: string,
  field: RuleProviderListField,
  values: string[],
): RouteKitProjectConfig {
  return updateRuleProvider(config, providerName, {
    [field]: normalizeList(values),
  });
}
```

- [x] **步骤 4：验证测试通过**

运行：

```powershell
pnpm test -- apps/web/tests/configMutations.test.ts
```

预期：所有 `config mutation helpers` 测试通过。

## 任务 2：添加草稿配置校验

**文件：**
- 创建：`apps/web/src/draftValidation.ts`
- 创建：`apps/web/tests/draftValidation.test.ts`
- 修改：`apps/web/src/projectController.ts`
- 修改：`apps/web/tests/projectController.test.ts`

- [x] **步骤 1：编写失败测试**

创建 `apps/web/tests/draftValidation.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { validateDraftConfig } from "../src/draftValidation.js";

function createConfig(): RouteKitProjectConfig {
  return {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    proxyGroups: [
      { name: "Proxy", type: "select", options: ["DIRECT"] },
      { name: "AI", type: "select", options: ["Proxy", "DIRECT"] },
    ],
    modules: [
      { id: "ai", policy: "AI", providers: [{ behavior: "domain", file: "AI_Domain.yaml" }] },
    ],
    final: { policy: "Proxy" },
    ruleProviders: [
      {
        name: "AI",
        output: "AI_Domain.yaml",
        behavior: "domain",
        sources: [{ name: "AI", type: "clash-list", path: "config/rules/AI.list" }],
      },
    ],
  };
}

describe("draft config validation", () => {
  it("accepts a valid draft config", () => {
    expect(validateDraftConfig(createConfig())).toEqual([]);
  });

  it("reports duplicate policy group names and missing policy references", () => {
    const config = {
      ...createConfig(),
      proxyGroups: [
        { name: "Proxy", type: "select", options: ["DIRECT"] },
        { name: "Proxy", type: "select", options: ["DIRECT"] },
      ],
      modules: [{ id: "ai", policy: "Missing" }],
      final: { policy: "Gone" },
    };

    expect(validateDraftConfig(config)).toEqual([
      "策略组名称不能重复：Proxy",
      "模块 ai 引用了不存在的策略：Missing",
      "FINAL 引用了不存在的策略：Gone",
    ]);
  });

  it("reports duplicate modules and invalid provider references", () => {
    const config = {
      ...createConfig(),
      modules: [
        { id: "ai", policy: "AI", providers: [{ behavior: "domain", file: "" }] },
        { id: "ai", policy: "AI", providers: [{ behavior: "domain", file: "Missing.yaml" }] },
      ],
    };

    expect(validateDraftConfig(config)).toEqual([
      "模块 ID 不能重复：ai",
      "模块 ai 的 provider 文件不能为空",
      "模块 ai 引用了不存在的 provider 输出：Missing.yaml",
    ]);
  });

  it("reports invalid rule providers and unsafe rule source paths", () => {
    const config = {
      ...createConfig(),
      ruleProviders: [
        { name: "AI", output: "AI_Domain.yaml", behavior: "domain", sources: [] },
        {
          name: "AI",
          output: "AI_Domain.yaml",
          behavior: "domain",
          sources: [{ name: "Bad", type: "clash-list", path: "../secret.list" }],
        },
      ],
    };

    expect(validateDraftConfig(config)).toEqual([
      "Rule provider 名称不能重复：AI",
      "Rule provider 输出不能重复：AI_Domain.yaml",
      "Rule provider AI 至少需要一个 source",
      "Rule provider AI 的 source Bad 必须位于 config/rules/*.list：../secret.list",
    ]);
  });
});
```

在 `apps/web/tests/projectController.test.ts` 追加：

```ts
it("uses draft validation diagnostics for save readiness", () => {
  const config = createConfig();
  const controller = createProjectController({ yaml: serializeRouteKitConfig(config), config });
  const dirty = applyDraftConfig(controller, {
    ...config,
    modules: [{ id: "ai", policy: "Missing" }],
  });

  expect(canSaveProject(dirty)).toEqual({
    ok: false,
    reason: "模块 ai 引用了不存在的策略：Missing",
  });
});
```

- [x] **步骤 2：运行测试并确认失败**

运行：

```powershell
pnpm test -- apps/web/tests/draftValidation.test.ts apps/web/tests/projectController.test.ts
```

预期：失败，缺少 `draftValidation.ts`，且 `canSaveProject` 尚未使用它。

- [x] **步骤 3：实现 `draftValidation.ts`**

创建 `apps/web/src/draftValidation.ts`：

```ts
import type { RouteKitProjectConfig, RuleProviderConfig, RuleProviderSource } from "@clash-route-kit/core";

function addDuplicateDiagnostics(values: string[], label: string, diagnostics: string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    if (seen.has(value)) diagnostics.push(`${label}重复：${value}`);
    seen.add(value);
  }
}

function isConfigRuleListPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return /^config\/rules\/[^/]+\.list$/.test(normalized);
}

function validateRuleProviderSource(
  provider: RuleProviderConfig,
  source: RuleProviderSource,
  diagnostics: string[],
): void {
  if (!source.name.trim()) {
    diagnostics.push(`Rule provider ${provider.name} 的 source 名称不能为空`);
  }
  if (source.type === "clash-list" && !isConfigRuleListPath(source.path)) {
    diagnostics.push(`Rule provider ${provider.name} 的 source ${source.name} 必须位于 config/rules/*.list：${source.path}`);
  }
  if (source.type === "clash-provider" && !source.path.trim()) {
    diagnostics.push(`Rule provider ${provider.name} 的 source ${source.name} path 不能为空`);
  }
  if (source.type === "domain-list-community" && !source.entry.trim()) {
    diagnostics.push(`Rule provider ${provider.name} 的 source ${source.name} entry 不能为空`);
  }
}

export function validateDraftConfig(config: RouteKitProjectConfig): string[] {
  const diagnostics: string[] = [];
  const policies = new Set(config.proxyGroups.map((group) => group.name));
  const providerOutputs = new Set((config.ruleProviders ?? []).map((provider) => provider.output));

  addDuplicateDiagnostics(config.proxyGroups.map((group) => group.name), "策略组名称", diagnostics);
  addDuplicateDiagnostics(config.modules.map((module) => module.id), "模块 ID ", diagnostics);
  addDuplicateDiagnostics((config.ruleProviders ?? []).map((provider) => provider.name), "Rule provider 名称", diagnostics);
  addDuplicateDiagnostics((config.ruleProviders ?? []).map((provider) => provider.output), "Rule provider 输出", diagnostics);

  for (const group of config.proxyGroups) {
    if (!group.name.trim()) diagnostics.push("策略组名称不能为空");
    if (group.options.length === 0) diagnostics.push(`策略组 ${group.name} 至少需要一个 option`);
  }

  for (const module of config.modules) {
    if (!module.id.trim()) diagnostics.push("模块 ID 不能为空");
    if (!module.policy.trim()) diagnostics.push(`模块 ${module.id} 的策略不能为空`);
    if (module.policy.trim() && !policies.has(module.policy)) {
      diagnostics.push(`模块 ${module.id} 引用了不存在的策略：${module.policy}`);
    }
    for (const provider of module.providers ?? []) {
      if (!provider.file.trim()) {
        diagnostics.push(`模块 ${module.id} 的 provider 文件不能为空`);
      } else if (!providerOutputs.has(provider.file)) {
        diagnostics.push(`模块 ${module.id} 引用了不存在的 provider 输出：${provider.file}`);
      }
    }
  }

  if (!config.final.policy.trim()) diagnostics.push("FINAL 策略不能为空");
  if (config.final.policy.trim() && !policies.has(config.final.policy)) {
    diagnostics.push(`FINAL 引用了不存在的策略：${config.final.policy}`);
  }

  for (const provider of config.ruleProviders ?? []) {
    if (!provider.name.trim()) diagnostics.push("Rule provider 名称不能为空");
    if (!provider.output.trim()) diagnostics.push(`Rule provider ${provider.name} 输出不能为空`);
    if (provider.sources.length === 0) diagnostics.push(`Rule provider ${provider.name} 至少需要一个 source`);
    for (const source of provider.sources) {
      validateRuleProviderSource(provider, source, diagnostics);
    }
  }

  return diagnostics;
}
```

- [x] **步骤 4：接入 `canSaveProject`**

修改 `apps/web/src/projectController.ts`：

```ts
import { validateDraftConfig } from "./draftValidation.js";
```

将 `canSaveProject` 中现有逐项校验替换为：

```ts
export function canSaveProject(state: ProjectControllerState): SaveReadiness {
  if (!state.dirty) {
    return {
      ok: false,
      reason: "没有未保存的修改",
    };
  }

  const diagnostics = validateDraftConfig(state.draftConfig);
  if (diagnostics.length > 0) {
    return {
      ok: false,
      reason: diagnostics[0]!,
    };
  }

  return { ok: true };
}
```

- [x] **步骤 5：验证测试通过**

运行：

```powershell
pnpm test -- apps/web/tests/draftValidation.test.ts apps/web/tests/projectController.test.ts
```

预期：测试通过。

## 任务 3：添加安全的规则文件本地 API 和 Client

**文件：**
- 创建：`apps/web/src/ruleFiles.ts`
- 创建：`apps/web/tests/ruleFiles.test.ts`
- 修改：`apps/web/dev/routeKitApi.ts`
- 修改：`apps/web/tests/routeKitApi.test.ts`

- [x] **步骤 1：编写 client 失败测试**

创建 `apps/web/tests/ruleFiles.test.ts`：

```ts
import { describe, expect, it, vi } from "vitest";
import {
  listRuleFiles,
  loadRuleFile,
  saveRuleFile,
} from "../src/ruleFiles.js";

describe("rule file client", () => {
  it("lists config rule files", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ files: ["AI.list"] }), { status: 200 }));

    await expect(listRuleFiles(fetcher)).resolves.toEqual(["AI.list"]);
    expect(fetcher).toHaveBeenCalledWith("/api/project/rules");
  });

  it("loads one config rule file", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ file: "AI.list", text: "DOMAIN,openai.com\n" }), { status: 200 }));

    await expect(loadRuleFile("AI.list", fetcher)).resolves.toEqual({
      file: "AI.list",
      text: "DOMAIN,openai.com\n",
    });
    expect(fetcher).toHaveBeenCalledWith("/api/project/rules/AI.list");
  });

  it("saves one config rule file", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ file: "AI.list", text: "DOMAIN,openai.com\n" }), { status: 200 }));

    await expect(saveRuleFile("AI.list", "DOMAIN,openai.com\n", fetcher)).resolves.toEqual({
      file: "AI.list",
      text: "DOMAIN,openai.com\n",
    });
    expect(fetcher).toHaveBeenCalledWith("/api/project/rules/AI.list", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "DOMAIN,openai.com\n" }),
    });
  });
});
```

- [x] **步骤 2：编写 API helper 失败测试**

先把新增 helper 加到 `apps/web/tests/routeKitApi.test.ts` 顶部现有 `../dev/routeKitApi.js` import：

```ts
import {
  listProjectRuleFiles,
  readProjectConfigFile,
  readProjectRuleFile,
  runRouteKitAction,
  writeProjectConfigFile,
  writeProjectRuleFile,
} from "../dev/routeKitApi.js";
```

然后在文件末尾追加：

```ts
describe("project rule file helpers", () => {
  const root = path.resolve("fixture-repo");

  it("lists only .list files under config/rules", async () => {
    const files = await listProjectRuleFiles({
      root,
      configFile: "config/modules.yaml",
      readDirectory: async (directory) => {
        expect(directory).toBe(path.resolve(root, "config/rules"));
        return ["AI.list", "README.md", "Custom.list"];
      },
    });

    expect(files).toEqual(["AI.list", "Custom.list"]);
  });

  it("reads and writes rule files under config/rules", async () => {
    const reads: string[] = [];
    const writes: Array<{ filePath: string; text: string }> = [];
    const read = await readProjectRuleFile({
      root,
      configFile: "config/modules.yaml",
      file: "AI.list",
      readText: async (filePath) => {
        reads.push(filePath);
        return "DOMAIN,openai.com\n";
      },
    });
    const write = await writeProjectRuleFile({
      root,
      configFile: "config/modules.yaml",
      file: "AI.list",
      text: "DOMAIN,openai.com\n",
      writeText: async (filePath, text) => {
        writes.push({ filePath, text });
      },
    });

    expect(read).toEqual({ file: "AI.list", text: "DOMAIN,openai.com\n" });
    expect(write).toEqual({ file: "AI.list", text: "DOMAIN,openai.com\n" });
    expect(reads[0]).toBe(path.resolve(root, "config/rules/AI.list"));
    expect(writes[0]).toEqual({
      filePath: path.resolve(root, "config/rules/AI.list"),
      text: "DOMAIN,openai.com\n",
    });
  });

  it("rejects path traversal and non-list rule files", async () => {
    await expect(readProjectRuleFile({
      root,
      configFile: "config/modules.yaml",
      file: "../modules.yaml",
      readText: async () => "",
    })).rejects.toThrow("Invalid rule file");

    await expect(writeProjectRuleFile({
      root,
      configFile: "config/modules.yaml",
      file: "AI.yaml",
      text: "",
      writeText: async () => {},
    })).rejects.toThrow("Invalid rule file");
  });
});
```

- [x] **步骤 3：运行测试并确认失败**

运行：

```powershell
pnpm test -- apps/web/tests/ruleFiles.test.ts apps/web/tests/routeKitApi.test.ts
```

预期：失败，缺少 client 和 API helper。

- [x] **步骤 4：实现浏览器 client**

创建 `apps/web/src/ruleFiles.ts`：

```ts
export interface RuleFileResponse {
  file: string;
  text: string;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isRuleFileResponse(value: unknown): value is RuleFileResponse {
  const candidate = value as RuleFileResponse;
  return typeof candidate?.file === "string" && typeof candidate.text === "string";
}

async function readJson(response: Response): Promise<unknown> {
  const payload = (await response.json()) as unknown;
  if (!response.ok) throw new Error("Invalid rule file response");
  return payload;
}

export async function listRuleFiles(fetcher: Fetcher = globalThis.fetch): Promise<string[]> {
  const payload = (await readJson(await fetcher("/api/project/rules"))) as { files?: unknown };
  if (!Array.isArray(payload.files) || !payload.files.every((file) => typeof file === "string")) {
    throw new Error("Invalid rule file response");
  }
  return payload.files;
}

export async function loadRuleFile(
  file: string,
  fetcher: Fetcher = globalThis.fetch,
): Promise<RuleFileResponse> {
  const payload = await readJson(await fetcher(`/api/project/rules/${encodeURIComponent(file)}`));
  if (!isRuleFileResponse(payload)) throw new Error("Invalid rule file response");
  return payload;
}

export async function saveRuleFile(
  file: string,
  text: string,
  fetcher: Fetcher = globalThis.fetch,
): Promise<RuleFileResponse> {
  const payload = await readJson(
    await fetcher(`/api/project/rules/${encodeURIComponent(file)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    }),
  );
  if (!isRuleFileResponse(payload)) throw new Error("Invalid rule file response");
  return payload;
}
```

- [x] **步骤 5：实现本地 API helper 和 routes**

在 `apps/web/dev/routeKitApi.ts` 修改 import：

```ts
import { readFile, readdir, writeFile } from "node:fs/promises";
```

添加类型和 helper：

```ts
type ReadDirectory = (directory: string) => Promise<string[]>;

export interface ProjectRuleFilesOptions extends ProgramOptions {
  readDirectory?: ReadDirectory;
}

export interface ProjectRuleFileOptions extends ProgramOptions {
  file: string;
  readText?: ReadText;
}

export interface WriteProjectRuleFileOptions extends ProgramOptions {
  file: string;
  text: string;
  writeText?: WriteText;
}

export interface ProjectRuleFileResult {
  file: string;
  text: string;
}

function rulesDirectory(options: ProgramOptions): string {
  return path.resolve(options.root, "config/rules");
}

function resolveRuleFile(options: ProgramOptions, file: string): string {
  if (!/^[A-Za-z0-9_.-]+\.list$/.test(file)) {
    throw new Error(`Invalid rule file: ${file}`);
  }
  const directory = rulesDirectory(options);
  const resolved = path.resolve(directory, file);
  if (!resolved.startsWith(`${directory}${path.sep}`)) {
    throw new Error(`Invalid rule file: ${file}`);
  }
  return resolved;
}

export async function listProjectRuleFiles(options: ProjectRuleFilesOptions): Promise<string[]> {
  const readDirectory = options.readDirectory ?? ((directory: string) => readdir(directory));
  return (await readDirectory(rulesDirectory(options)))
    .filter((file) => /^[A-Za-z0-9_.-]+\.list$/.test(file))
    .sort();
}

export async function readProjectRuleFile(options: ProjectRuleFileOptions): Promise<ProjectRuleFileResult> {
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  return {
    file: options.file,
    text: await readText(resolveRuleFile(options, options.file)),
  };
}

export async function writeProjectRuleFile(options: WriteProjectRuleFileOptions): Promise<ProjectRuleFileResult> {
  const writeText = options.writeText ?? ((filePath: string, text: string) => writeFile(filePath, text, "utf8"));
  const text = options.text.replace(/\r\n?/g, "\n").replace(/\n?$/, "\n");
  await writeText(resolveRuleFile(options, options.file), text);
  return {
    file: options.file,
    text,
  };
}
```

在 `createRouteKitApiHandler` 的 `/api/project/config` 分支之后添加：

```ts
if (url.pathname === "/api/project/rules") {
  if (request.method !== "GET") {
    writeJson(response, 405, { ok: false, output: "Method not allowed" });
    return;
  }
  void listProjectRuleFiles(options)
    .then((files) => writeJson(response, 200, { files }))
    .catch((error: unknown) => {
      writeJson(response, 500, {
        ok: false,
        output: error instanceof Error ? error.message : String(error),
      });
    });
  return;
}

if (url.pathname.startsWith("/api/project/rules/")) {
  const file = decodeURIComponent(url.pathname.slice("/api/project/rules/".length));
  if (request.method === "GET") {
    void readProjectRuleFile({ ...options, file })
      .then((result) => writeJson(response, 200, result))
      .catch((error: unknown) => {
        writeJson(response, 400, {
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
        .then(() => JSON.parse(body) as { text?: unknown })
        .then((payload) => {
          if (typeof payload.text !== "string") throw new Error("Missing rule file text");
          return writeProjectRuleFile({ ...options, file, text: payload.text });
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

- [x] **步骤 6：验证测试通过**

运行：

```powershell
pnpm test -- apps/web/tests/ruleFiles.test.ts apps/web/tests/routeKitApi.test.ts
```

预期：测试通过。

## 任务 4：接入选择状态和工作区回调

**文件：**
- 修改：`apps/web/src/projectController.ts`
- 修改：`apps/web/tests/projectController.test.ts`
- 修改：`apps/web/src/useProjectDraftActions.ts`
- 修改：`apps/web/src/App.tsx`
- 修改：`apps/web/src/components/WorkspaceRouter.tsx`

- [x] **步骤 1：编写失败测试**

在 `apps/web/tests/projectController.test.ts` 追加：

```ts
it("selects first policy, provider, and rule file when available", () => {
  const config = {
    ...createConfig(),
    ruleProviders: [{ name: "AI", output: "AI_Domain.yaml", behavior: "domain", sources: [] }],
  };
  const controller = createProjectController({
    yaml: serializeRouteKitConfig(config),
    config,
  });

  expect(controller.selectedPolicyName).toBe("Proxy");
  expect(controller.selectedProviderName).toBe("AI");
  expect(controller.selectedRuleFile).toBe("");
});

it("keeps selections valid after draft changes", () => {
  const config = {
    ...createConfig(),
    ruleProviders: [{ name: "AI", output: "AI_Domain.yaml", behavior: "domain", sources: [] }],
  };
  const controller = setProjectSelection(
    createProjectController({
      yaml: serializeRouteKitConfig(config),
      config,
    }),
    { selectedPolicyName: "Proxy", selectedProviderName: "AI", selectedRuleFile: "AI.list" },
  );

  const next = applyDraftConfig(controller, {
    ...config,
    proxyGroups: [{ name: "Direct", type: "select", options: ["DIRECT"] }],
    modules: [{ id: "direct", policy: "Direct" }],
    final: { policy: "Direct" },
    ruleProviders: [],
  });

  expect(next.selectedPolicyName).toBe("Direct");
  expect(next.selectedProviderName).toBe("");
  expect(next.selectedRuleFile).toBe("AI.list");
});
```

- [x] **步骤 2：运行测试并确认失败**

运行：

```powershell
pnpm test -- apps/web/tests/projectController.test.ts
```

预期：失败，`ProjectControllerState` 缺少新选择字段。

- [x] **步骤 3：扩展 ProjectControllerState**

修改 `apps/web/src/projectController.ts`：

```ts
export interface ProjectControllerState {
  originalYaml: string;
  originalConfig: RouteKitProjectConfig;
  draftConfig: RouteKitProjectConfig;
  draftYaml: string;
  dirty: boolean;
  status: ProjectStatus;
  message: string;
  validation: ProjectValidationState;
  selectedView: ProjectView;
  selectedModuleId: string;
  selectedPolicyName: string;
  selectedProviderName: string;
  selectedRuleFile: string;
}
```

添加 helper：

```ts
function firstPolicyName(config: RouteKitProjectConfig): string {
  return config.proxyGroups[0]?.name ?? "";
}

function firstProviderName(config: RouteKitProjectConfig): string {
  return config.ruleProviders?.[0]?.name ?? "";
}

function hasSelectedPolicy(config: RouteKitProjectConfig, name: string): boolean {
  return config.proxyGroups.some((group) => group.name === name);
}

function hasSelectedProvider(config: RouteKitProjectConfig, name: string): boolean {
  return (config.ruleProviders ?? []).some((provider) => provider.name === name);
}
```

更新 `createProjectController`：

```ts
selectedPolicyName: firstPolicyName(snapshot.config),
selectedProviderName: firstProviderName(snapshot.config),
selectedRuleFile: "",
```

更新 `applyDraftConfig` 的返回值：

```ts
selectedPolicyName: hasSelectedPolicy(draftConfig, state.selectedPolicyName)
  ? state.selectedPolicyName
  : firstPolicyName(draftConfig),
selectedProviderName: hasSelectedProvider(draftConfig, state.selectedProviderName)
  ? state.selectedProviderName
  : firstProviderName(draftConfig),
selectedRuleFile: state.selectedRuleFile,
```

更新 `setProjectSelection` 类型：

```ts
selection: Partial<Pick<ProjectControllerState, "selectedView" | "selectedModuleId" | "selectedPolicyName" | "selectedProviderName" | "selectedRuleFile">>,
```

- [x] **步骤 4：扩展 draft actions**

在 `apps/web/src/useProjectDraftActions.ts` 导入新增 helper：

```ts
import {
  addModule,
  addProxyGroup,
  addRuleProvider,
  createModule,
  createProxyGroup,
  createRuleProvider,
  deleteModule,
  deleteProxyGroup,
  deleteRuleProvider,
  renameProxyGroup,
  setModuleProviderRefs,
  setModuleTags,
  setProxyGroupListField,
  setRuleProviderListField,
  setRuleProviderSources,
  toggleModule,
  updateModule,
  updateProxyGroup,
  updateRuleProvider,
} from "./configMutations.js";
```

在返回对象中添加：

```ts
createPolicy() {
  mutate((current) => addProxyGroup(current, createProxyGroup(current)));
},
updatePolicy(groupName: string, patch: Partial<ProxyGroup>) {
  mutate((current) => updateProxyGroup(current, groupName, patch));
},
renamePolicy(groupName: string, nextGroupName: string) {
  mutate((current) => renameProxyGroup(current, groupName, nextGroupName));
},
deletePolicy(groupName: string) {
  mutate((current) => deleteProxyGroup(current, groupName));
},
setPolicyListField(groupName: string, field: "options" | "nodeFilters", values: string[]) {
  mutate((current) => setProxyGroupListField(current, groupName, field, values));
},
createProvider() {
  mutate((current) => addRuleProvider(current, createRuleProvider(current)));
},
updateProvider(providerName: string, patch: Partial<RuleProviderConfig>) {
  mutate((current) => updateRuleProvider(current, providerName, patch));
},
deleteProvider(providerName: string) {
  mutate((current) => deleteRuleProvider(current, providerName));
},
setProviderSources(providerName: string, sources: RuleProviderSource[]) {
  mutate((current) => setRuleProviderSources(current, providerName, sources));
},
setProviderListField(providerName: string, field: "exclude" | "remove", values: string[]) {
  mutate((current) => setRuleProviderListField(current, providerName, field, values));
},
```

同时添加 type import：

```ts
import type { ProxyGroup, RuleProviderConfig, RuleProviderSource } from "@clash-route-kit/core";
```

- [x] **步骤 5：扩展 App 和 WorkspaceRouter props**

在 `apps/web/src/App.tsx` 中计算：

```ts
const selectedPolicy = config.proxyGroups.find((group) => group.name === project.selectedPolicyName) ?? config.proxyGroups[0];
const selectedProvider = (config.ruleProviders ?? []).find((provider) => provider.name === project.selectedProviderName) ?? config.ruleProviders?.[0];
```

传入 `WorkspaceRouter`：

```tsx
selectedPolicy={selectedPolicy}
selectedProvider={selectedProvider}
onCreatePolicy={draftActions.createPolicy}
onUpdatePolicy={draftActions.updatePolicy}
onRenamePolicy={draftActions.renamePolicy}
onDeletePolicy={draftActions.deletePolicy}
onSetPolicyListField={draftActions.setPolicyListField}
onSelectPolicy={(selectedPolicyName) => setProject((current) => setProjectSelection(current, { selectedPolicyName }))}
onCreateProvider={draftActions.createProvider}
onUpdateProvider={draftActions.updateProvider}
onDeleteProvider={draftActions.deleteProvider}
onSetProviderSources={draftActions.setProviderSources}
onSetProviderListField={draftActions.setProviderListField}
onSelectProvider={(selectedProviderName) => setProject((current) => setProjectSelection(current, { selectedProviderName }))}
```

在 `apps/web/src/components/WorkspaceRouter.tsx` 扩展 props，并将 `policies` 和 `providers` 分支改为调用新工作区 props。

- [x] **步骤 6：验证类型检查和测试**

运行：

```powershell
pnpm test -- apps/web/tests/projectController.test.ts apps/web/tests/configMutations.test.ts
pnpm typecheck
```

预期：测试和类型检查通过。

## 任务 5：构建策略组编辑器

**文件：**
- 创建：`apps/web/src/components/PolicyList.tsx`
- 创建：`apps/web/src/components/PolicyEditor.tsx`
- 修改：`apps/web/src/components/PolicyWorkspace.tsx`
- 修改：`apps/web/src/styles.css`

- [x] **步骤 1：实现 `PolicyList.tsx`**

创建 `apps/web/src/components/PolicyList.tsx`：

```tsx
import { Plus } from "lucide-react";
import type { ProxyGroup } from "@clash-route-kit/core";
import type { PolicyStat } from "../routeSummary.js";

export function PolicyList({
  policies,
  policyStats,
  selectedPolicyName,
  onCreatePolicy,
  onSelectPolicy,
}: {
  policies: ProxyGroup[];
  policyStats: PolicyStat[];
  selectedPolicyName: string;
  onCreatePolicy: () => void;
  onSelectPolicy: (policyName: string) => void;
}) {
  return (
    <aside className="entity-list">
      <div className="entity-list-header">
        <div>
          <h2>策略组</h2>
          <span>{policies.length} groups</span>
        </div>
        <button className="icon-button" type="button" aria-label="create policy" onClick={onCreatePolicy}>
          <Plus size={16} />
        </button>
      </div>
      <div className="entity-items">
        {policies.map((policy) => {
          const stat = policyStats.find((item) => item.name === policy.name);
          return (
            <button
              className={`entity-row ${policy.name === selectedPolicyName ? "active" : ""}`}
              key={policy.name}
              type="button"
              onClick={() => onSelectPolicy(policy.name)}
            >
              <strong>{policy.name}</strong>
              <span>{policy.type} / {stat?.modules ?? 0} modules / {policy.options.length} options</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
```

- [x] **步骤 2：实现 `PolicyEditor.tsx`**

创建 `apps/web/src/components/PolicyEditor.tsx`：

```tsx
import type { ProxyGroup } from "@clash-route-kit/core";

const policyTypes: ProxyGroup["type"][] = ["select", "url-test", "fallback", "load-balance"];

function listText(values: string[] | undefined): string {
  return (values ?? []).join("\n");
}

function parseListText(value: string): string[] {
  return value.split("\n");
}

export function PolicyEditor({
  policy,
  onDeletePolicy,
  onRenamePolicy,
  onSetPolicyListField,
  onUpdatePolicy,
}: {
  policy: ProxyGroup | undefined;
  onDeletePolicy: (policyName: string) => void;
  onRenamePolicy: (policyName: string, nextPolicyName: string) => void;
  onSetPolicyListField: (policyName: string, field: "options" | "nodeFilters", values: string[]) => void;
  onUpdatePolicy: (policyName: string, patch: Partial<ProxyGroup>) => void;
}) {
  if (!policy) {
    return <section className="panel editor-panel"><div className="empty-state">暂无策略组</div></section>;
  }

  return (
    <section className="panel editor-panel">
      <div className="panel-heading">
        <div>
          <h2>编辑策略组</h2>
          <span>{policy.name}</span>
        </div>
      </div>
      <div className="form-grid">
        <label>
          <span>名称</span>
          <input value={policy.name} onChange={(event) => onRenamePolicy(policy.name, event.target.value)} />
        </label>
        <label>
          <span>类型</span>
          <select value={policy.type} onChange={(event) => onUpdatePolicy(policy.name, { type: event.target.value as ProxyGroup["type"] })}>
            {policyTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label>
          <span>测速 URL</span>
          <input value={policy.url ?? ""} onChange={(event) => onUpdatePolicy(policy.name, { url: event.target.value || undefined })} />
        </label>
        <label>
          <span>间隔</span>
          <input
            inputMode="numeric"
            value={policy.interval ?? ""}
            onChange={(event) => onUpdatePolicy(policy.name, { interval: event.target.value ? Number(event.target.value) : undefined })}
          />
        </label>
        <label>
          <span>容差</span>
          <input
            inputMode="numeric"
            value={policy.tolerance ?? ""}
            onChange={(event) => onUpdatePolicy(policy.name, { tolerance: event.target.value ? Number(event.target.value) : undefined })}
          />
        </label>
        <label className="wide-field">
          <span>Options</span>
          <textarea value={listText(policy.options)} onChange={(event) => onSetPolicyListField(policy.name, "options", parseListText(event.target.value))} />
        </label>
        <label className="wide-field">
          <span>Node Filters</span>
          <textarea value={listText(policy.nodeFilters)} onChange={(event) => onSetPolicyListField(policy.name, "nodeFilters", parseListText(event.target.value))} />
        </label>
      </div>
      <button className="danger-button" type="button" onClick={() => {
        if (window.confirm(`删除策略组 ${policy.name}？`)) onDeletePolicy(policy.name);
      }}>
        删除策略组
      </button>
    </section>
  );
}
```

- [x] **步骤 3：改造 `PolicyWorkspace.tsx`**

将 `apps/web/src/components/PolicyWorkspace.tsx` 替换为：

```tsx
import type { ProxyGroup, RouteKitProjectConfig } from "@clash-route-kit/core";
import type { PolicyStat } from "../routeSummary.js";
import { PolicyEditor } from "./PolicyEditor.js";
import { PolicyList } from "./PolicyList.js";

export function PolicyWorkspace({
  config,
  onCreatePolicy,
  onDeletePolicy,
  onRenamePolicy,
  onSelectPolicy,
  onSetPolicyListField,
  onUpdatePolicy,
  policyStats,
  selectedPolicy,
}: {
  config: RouteKitProjectConfig;
  onCreatePolicy: () => void;
  onDeletePolicy: (policyName: string) => void;
  onRenamePolicy: (policyName: string, nextPolicyName: string) => void;
  onSelectPolicy: (policyName: string) => void;
  onSetPolicyListField: (policyName: string, field: "options" | "nodeFilters", values: string[]) => void;
  onUpdatePolicy: (policyName: string, patch: Partial<ProxyGroup>) => void;
  policyStats: PolicyStat[];
  selectedPolicy: ProxyGroup | undefined;
}) {
  return (
    <div className="entity-workspace">
      <PolicyList
        policies={config.proxyGroups}
        policyStats={policyStats}
        selectedPolicyName={selectedPolicy?.name ?? ""}
        onCreatePolicy={onCreatePolicy}
        onSelectPolicy={onSelectPolicy}
      />
      <PolicyEditor
        policy={selectedPolicy}
        onDeletePolicy={onDeletePolicy}
        onRenamePolicy={onRenamePolicy}
        onSetPolicyListField={onSetPolicyListField}
        onUpdatePolicy={onUpdatePolicy}
      />
    </div>
  );
}
```

- [x] **步骤 4：添加样式**

在 `apps/web/src/styles.css` 追加：

```css
.entity-workspace {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: 16px;
  min-width: 0;
}

.entity-list {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  min-width: 0;
  padding: 14px;
}

.entity-list-header,
.entity-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.entity-items {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.entity-row {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  cursor: pointer;
  padding: 10px;
  text-align: left;
}

.entity-row.active {
  border-color: var(--accent);
}

.entity-row span {
  color: var(--muted);
  font-size: 12px;
}

.wide-field {
  grid-column: 1 / -1;
}

.danger-button {
  background: #fff1f0;
  border: 1px solid #ffccc7;
  border-radius: 8px;
  color: #a8071a;
  cursor: pointer;
  margin-top: 16px;
  padding: 10px 12px;
}

@media (max-width: 900px) {
  .entity-workspace {
    grid-template-columns: 1fr;
  }
}
```

- [x] **步骤 5：验证类型检查和构建**

运行：

```powershell
pnpm typecheck
pnpm build
```

预期：类型检查和构建通过。

## 任务 6：构建 Rule Provider 编辑器

**文件：**
- 创建：`apps/web/src/components/RuleProviderList.tsx`
- 创建：`apps/web/src/components/RuleProviderEditor.tsx`
- 修改：`apps/web/src/components/ProviderWorkspace.tsx`
- 修改：`apps/web/src/styles.css`

- [x] **步骤 1：实现 `RuleProviderList.tsx`**

创建 `apps/web/src/components/RuleProviderList.tsx`：

```tsx
import { Plus } from "lucide-react";
import type { RuleProviderConfig } from "@clash-route-kit/core";

export function RuleProviderList({
  providers,
  selectedProviderName,
  onCreateProvider,
  onSelectProvider,
}: {
  providers: RuleProviderConfig[];
  selectedProviderName: string;
  onCreateProvider: () => void;
  onSelectProvider: (providerName: string) => void;
}) {
  return (
    <aside className="entity-list">
      <div className="entity-list-header">
        <div>
          <h2>Rule Providers</h2>
          <span>{providers.length} files</span>
        </div>
        <button className="icon-button" type="button" aria-label="create provider" onClick={onCreateProvider}>
          <Plus size={16} />
        </button>
      </div>
      <div className="entity-items">
        {providers.map((provider) => (
          <button
            className={`entity-row ${provider.name === selectedProviderName ? "active" : ""}`}
            key={provider.name}
            type="button"
            onClick={() => onSelectProvider(provider.name)}
          >
            <strong>{provider.name}</strong>
            <span>{provider.output} / {provider.sources.length} sources</span>
          </button>
        ))}
        {providers.length === 0 ? <div className="empty-state">暂无 rule provider</div> : null}
      </div>
    </aside>
  );
}
```

- [x] **步骤 2：实现 `RuleProviderEditor.tsx`**

创建 `apps/web/src/components/RuleProviderEditor.tsx`：

```tsx
import type { RuleProviderConfig, RuleProviderSource } from "@clash-route-kit/core";

const sourceTypes: RuleProviderSource["type"][] = ["clash-list", "clash-provider", "domain-list-community"];

function listText(values: string[] | undefined): string {
  return (values ?? []).join("\n");
}

function parseListText(value: string): string[] {
  return value.split("\n");
}

function createSource(type: RuleProviderSource["type"]): RuleProviderSource {
  if (type === "domain-list-community") return { name: "Source", type, entry: "" };
  return { name: "Source", type, path: type === "clash-list" ? "config/rules/Source.list" : "" };
}

function updateSource(source: RuleProviderSource, patch: Partial<RuleProviderSource>): RuleProviderSource {
  return { ...source, ...patch } as RuleProviderSource;
}

export function RuleProviderEditor({
  provider,
  onDeleteProvider,
  onSetProviderListField,
  onSetProviderSources,
  onUpdateProvider,
}: {
  provider: RuleProviderConfig | undefined;
  onDeleteProvider: (providerName: string) => void;
  onSetProviderListField: (providerName: string, field: "exclude" | "remove", values: string[]) => void;
  onSetProviderSources: (providerName: string, sources: RuleProviderSource[]) => void;
  onUpdateProvider: (providerName: string, patch: Partial<RuleProviderConfig>) => void;
}) {
  if (!provider) {
    return <section className="panel editor-panel"><div className="empty-state">暂无 rule provider</div></section>;
  }

  return (
    <section className="panel editor-panel">
      <div className="panel-heading">
        <div>
          <h2>编辑 Rule Provider</h2>
          <span>{provider.output}</span>
        </div>
      </div>
      <div className="form-grid">
        <label>
          <span>名称</span>
          <input value={provider.name} onChange={(event) => onUpdateProvider(provider.name, { name: event.target.value })} />
        </label>
        <label>
          <span>输出文件</span>
          <input value={provider.output} onChange={(event) => onUpdateProvider(provider.name, { output: event.target.value })} />
        </label>
        <label className="wide-field">
          <span>Exclude</span>
          <textarea value={listText(provider.exclude)} onChange={(event) => onSetProviderListField(provider.name, "exclude", parseListText(event.target.value))} />
        </label>
        <label className="wide-field">
          <span>Remove</span>
          <textarea value={listText(provider.remove)} onChange={(event) => onSetProviderListField(provider.name, "remove", parseListText(event.target.value))} />
        </label>
      </div>
      <div className="source-list">
        <div className="entity-list-header">
          <h3>Sources</h3>
          <button className="command-button" type="button" onClick={() => onSetProviderSources(provider.name, [...provider.sources, createSource("clash-list")])}>
            添加 source
          </button>
        </div>
        {provider.sources.map((source, index) => (
          <div className="source-row" key={`${source.name}-${index}`}>
            <select
              value={source.type}
              onChange={(event) => onSetProviderSources(provider.name, provider.sources.map((item, itemIndex) => itemIndex === index ? createSource(event.target.value as RuleProviderSource["type"]) : item))}
            >
              {sourceTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <input
              value={source.name}
              onChange={(event) => onSetProviderSources(provider.name, provider.sources.map((item, itemIndex) => itemIndex === index ? updateSource(item, { name: event.target.value }) : item))}
            />
            {"path" in source ? (
              <input
                value={source.path}
                onChange={(event) => onSetProviderSources(provider.name, provider.sources.map((item, itemIndex) => itemIndex === index ? updateSource(item, { path: event.target.value }) : item))}
              />
            ) : (
              <input
                value={source.entry}
                onChange={(event) => onSetProviderSources(provider.name, provider.sources.map((item, itemIndex) => itemIndex === index ? updateSource(item, { entry: event.target.value }) : item))}
              />
            )}
            <button className="icon-button" type="button" aria-label="remove source" onClick={() => onSetProviderSources(provider.name, provider.sources.filter((_, itemIndex) => itemIndex !== index))}>
              ×
            </button>
          </div>
        ))}
      </div>
      <button className="danger-button" type="button" onClick={() => {
        if (window.confirm(`删除 rule provider ${provider.name}？`)) onDeleteProvider(provider.name);
      }}>
        删除 Rule Provider
      </button>
    </section>
  );
}
```

- [x] **步骤 3：改造 `ProviderWorkspace.tsx`**

将 `apps/web/src/components/ProviderWorkspace.tsx` 替换为：

```tsx
import type { RouteKitProjectConfig, RuleProviderConfig, RuleProviderSource } from "@clash-route-kit/core";
import { RuleProviderEditor } from "./RuleProviderEditor.js";
import { RuleProviderList } from "./RuleProviderList.js";

export function ProviderWorkspace({
  config,
  onCreateProvider,
  onDeleteProvider,
  onSelectProvider,
  onSetProviderListField,
  onSetProviderSources,
  onUpdateProvider,
  selectedProvider,
}: {
  config: RouteKitProjectConfig;
  onCreateProvider: () => void;
  onDeleteProvider: (providerName: string) => void;
  onSelectProvider: (providerName: string) => void;
  onSetProviderListField: (providerName: string, field: "exclude" | "remove", values: string[]) => void;
  onSetProviderSources: (providerName: string, sources: RuleProviderSource[]) => void;
  onUpdateProvider: (providerName: string, patch: Partial<RuleProviderConfig>) => void;
  selectedProvider: RuleProviderConfig | undefined;
}) {
  const providers = config.ruleProviders ?? [];

  return (
    <div className="entity-workspace">
      <RuleProviderList
        providers={providers}
        selectedProviderName={selectedProvider?.name ?? ""}
        onCreateProvider={onCreateProvider}
        onSelectProvider={onSelectProvider}
      />
      <RuleProviderEditor
        provider={selectedProvider}
        onDeleteProvider={onDeleteProvider}
        onSetProviderListField={onSetProviderListField}
        onSetProviderSources={onSetProviderSources}
        onUpdateProvider={onUpdateProvider}
      />
    </div>
  );
}
```

- [x] **步骤 4：添加 source row 样式**

在 `apps/web/src/styles.css` 追加：

```css
.source-list {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

.source-row {
  display: grid;
  grid-template-columns: minmax(130px, 0.8fr) minmax(120px, 0.8fr) minmax(180px, 1.4fr) 36px;
  gap: 8px;
  min-width: 0;
}

.source-row input,
.source-row select {
  min-width: 0;
}

@media (max-width: 700px) {
  .source-row {
    grid-template-columns: 1fr;
  }
}
```

- [x] **步骤 5：验证类型检查和构建**

运行：

```powershell
pnpm typecheck
pnpm build
```

预期：类型检查和构建通过。

## 任务 7：构建规则文件编辑器

**文件：**
- 创建：`apps/web/src/components/RuleFileWorkspace.tsx`
- 修改：`apps/web/src/components/AppShell.tsx`
- 修改：`apps/web/src/projectController.ts`
- 修改：`apps/web/src/App.tsx`
- 修改：`apps/web/src/components/WorkspaceRouter.tsx`
- 修改：`apps/web/src/styles.css`

- [x] **步骤 1：扩展视图类型和导航**

修改 `apps/web/src/projectController.ts`：

```ts
export type ProjectView = "project" | "modules" | "policies" | "providers" | "rules" | "preview" | "publish";
```

在 `apps/web/src/components/AppShell.tsx` 的导航数组中，在 Providers 后添加：

```tsx
{ view: "rules", label: "Rules", description: "规则文件", icon: <FileText size={17} /> },
```

同时从 `lucide-react` 导入 `FileText`。

- [x] **步骤 2：实现 `RuleFileWorkspace.tsx`**

创建 `apps/web/src/components/RuleFileWorkspace.tsx`：

```tsx
export interface RuleFileState {
  files: string[];
  selectedFile: string;
  text: string;
  status: "idle" | "loading" | "saving" | "error";
  message: string;
}

export function RuleFileWorkspace({
  ruleFileState,
  onLoadFile,
  onRefreshFiles,
  onSaveFile,
  onTextChange,
}: {
  ruleFileState: RuleFileState;
  onLoadFile: (file: string) => void;
  onRefreshFiles: () => void;
  onSaveFile: () => void;
  onTextChange: (text: string) => void;
}) {
  return (
    <div className="entity-workspace">
      <aside className="entity-list">
        <div className="entity-list-header">
          <div>
            <h2>规则文件</h2>
            <span>{ruleFileState.files.length} files</span>
          </div>
          <button className="icon-button" type="button" aria-label="refresh rule files" onClick={onRefreshFiles}>
            ↻
          </button>
        </div>
        <div className="entity-items">
          {ruleFileState.files.map((file) => (
            <button
              className={`entity-row ${file === ruleFileState.selectedFile ? "active" : ""}`}
              key={file}
              type="button"
              onClick={() => onLoadFile(file)}
            >
              <strong>{file}</strong>
              <span>config/rules/{file}</span>
            </button>
          ))}
          {ruleFileState.files.length === 0 ? <div className="empty-state">暂无 .list 文件</div> : null}
        </div>
      </aside>
      <section className="panel editor-panel">
        <div className="panel-heading">
          <div>
            <h2>编辑规则文件</h2>
            <span>{ruleFileState.selectedFile || "未选择"}</span>
          </div>
          <button className="command-button primary" disabled={!ruleFileState.selectedFile || ruleFileState.status === "saving"} type="button" onClick={onSaveFile}>
            保存规则文件
          </button>
        </div>
        <p className={`project-message ${ruleFileState.status}`}>{ruleFileState.message}</p>
        <textarea
          className="rule-file-editor"
          disabled={!ruleFileState.selectedFile}
          spellCheck={false}
          value={ruleFileState.text}
          onChange={(event) => onTextChange(event.target.value)}
        />
      </section>
    </div>
  );
}
```

- [x] **步骤 3：在 App 中接入规则文件状态**

在 `apps/web/src/App.tsx` 导入：

```ts
import { listRuleFiles, loadRuleFile, saveRuleFile } from "./ruleFiles.js";
import type { RuleFileState } from "./components/RuleFileWorkspace.js";
```

添加 state：

```ts
const [ruleFileState, setRuleFileState] = useState<RuleFileState>({
  files: [],
  selectedFile: "",
  text: "",
  status: "idle",
  message: "尚未读取规则文件",
});
```

添加函数：

```ts
async function refreshRuleFiles() {
  setRuleFileState((current) => ({ ...current, status: "loading", message: "正在读取 config/rules" }));
  try {
    const files = await listRuleFiles();
    setRuleFileState((current) => ({
      ...current,
      files,
      selectedFile: current.selectedFile && files.includes(current.selectedFile) ? current.selectedFile : files[0] ?? "",
      status: "idle",
      message: files.length > 0 ? "已读取规则文件列表" : "config/rules 下暂无 .list 文件",
    }));
  } catch (error: unknown) {
    setRuleFileState((current) => ({
      ...current,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function loadSelectedRuleFile(file: string) {
  setRuleFileState((current) => ({ ...current, selectedFile: file, status: "loading", message: `正在读取 ${file}` }));
  try {
    const result = await loadRuleFile(file);
    setRuleFileState((current) => ({
      ...current,
      selectedFile: result.file,
      text: result.text,
      status: "idle",
      message: `已读取 config/rules/${result.file}`,
    }));
  } catch (error: unknown) {
    setRuleFileState((current) => ({
      ...current,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function saveSelectedRuleFile() {
  if (!ruleFileState.selectedFile) return;
  setRuleFileState((current) => ({ ...current, status: "saving", message: `正在保存 ${current.selectedFile}` }));
  try {
    const result = await saveRuleFile(ruleFileState.selectedFile, ruleFileState.text);
    setRuleFileState((current) => ({
      ...current,
      text: result.text,
      status: "idle",
      message: `已保存 config/rules/${result.file}`,
    }));
  } catch (error: unknown) {
    setRuleFileState((current) => ({
      ...current,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    }));
  }
}
```

在启动 effect 之后添加：

```ts
useEffect(() => {
  void refreshRuleFiles();
}, []);
```

传给 `WorkspaceRouter`：

```tsx
ruleFileState={ruleFileState}
onLoadRuleFile={loadSelectedRuleFile}
onRefreshRuleFiles={refreshRuleFiles}
onSaveRuleFile={saveSelectedRuleFile}
onRuleFileTextChange={(text) => setRuleFileState((current) => ({ ...current, text }))}
```

- [x] **步骤 4：在 WorkspaceRouter 中渲染 Rules 视图**

在 `apps/web/src/components/WorkspaceRouter.tsx` 导入：

```ts
import { RuleFileWorkspace, type RuleFileState } from "./RuleFileWorkspace.js";
```

扩展 props：

```ts
ruleFileState: RuleFileState;
onLoadRuleFile: (file: string) => void;
onRefreshRuleFiles: () => void;
onSaveRuleFile: () => void;
onRuleFileTextChange: (text: string) => void;
```

添加分支：

```tsx
if (project.selectedView === "rules") {
  return (
    <RuleFileWorkspace
      ruleFileState={ruleFileState}
      onLoadFile={onLoadRuleFile}
      onRefreshFiles={onRefreshRuleFiles}
      onSaveFile={onSaveRuleFile}
      onTextChange={onRuleFileTextChange}
    />
  );
}
```

- [x] **步骤 5：添加规则文件编辑器样式**

在 `apps/web/src/styles.css` 追加：

```css
.rule-file-editor {
  background: #0f172a;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: #e5e7eb;
  font-family: "Cascadia Code", Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  min-height: 520px;
  resize: vertical;
  width: 100%;
}
```

- [x] **步骤 6：验证类型检查和构建**

运行：

```powershell
pnpm typecheck
pnpm build
```

预期：类型检查和构建通过。

## 任务 8：文档清理和最终验证

**文件：**
- 修改：`README.md`
- 修改：`docs/superpowers/plans/2026-06-06-web-editor-usability.md`

- [x] **步骤 1：将 README Local-first usage 改成中文**

将 `README.md` 的 `## Local-first usage` 章节替换为：

```md
## 本地优先使用方式

ClashRouteKit 适合作为自己的 GitHub 仓库模板使用。

1. Fork 本仓库，或从模板创建自己的仓库。
2. 将自己的仓库 clone 到本地。
3. 运行 `pnpm install` 安装依赖。
4. 运行 `pnpm dev` 启动本地 Web 编辑器。
5. 在 Web UI 中编辑模块、策略组、rule provider 和规则文件。
6. 点击 `保存配置`，再依次运行 `运行检查`、`生成输出`、`Git 状态`、`提交配置` 和 `推送发布`。
7. 等待 GitHub Actions 发布 `publish` 分支。

发布后的文件地址：

```text
https://raw.githubusercontent.com/<owner>/<repo>/publish/templates/Custom_Clash.ini
https://raw.githubusercontent.com/<owner>/<repo>/publish/rules/<Provider_File>.yaml
```

Web UI 不需要 GitHub OAuth，也不会在浏览器保存 GitHub token。它通过本地 dev server 写入当前 checkout 中的固定文件，并依赖本机 Git 凭据执行 `git push`。

默认使用方式不需要 Docker。Docker 或 devcontainer 只适合作为可选开发环境，不是本项目的发布路径。
```

- [x] **步骤 2：更新上一阶段计划的非目标描述**

在 `docs/superpowers/plans/2026-06-06-web-editor-usability.md` 的“本阶段非目标”下保留 Docker 项，并补充：

```md
说明：Docker 仍不是默认路径。下一阶段继续强化 local-first 编辑能力，而不是引入容器部署。
```

- [x] **步骤 3：运行完整验证**

运行：

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm check
pnpm generate
```

预期：

- Vitest 全部通过。
- TypeScript workspace typecheck 通过。
- core、CLI、Web 构建通过。
- `pnpm check` 无诊断。
- `pnpm generate` 写入 `output/templates`、`output/rules` 和 `output/reports`。

- [x] **步骤 4：浏览器 QA**

运行：

```powershell
pnpm dev
```

打开本地 Vite URL，验证：

- Policies 视图能新增、编辑、重命名和删除未引用策略组。
- 重命名策略组后，模块策略引用和 FINAL 策略引用同步更新。
- Providers 视图能新增、编辑 source、保存草稿并在 Preview 中体现 provider 引用。
- Rules 视图只列出 `config/rules/*.list`，能读取和保存一个 `.list` 文件。
- 编辑草稿后 dirty 状态出现，YAML diff 更新。
- 保存前草稿校验能阻止断策略引用和断 provider 输出引用。
- Publish 面板仍能运行 check、generate 和 Git status。
- 不点击 `git-commit` 或 `git-push`，除非用户明确要求提交或推送。

## 自检

- 范围覆盖：本计划覆盖策略组编辑、rule provider 编辑、规则文件编辑、草稿校验、Docker 非默认决策和文档清理。
- 安全边界：本地 API 只新增 `config/rules/*.list` 读写，不接受任意路径或任意命令。
- 类型一致性：使用现有 `ProxyGroup`、`RuleProviderConfig`、`RuleProviderSource`、`RouteKitProjectConfig` 类型，所有新增回调都以现有 draft mutation 模式接入。
- 验证路径：每个行为变更都有聚焦 Vitest 命令，最后有完整测试、类型检查、构建、check、generate 和浏览器 QA。

## 本次样式回归修复

完整配置编辑器阶段完成后，在浏览器 QA 中发现新增表单字段使用 `.form-grid`，但样式表缺少对应定义，导致 Policies 和 Providers 编辑器出现原生控件样式、字段间距丢失和标签挤压。Provider source 行还使用了固定最小列宽，在 1280px 窄桌面布局下会撑出第二列编辑面板。

已修复内容：

- 补齐 `.form-grid`、表单 label、input、select、textarea 的主题样式。
- 修正 `.entity-list`、`.entity-row` 中未定义的主题变量引用。
- 将 `.source-row` 的固定最小列宽改为可收缩网格，并保留移动端单列布局。
- 浏览器复测覆盖 1280x864 和 390x844，未发现横向溢出。

下一阶段计划见 `docs/superpowers/plans/2026-06-06-web-editor-hardening.md`，重点把这类 UI 回归纳入自动化和固定 QA 清单。

## 后续模型大改

用户确认最终应直接编辑 SubConverter 的 `ruleset` 和 `custom_proxy_group`。下一阶段不再强化 `modules/proxyGroups` 心智模型，而是直接替换为 `ruleSets/customProxyGroups` schema 与 UI。

新的执行计划见 `docs/superpowers/plans/2026-06-07-routes-first-editor.md`。旧的 Web hardening 计划中的样式回归、规则文件 dirty 状态和发布门禁仍然有效，但应在模型大改之后按新命名补齐。
