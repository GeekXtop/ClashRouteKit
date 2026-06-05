import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSubconverterUrl,
  checkConfig,
  generateOutputs,
  previewRules,
  resolveProjectRoot,
  syncVendor,
} from "../src/program.js";

const sampleConfig = `
publishBaseUrl: https://example.com/publish
template:
  output: Custom_Clash.ini
proxyGroups:
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
modules:
  - id: tech
    policy: 💻 Tech
    geosite:
      - github
    providers:
      - behavior: domain
        file: External_Developer_Domain.yaml
  - id: china
    policy: 🎯 全球直连
    geosite:
      - cn
    geoip:
      - cn
final:
  policy: 🚀 手动选择
ruleProviders:
  - name: External_Developer
    output: External_Developer_Domain.yaml
    behavior: domain
    sources:
      - name: LocalDeveloper
        type: clash-list
        path: config/rules/Developer.list
`;

describe("CLI program", () => {
  it("generates INI and provider outputs from modules config", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(path.join(root, "modules.yaml"), sampleConfig, "utf8");
    await mkdir(path.join(root, "config/rules"), { recursive: true });
    await writeFile(path.join(root, "config/rules/Developer.list"), "DOMAIN-SUFFIX,debian.org\n", "utf8");

    const result = await generateOutputs({ root, configFile: "modules.yaml" });

    expect(result.templatePath).toBe(path.join(root, "output/templates/Custom_Clash.ini"));
    expect(await readFile(result.templatePath, "utf8")).toContain("ruleset=💻 Tech,[]GEOSITE,github");
    expect(await readFile(path.join(root, "output/rules/External_Developer_Domain.yaml"), "utf8")).toContain(
      "'+.debian.org'",
    );
  });

  it("overrides publishBaseUrl from the environment for publish builds", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(path.join(root, "modules.yaml"), sampleConfig, "utf8");
    await mkdir(path.join(root, "config/rules"), { recursive: true });
    await writeFile(path.join(root, "config/rules/Developer.list"), "DOMAIN-SUFFIX,debian.org\n", "utf8");

    const previous = process.env.CLASH_ROUTE_KIT_PUBLISH_BASE_URL;
    process.env.CLASH_ROUTE_KIT_PUBLISH_BASE_URL = "https://raw.githubusercontent.com/owner/repo/publish";
    try {
      const result = await generateOutputs({ root, configFile: "modules.yaml" });

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
      path.join(root, "modules.yaml"),
      `
publishBaseUrl: http://127.0.0.1:8787
template:
  output: Custom_Clash.ini
proxyGroups:
  - name: Proxy
    type: select
    options:
      - DIRECT
modules: []
final:
  policy: Proxy
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

    await generateOutputs({ root, configFile: "modules.yaml" });

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
      path.join(root, "modules.yaml"),
      `
publishBaseUrl: http://127.0.0.1:8787
template:
  output: Custom_Clash.ini
proxyGroups:
  - name: Proxy
    type: select
    options:
      - DIRECT
modules: []
final:
  policy: Proxy
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

    await generateOutputs({ root, configFile: "modules.yaml" });

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
      path.join(root, "modules.yaml"),
      `
publishBaseUrl: http://127.0.0.1:8787
template:
  output: Custom_Clash.ini
proxyGroups:
  - name: Proxy
    type: select
    options:
      - DIRECT
modules: []
final:
  policy: Proxy
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

    const result = await generateOutputs({ root, configFile: "modules.yaml" });

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
        domainRules: 4,
        excludedRules: 2,
        outputRules: 2,
        sources: [
          {
            name: "DeveloperList",
            type: "clash-list",
            inputRules: 4,
            domainRules: 4,
          },
        ],
      },
    ]);
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
      path.join(root, "modules.yaml"),
      `
publishBaseUrl: http://127.0.0.1:8787
template:
  output: Custom_Clash.ini
proxyGroups:
  - name: Proxy
    type: select
    options:
      - DIRECT
modules: []
final:
  policy: Proxy
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

    const result = await generateOutputs({ root, configFile: "modules.yaml" });

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
      path.join(root, "modules.yaml"),
      `
publishBaseUrl: http://127.0.0.1:8787
template:
  output: Custom_Clash.ini
proxyGroups:
  - name: Proxy
    type: select
    options:
      - DIRECT
modules: []
final:
  policy: Proxy
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

    await generateOutputs({ root, configFile: "modules.yaml" });

    const output = await readFile(path.join(root, "output/rules/Developer_Domain.yaml"), "utf8");
    expect(output).toContain("'+.local-dev.example'");
  });

  it("clones missing vendor repositories and pulls existing ones", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(
      path.join(root, "modules.yaml"),
      `
vendorRepos:
  - name: custom-rules
    url: https://example.com/custom-rules.git
    path: vendor/custom-rules
  - name: existing-rules
    url: https://example.com/existing-rules.git
    path: vendor/existing-rules
`,
      "utf8",
    );
    await mkdir(path.join(root, "vendor/existing-rules/.git"), { recursive: true });
    const calls: Array<{ args: string[]; cwd: string }> = [];

    const result = await syncVendor({
      root,
      configFile: "modules.yaml",
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

  it("requires vendor repositories to be declared in the project config", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(path.join(root, "modules.yaml"), sampleConfig, "utf8");

    await expect(syncVendor({ root, configFile: "modules.yaml" })).rejects.toThrow(
      "Missing vendorRepos in modules.yaml",
    );
  });

  it("previews rule order and checks missing policy groups", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(path.join(root, "modules.yaml"), sampleConfig, "utf8");

    expect((await previewRules({ root, configFile: "modules.yaml" })).join("\n")).toContain(
      "GEOSITE github -> 💻 Tech",
    );
    await expect(checkConfig({ root, configFile: "modules.yaml" })).resolves.toEqual([]);
  });

  it("checks geosite tags when local domain-list-community data is available", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await mkdir(path.join(root, "vendor/domain-list-community/data"), { recursive: true });
    await writeFile(path.join(root, "vendor/domain-list-community/data/github"), "github.com\n", "utf8");
    await writeFile(
      path.join(root, "modules.yaml"),
      `
publishBaseUrl: http://127.0.0.1:8787
template:
  output: Custom_Clash.ini
proxyGroups:
  - name: Proxy
    type: select
    options:
      - DIRECT
modules:
  - id: tech
    policy: Proxy
    geosite:
      - github
      - missing-tag
final:
  policy: Proxy
`,
      "utf8",
    );

    await expect(checkConfig({ root, configFile: "modules.yaml" })).resolves.toEqual([
      "Module tech references missing geosite tag: missing-tag",
    ]);
  });

  it("skips geosite tag checks when local domain-list-community data is unavailable", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(
      path.join(root, "modules.yaml"),
      `
publishBaseUrl: http://127.0.0.1:8787
template:
  output: Custom_Clash.ini
proxyGroups:
  - name: Proxy
    type: select
    options:
      - DIRECT
modules:
  - id: tech
    policy: Proxy
    geosite:
      - missing-tag
final:
  policy: Proxy
`,
      "utf8",
    );

    await expect(checkConfig({ root, configFile: "modules.yaml" })).resolves.toEqual([]);
  });

  it("resolves the project root from a nested workspace package directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    const nested = path.join(root, "apps/cli");
    await mkdir(path.join(root, "config"), { recursive: true });
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(root, "config/modules.yaml"), sampleConfig, "utf8");

    expect(resolveProjectRoot(nested, "config/modules.yaml")).toBe(root);
  });

  it("builds a SubConverter URL from the subscription environment value and published template", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(path.join(root, "modules.yaml"), sampleConfig, "utf8");

    const subscriptionUrl = "https://subscribe.example/token?user=abc&name=main profile";
    const url = await buildSubconverterUrl({
      root,
      configFile: "modules.yaml",
      subscriptionUrl,
      subconverterBaseUrl: "http://127.0.0.1:25500/sub",
    });
    const parsed = new URL(url);

    expect(`${parsed.origin}${parsed.pathname}`).toBe("http://127.0.0.1:25500/sub");
    expect(parsed.searchParams.get("target")).toBe("clash");
    expect(parsed.searchParams.get("url")).toBe(subscriptionUrl);
    expect(parsed.searchParams.get("config")).toBe("https://example.com/publish/templates/Custom_Clash.ini");
  });

  it("requires a subscription URL when building a SubConverter URL", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(path.join(root, "modules.yaml"), sampleConfig, "utf8");

    await expect(buildSubconverterUrl({ root, configFile: "modules.yaml" })).rejects.toThrow(
      "Set CLASH_ROUTE_KIT_SUBSCRIPTION_URL before running subconvert-url",
    );
  });
});
