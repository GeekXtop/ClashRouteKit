import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSubconverterUrl,
  checkConfig,
  generateOutputs,
  previewRules,
  readConfig,
  resolveProjectRoot,
  syncVendor,
} from "../src/program.js";

const sampleConfig = `
publishBaseUrl: https://example.com/publish
template:
  output: Custom_Clash.ini
customProxyGroups:
  - name: 🚀 手动选择
    type: select
    options:
      - 🎯 全球直连
  - name: 💻 Tech
    type: select
    options:
      - 🚀 手动选择
  - name: 🎯 全球直连
    type: select
    options:
      - DIRECT
ruleSets:
  - id: tech-geosite-github
    policy: 💻 Tech
    source:
      type: geosite
      value: github
  - id: tech-provider-external-developer-domain
    policy: 💻 Tech
    source:
      type: rule-provider
      behavior: domain
      file: External_Developer_Domain.yaml
  - id: china-geosite-cn
    policy: 🎯 全球直连
    source:
      type: geosite
      value: cn
  - id: china-geoip-cn
    policy: 🎯 全球直连
    source:
      type: geoip
      value: cn
      noResolve: true
  - id: final
    policy: 🚀 手动选择
    source:
      type: final
ruleProviders:
  - name: External_Developer
    output: External_Developer_Domain.yaml
    behavior: domain
    sources:
      - name: LocalDeveloper
        type: clash-list
        path: config/rules/Developer.list
`;

function configWithVendorRepos(entries: string): string {
  return `${sampleConfig}\nvendorRepos:\n${entries.trimEnd()}\n`;
}

