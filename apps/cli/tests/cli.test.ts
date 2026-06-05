import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkConfig, generateOutputs, previewRules, resolveProjectRoot } from "../src/program.js";

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

  it("resolves provider source files from baseEnv before basePath", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    const localRulesRoot = path.join(root, "local-rules");
    await mkdir(localRulesRoot, { recursive: true });
    await writeFile(path.join(localRulesRoot, "Developer.list"), "DOMAIN-SUFFIX,local-dev.example\n", "utf8");
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
        baseEnv: CLASH_ROUTE_KIT_TEST_RULES_ROOT
        basePath: vendor/missing
        path: Developer.list
`,
      "utf8",
    );

    const previous = process.env.CLASH_ROUTE_KIT_TEST_RULES_ROOT;
    process.env.CLASH_ROUTE_KIT_TEST_RULES_ROOT = localRulesRoot;
    try {
      await generateOutputs({ root, configFile: "modules.yaml" });

      const output = await readFile(path.join(root, "output/rules/Developer_Domain.yaml"), "utf8");
      expect(output).toContain("'+.local-dev.example'");
    } finally {
      if (previous === undefined) {
        delete process.env.CLASH_ROUTE_KIT_TEST_RULES_ROOT;
      } else {
        process.env.CLASH_ROUTE_KIT_TEST_RULES_ROOT = previous;
      }
    }
  });

  it("previews rule order and checks missing policy groups", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(path.join(root, "modules.yaml"), sampleConfig, "utf8");

    expect((await previewRules({ root, configFile: "modules.yaml" })).join("\n")).toContain(
      "GEOSITE github -> 💻 Tech",
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
});