describe("CLI program", () => {
  it("generates INI and provider outputs from routes config", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(path.join(root, "routes.yaml"), sampleConfig, "utf8");
    await mkdir(path.join(root, "config/rules"), { recursive: true });
    await writeFile(path.join(root, "config/rules/Developer.list"), "DOMAIN-SUFFIX,debian.org\n", "utf8");

    const result = await generateOutputs({ root, configFile: "routes.yaml" });

    expect(result.templatePath).toBe(path.join(root, "output/templates/Custom_Clash.ini"));
    expect(await readFile(result.templatePath, "utf8")).toContain("ruleset=💻 Tech,[]GEOSITE,github");
    expect(await readFile(path.join(root, "output/rules/External_Developer_Domain.yaml"), "utf8")).toContain(
      "'+.debian.org'",
    );
  });

  it("overrides publishBaseUrl from the environment for publish builds", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(path.join(root, "routes.yaml"), sampleConfig, "utf8");
    await mkdir(path.join(root, "config/rules"), { recursive: true });
    await writeFile(path.join(root, "config/rules/Developer.list"), "DOMAIN-SUFFIX,debian.org\n", "utf8");

    const previous = process.env.CLASH_ROUTE_KIT_PUBLISH_BASE_URL;
    process.env.CLASH_ROUTE_KIT_PUBLISH_BASE_URL = "https://raw.githubusercontent.com/owner/repo/publish";
    try {
      const result = await generateOutputs({ root, configFile: "routes.yaml" });

      expect(await readFile(result.templatePath, "utf8")).toContain(
        "clash-domain:https://raw.githubusercontent.com/owner/repo/publish/rules/External_Developer_Domain.yaml",
      );
    } finally {
      if (previous === undefined) {
        delete process.env.CLASH_ROUTE_KIT_PUBLISH_BASE_URL;
      } else {
        process.env.CLASH_ROUTE_KIT_PUBLISH_BASE_URL = previous;
      }
    }
  });

  it("generates provider outputs from local domain-list-community entries", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    const dlcRoot = path.join(root, "vendor/domain-list-community/data");
    await mkdir(dlcRoot, { recursive: true });
    await writeFile(path.join(dlcRoot, "github"), "include:npmjs\ngithub.com\nfull:api.github.com\n", "utf8");
    await writeFile(path.join(dlcRoot, "npmjs"), "npmjs.com\n", "utf8");
    await writeFile(
      path.join(root, "routes.yaml"),
      `
publishBaseUrl: http://127.0.0.1:8787
template:
  output: Custom_Clash.ini
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
ruleProviders:
  - name: Developer
    output: Developer_Domain.yaml
    behavior: domain
    sources:
      - name: github
        type: domain-list-community
        entry: github
        basePath: vendor/domain-list-community/data
`,
      "utf8",
    );

    await generateOutputs({ root, configFile: "routes.yaml" });

    const output = await readFile(path.join(root, "output/rules/Developer_Domain.yaml"), "utf8");
    expect(output).toContain("'api.github.com'");
    expect(output).toContain("'+.github.com'");
    expect(output).toContain("'+.npmjs.com'");
  });

  it("generates provider outputs from Clash provider YAML payloads", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await mkdir(path.join(root, "vendor/rules"), { recursive: true });
    await writeFile(
      path.join(root, "vendor/rules/AI.yaml"),
      `
payload:
  - DOMAIN-SUFFIX,openai.com
  - DOMAIN,chat.openai.com
  - IP-CIDR,192.0.2.0/24,no-resolve
`,
      "utf8",
    );
    await writeFile(
      path.join(root, "routes.yaml"),
      `
publishBaseUrl: http://127.0.0.1:8787
template:
  output: Custom_Clash.ini
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
ruleProviders:
  - name: AI
    output: AI_Domain.yaml
    behavior: domain
    sources:
      - name: AI Suite
        type: clash-provider
        path: vendor/rules/AI.yaml
`,
      "utf8",
    );

    await generateOutputs({ root, configFile: "routes.yaml" });

    const output = await readFile(path.join(root, "output/rules/AI_Domain.yaml"), "utf8");
    expect(output).toContain("'chat.openai.com'");
    expect(output).toContain("'+.openai.com'");
    expect(output).not.toContain("192.0.2.0/24");
  });

  it("excludes configured rules from generated provider outputs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await mkdir(path.join(root, "config/rules"), { recursive: true });
    await writeFile(
      path.join(root, "config/rules/Developer.list"),
      [
        "DOMAIN-SUFFIX,debian.org",
        "DOMAIN-SUFFIX,tracker.example",
        "DOMAIN,api.example",
        "DOMAIN,legacy.example",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(root, "routes.yaml"),
      `
publishBaseUrl: http://127.0.0.1:8787
template:
  output: Custom_Clash.ini
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
ruleProviders:
  - name: Developer
    output: Developer_Domain.yaml
    behavior: domain
    exclude:
      - tracker.example
    remove:
      - DOMAIN,api.example
    sources:
      - name: DeveloperList
        type: clash-list
        path: config/rules/Developer.list
`,
      "utf8",
    );

    const result = await generateOutputs({ root, configFile: "routes.yaml" });

    const output = await readFile(path.join(root, "output/rules/Developer_Domain.yaml"), "utf8");
    expect(output).toContain("'+.debian.org'");
    expect(output).toContain("'legacy.example'");
    expect(output).not.toContain("tracker.example");
    expect(output).not.toContain("api.example");
    expect(result.providers).toEqual([
      {
        name: "Developer",
        output: "Developer_Domain.yaml",
        path: path.join(root, "output/rules/Developer_Domain.yaml"),
        inputRules: 4,
        excludedRules: 2,
        outputRules: 2,
        sources: [
          {
            name: "DeveloperList",
            type: "clash-list",
            inputRules: 4,
            outputRules: 4,
          },
        ],
      },
    ]);
  });

  it("generates classical and ipcidr outputs while skipping disabled providers", async () => {
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
        "  - name: DisabledPlaceholder",
        "    output: Placeholder_Classical.yaml",
        "    behavior: classical",
        "    enabled: false",
        "    sources: []",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await generateOutputs({ root, configFile: "routes.yaml" });

    const classical = await readFile(path.join(root, "output/rules/Mixed_Classical.yaml"), "utf8");
    const ipcidr = await readFile(path.join(root, "output/rules/Mixed_IP.yaml"), "utf8");
    expect(classical).toContain("'DOMAIN-SUFFIX,example.com'");
    expect(classical).toContain("'PROCESS-NAME,Telegram.exe'");
    expect(ipcidr).toContain("'192.0.2.0/24'");
    expect(ipcidr).not.toContain("example.com");
    await expect(access(path.join(root, "output/rules/Placeholder_Classical.yaml"))).rejects.toThrow();
    expect(result.providers.some((provider) => provider.name === "DisabledPlaceholder")).toBe(false);
    expect(result.providers.find((provider) => provider.name === "MixedIP")?.outputRules).toBe(1);
  });

  it("reports duplicate rules within providers and overlaps across provider outputs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await mkdir(path.join(root, "config/rules"), { recursive: true });
    await writeFile(
      path.join(root, "config/rules/AI_A.list"),
      "DOMAIN-SUFFIX,shared.example\nDOMAIN-SUFFIX,dup.example\n",
      "utf8",
    );
    await writeFile(
      path.join(root, "config/rules/AI_B.list"),
      "DOMAIN-SUFFIX,dup.example\nDOMAIN,exact.example\n",
      "utf8",
    );
    await writeFile(
      path.join(root, "config/rules/Developer.list"),
      "DOMAIN-SUFFIX,shared.example\nDOMAIN-SUFFIX,developer.example\n",
      "utf8",
    );
    await writeFile(
      path.join(root, "routes.yaml"),
      `
publishBaseUrl: http://127.0.0.1:8787
template:
  output: Custom_Clash.ini
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
ruleProviders:
  - name: AI
    output: AI_Domain.yaml
    behavior: domain
    sources:
      - name: AI_A
        type: clash-list
        path: config/rules/AI_A.list
      - name: AI_B
        type: clash-list
        path: config/rules/AI_B.list
  - name: Developer
    output: Developer_Domain.yaml
    behavior: domain
    sources:
      - name: DeveloperList
        type: clash-list
        path: config/rules/Developer.list
`,
      "utf8",
    );

    const result = await generateOutputs({ root, configFile: "routes.yaml" });

    expect(result.duplicates).toEqual([
      {
        provider: "AI",
        rules: [
          {
            rule: "DOMAIN-SUFFIX,dup.example",
            sources: ["AI_A", "AI_B"],
          },
        ],
      },
    ]);
    expect(result.overlaps).toEqual([
      {
        rule: "DOMAIN-SUFFIX,shared.example",
        providers: ["AI", "Developer"],
      },
    ]);
    expect(result.reportPath).toBe(path.join(root, "output/reports/rule-report.json"));
    expect(JSON.parse(await readFile(result.reportPath, "utf8"))).toMatchObject({
      duplicates: result.duplicates,
      overlaps: result.overlaps,
    });
  });

  it("resolves provider source files from project vendor paths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await mkdir(path.join(root, "vendor/rules"), { recursive: true });
    await writeFile(path.join(root, "vendor/rules/Developer.list"), "DOMAIN-SUFFIX,local-dev.example\n", "utf8");
    await writeFile(
      path.join(root, "routes.yaml"),
      `
publishBaseUrl: http://127.0.0.1:8787
template:
  output: Custom_Clash.ini
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
ruleProviders:
  - name: Developer
    output: Developer_Domain.yaml
    behavior: domain
    sources:
      - name: DeveloperList
        type: clash-list
        basePath: vendor/rules
        path: Developer.list
`,
      "utf8",
    );

    await generateOutputs({ root, configFile: "routes.yaml" });

    const output = await readFile(path.join(root, "output/rules/Developer_Domain.yaml"), "utf8");
    expect(output).toContain("'+.local-dev.example'");
  });

  it("clones missing vendor repositories and pulls existing ones", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(
      path.join(root, "routes.yaml"),
      configWithVendorRepos(`  - name: custom-rules
    url: https://example.com/custom-rules.git
    path: vendor/custom-rules
  - name: existing-rules
    url: https://example.com/existing-rules.git
    path: vendor/existing-rules`),
      "utf8",
    );
    await mkdir(path.join(root, "vendor/existing-rules/.git"), { recursive: true });
    const calls: Array<{ args: string[]; cwd: string }> = [];

    const result = await syncVendor({
      root,
      configFile: "routes.yaml",
      runGit: async (args, cwd) => {
        calls.push({ args, cwd });
      },
    });

    expect(result).toEqual([
      { name: "custom-rules", action: "clone", path: path.join(root, "vendor/custom-rules") },
      { name: "existing-rules", action: "pull", path: path.join(root, "vendor/existing-rules") },
    ]);
    expect(calls).toContainEqual({
      args: ["clone", "--depth", "1", "https://example.com/custom-rules.git", path.join(root, "vendor/custom-rules")],
      cwd: root,
    });
    expect(calls).toContainEqual({
      args: ["-C", path.join(root, "vendor/existing-rules"), "pull", "--ff-only"],
      cwd: root,
    });
  });

  it("fetches and checks out the configured branch for existing vendor repos", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(
      path.join(root, "routes.yaml"),
      configWithVendorRepos(`  - name: branched
    url: https://example.com/branched.git
    path: vendor/branched
    branch: main`),
      "utf8",
    );
    await mkdir(path.join(root, "vendor/branched/.git"), { recursive: true });
    const calls: string[] = [];
    await syncVendor({
      root,
      configFile: "routes.yaml",
      runGit: async (args) => {
        calls.push(args.join(" "));
      },
    });
    expect(calls.some((args) => args.endsWith("fetch --depth 1 origin main"))).toBe(true);
    expect(calls.some((args) => args.endsWith("checkout -B main FETCH_HEAD"))).toBe(true);
  });

  it("syncs only the named repo when 'only' is given", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(
      path.join(root, "routes.yaml"),
      configWithVendorRepos(`  - name: alpha
    url: https://example.com/alpha.git
    path: vendor/alpha
  - name: beta
    url: https://example.com/beta.git
    path: vendor/beta`),
      "utf8",
    );
    await mkdir(path.join(root, "vendor/alpha/.git"), { recursive: true });
    await mkdir(path.join(root, "vendor/beta/.git"), { recursive: true });

    const result = await syncVendor({
      root,
      configFile: "routes.yaml",
      only: "beta",
      runGit: async () => {},
    });

    expect(result).toEqual([{ name: "beta", action: "pull", path: path.join(root, "vendor/beta") }]);
  });

  it("keeps syncing the remaining repos when one repo fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(
      path.join(root, "routes.yaml"),
      configWithVendorRepos(`  - name: gone
    url: https://example.com/gone.git
    path: vendor/gone
  - name: beta
    url: https://example.com/beta.git
    path: vendor/beta`),
      "utf8",
    );
    await mkdir(path.join(root, "vendor/gone/.git"), { recursive: true });
    await mkdir(path.join(root, "vendor/beta/.git"), { recursive: true });

    const result = await syncVendor({
      root,
      configFile: "routes.yaml",
      runGit: async (args) => {
        if (args.join(" ").includes("gone")) throw new Error("Repository not found");
      },
    });

    expect(result.find((item) => item.name === "gone")?.action).toBe("error");
    expect(result.find((item) => item.name === "gone")?.error).toContain("Repository not found");
    expect(result.find((item) => item.name === "beta")?.action).toBe("pull");
  });

  it("treats an omitted vendor repository list as empty", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(path.join(root, "routes.yaml"), sampleConfig, "utf8");

    await expect(syncVendor({ root, configFile: "routes.yaml" })).resolves.toEqual([]);
  });

  it("uses the strict parser when reading project config", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(path.join(root, "routes.yaml"), `${sampleConfig}\nunknownField: true\n`, "utf8");

    await expect(readConfig({ root, configFile: "routes.yaml" })).rejects.toThrow(
      "config.unknownField: unknown field",
    );
  });

  it("previews rule order and checks missing policy groups", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(path.join(root, "routes.yaml"), sampleConfig, "utf8");
    await mkdir(path.join(root, "config/rules"), { recursive: true });
    await writeFile(path.join(root, "config/rules/Developer.list"), "DOMAIN-SUFFIX,example.com\n", "utf8");

    expect((await previewRules({ root, configFile: "routes.yaml" })).join("\n")).toContain(
      "GEOSITE github -> 💻 Tech",
    );
    expect((await previewRules({ root, configFile: "routes.yaml" })).join("\n")).toContain(
      "FINAL -> 🚀 手动选择",
    );
    await expect(checkConfig({ root, configFile: "routes.yaml" })).resolves.toEqual([]);
  });

  it("checks invalid project default values", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(
      path.join(root, "routes.yaml"),
      `
publishBaseUrl: http://127.0.0.1:8787
defaults:
  proxyGroups:
    healthCheck:
      timeout: 0
template:
  output: Custom_Clash.ini
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
`,
      "utf8",
    );

    await expect(checkConfig({ root, configFile: "routes.yaml" })).resolves.toContainEqual(
      expect.objectContaining({
        code: "defaults.health-check.timeout",
        severity: "error",
        path: "defaults.proxyGroups.healthCheck.timeout",
      }),
    );
  });

  it("returns warnings without failing check semantics", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(
      path.join(root, "routes.yaml"),
      sampleConfig.replace("value: github", "value: missing-catalog"),
      "utf8",
    );
    await mkdir(path.join(root, "vendor/domain-list-community/data"), { recursive: true });
    await mkdir(path.join(root, "config/rules"), { recursive: true });
    await writeFile(path.join(root, "config/rules/Developer.list"), "DOMAIN-SUFFIX,example.com\n", "utf8");

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
      sampleConfig.replace(
        "options:\n      - 🎯 全球直连",
        "options:\n      - 🎯 全球直连\n    nodeFilters:\n      - https://probe.example/204",
      ),
      "utf8",
    );

    await expect(generateOutputs({ root, configFile: "routes.yaml" })).rejects.toMatchObject({
      name: "ConfigDiagnosticError",
    });
    await expect(access(path.join(root, "output"))).rejects.toThrow();
  });

  it("stops generation before writing output when workspace validation has errors", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(path.join(root, "routes.yaml"), sampleConfig, "utf8");

    await expect(generateOutputs({ root, configFile: "routes.yaml" })).rejects.toMatchObject({
      name: "ConfigDiagnosticError",
      diagnostics: [
        expect.objectContaining({
          code: "workspace.provider-source.missing",
          severity: "error",
        }),
      ],
    });
    await expect(access(path.join(root, "output"))).rejects.toThrow();
  });

  it("checks geosite tags when local domain-list-community data is available", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await mkdir(path.join(root, "vendor/domain-list-community/data"), { recursive: true });
    await writeFile(path.join(root, "vendor/domain-list-community/data/github"), "github.com\n", "utf8");
    await writeFile(
      path.join(root, "routes.yaml"),
      `
publishBaseUrl: http://127.0.0.1:8787
template:
  output: Custom_Clash.ini
customProxyGroups:
  - name: Proxy
    type: select
    options:
      - DIRECT
ruleSets:
  - id: tech-geosite-github
    policy: Proxy
    source:
      type: geosite
      value: github
  - id: tech-geosite-missing-tag
    policy: Proxy
    source:
      type: geosite
      value: missing-tag
  - id: final
    policy: Proxy
    source:
      type: final
`,
      "utf8",
    );

    await expect(checkConfig({ root, configFile: "routes.yaml" })).resolves.toEqual([
      expect.objectContaining({
        code: "workspace.geosite.missing",
        severity: "warning",
        related: ["missing-tag"],
      }),
    ]);
  });

  it("skips geosite tag checks when local domain-list-community data is unavailable", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(
      path.join(root, "routes.yaml"),
      `
publishBaseUrl: http://127.0.0.1:8787
template:
  output: Custom_Clash.ini
customProxyGroups:
  - name: Proxy
    type: select
    options:
      - DIRECT
ruleSets:
  - id: tech-geosite-missing-tag
    policy: Proxy
    source:
      type: geosite
      value: missing-tag
  - id: final
    policy: Proxy
    source:
      type: final
`,
      "utf8",
    );

    await expect(checkConfig({ root, configFile: "routes.yaml" })).resolves.toEqual([]);
  });

  it("resolves the project root from a nested workspace package directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    const nested = path.join(root, "apps/cli");
    await mkdir(path.join(root, "config"), { recursive: true });
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(root, "config/routes.yaml"), sampleConfig, "utf8");

    expect(resolveProjectRoot(nested, "config/routes.yaml")).toBe(root);
  });

  it("builds a SubConverter URL from the subscription environment value and published template", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(path.join(root, "routes.yaml"), sampleConfig, "utf8");

    const subscriptionUrl = "https://subscribe.example/token?user=abc&name=main profile";
    const url = await buildSubconverterUrl({
      root,
      configFile: "routes.yaml",
      subscriptionUrl,
      subconverterBaseUrl: "http://127.0.0.1:25500/sub",
    });
    const parsed = new URL(url);

    expect(`${parsed.origin}${parsed.pathname}`).toBe("http://127.0.0.1:25500/sub");
    expect(parsed.searchParams.get("target")).toBe("clash");
    expect(parsed.searchParams.get("url")).toBe(subscriptionUrl);
    expect(parsed.searchParams.get("config")).toBe("https://example.com/publish/templates/Custom_Clash.ini");
  });

  it("accepts a host and port SubConverter endpoint", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(path.join(root, "routes.yaml"), sampleConfig, "utf8");

    const url = await buildSubconverterUrl({
      root,
      configFile: "routes.yaml",
      subscriptionUrl: "https://subscribe.example/token",
      subconverterBaseUrl: "10.0.0.3:25500",
    });
    const parsed = new URL(url);

    expect(`${parsed.origin}${parsed.pathname}`).toBe("http://10.0.0.3:25500/sub");
  });

  it("requires a subscription URL when building a SubConverter URL", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(path.join(root, "routes.yaml"), sampleConfig, "utf8");

    await expect(buildSubconverterUrl({ root, configFile: "routes.yaml" })).rejects.toThrow(
      "Set CLASH_ROUTE_KIT_SUBSCRIPTION_URL before running subconvert-url",
    );
  });

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
});
