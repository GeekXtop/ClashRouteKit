import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  readAuthorProjectFile,
  readAuthorProject,
  readProjectConfigFile,
  saveAuthorProject,
  writeProjectConfigFile,
} from "../src/index.js";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "local-server-config-"));
  tempRoots.push(dir);
  return dir;
}

afterAll(async () => {
  for (const dir of tempRoots) {
    await rm(dir, { recursive: true, force: true });
  }
});

const CONFIG_YAML = [
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
  "  - id: final",
  "    policy: Proxy",
  "    source:",
  "      type: final",
  "ruleProviders: []",
  "",
].join("\n");

function baseOptions(root: string) {
  return { root, configFile: "config/routes.yaml" };
}

const V2_YAML = [
  "schemaVersion: 2",
  "project:",
  "  template:",
  "    output: Custom_Clash.ini",
  "proxyGroups:",
  "  - id: proxy",
  "    name: Proxy",
  "    type: select",
  "    members:",
  "      - builtin: DIRECT",
  "routes:",
  "  - id: final",
  "    policy:",
  "      group: proxy",
  "    source:",
  "      type: final",
  "ruleProviders: []",
  "",
].join("\n");

describe("config repository", () => {
  it("reads, mutates, writes back atomically and reads the same config again", async () => {
    const root = await makeTempRoot();
    const configDir = path.join(root, "config");
    await mkdir(configDir);
    await writeFile(path.join(configDir, "routes.yaml"), CONFIG_YAML, "utf8");

    const initial = await readProjectConfigFile(baseOptions(root));
    expect(initial.config.customProxyGroups[0]?.name).toBe("Proxy");
    expect(typeof initial.mtime).toBe("number");

    const updated = {
      ...initial.config,
      template: { output: "My_Custom.ini" },
    };
    const written = await writeProjectConfigFile({ ...baseOptions(root), config: updated });

    expect(written.yaml).toContain("My_Custom.ini");
    const reread = await readProjectConfigFile(baseOptions(root));
    expect(reread.config).toEqual(updated);
    expect(reread.yaml).toBe(written.yaml);
    // 默认写入路径走原子替换：目录里不应残留临时文件
    expect(await readdir(configDir)).toEqual(["routes.yaml"]);
  });

  it("rejects broken YAML on read", async () => {
    const root = await makeTempRoot();
    const configDir = path.join(root, "config");
    await mkdir(configDir);
    await writeFile(path.join(configDir, "routes.yaml"), "customProxyGroups:\n  - [unclosed\n", "utf8");

    await expect(readProjectConfigFile(baseOptions(root))).rejects.toThrow();
  });

  it("rejects invalid configs with Core diagnostics before writing anything", async () => {
    const root = await makeTempRoot();
    const configDir = path.join(root, "config");
    await mkdir(configDir);
    await writeFile(path.join(configDir, "routes.yaml"), CONFIG_YAML, "utf8");

    const initial = await readProjectConfigFile(baseOptions(root));
    await expect(
      writeProjectConfigFile({
        ...baseOptions(root),
        config: {
          ...initial.config,
          ruleSets: [{ id: "bad", policy: "Missing", source: { type: "final" } }],
        },
      }),
    ).rejects.toMatchObject({ name: "ConfigDiagnosticError" });
    expect(await readdir(configDir)).toEqual(["routes.yaml"]);
  });

  it("readAuthorProject dispatches v1 and v2 documents by schemaVersion", async () => {
    const root = await makeTempRoot();
    const configDir = path.join(root, "config");
    await mkdir(configDir);
    const configPath = path.join(configDir, "routes.yaml");

    await writeFile(configPath, CONFIG_YAML, "utf8");
    const v1 = await readAuthorProject(baseOptions(root));
    expect(v1.schemaVersion).toBe(1);
    expect(v1.v1?.customProxyGroups[0]?.name).toBe("Proxy");
    expect(v1.v2).toBeUndefined();

    await writeFile(
      configPath,
      [
        "schemaVersion: 2",
        "project:",
        "  template:",
        "    output: Custom_Clash.ini",
        "proxyGroups:",
        "  - id: proxy",
        "    name: Proxy",
        "    type: select",
        "    members:",
        "      - builtin: DIRECT",
        "routes:",
        "  - id: final",
        "    policy:",
        "      group: proxy",
        "    source:",
        "      type: final",
        "ruleProviders: []",
        "",
      ].join("\n"),
      "utf8",
    );
    const v2 = await readAuthorProject(baseOptions(root));
    expect(v2.schemaVersion).toBe(2);
    expect(v2.v2?.proxyGroups[0]?.id).toBe("proxy");
    expect(v2.v1).toBeUndefined();
  });
});

describe("readAuthorProjectFile", () => {
  it("returns schemaVersion 1 with the original fields plus yaml for a v1 config", async () => {
    const root = await makeTempRoot();
    const configDir = path.join(root, "config");
    await mkdir(configDir);
    await writeFile(path.join(configDir, "routes.yaml"), CONFIG_YAML, "utf8");

    const result = await readAuthorProjectFile(baseOptions(root));
    expect(result.schemaVersion).toBe(1);
    if (result.schemaVersion !== 1) return;
    expect(result.config.customProxyGroups[0]?.name).toBe("Proxy");
    expect(result.yaml).toBe(CONFIG_YAML);
    expect(typeof result.mtime).toBe("number");
  });

  it("returns schemaVersion 2 with yaml and no v1 config fields for a v2 config", async () => {
    const root = await makeTempRoot();
    const configDir = path.join(root, "config");
    await mkdir(configDir);
    const configPath = path.join(configDir, "routes.yaml");
    await writeFile(configPath, V2_YAML, "utf8");

    const result = await readAuthorProjectFile(baseOptions(root));
    expect(result.schemaVersion).toBe(2);
    if (result.schemaVersion !== 2) return;
    expect(result.yaml).toBe(V2_YAML);
    expect(typeof result.mtime).toBe("number");
    expect("config" in result).toBe(false);
  });

  it("rejects broken YAML on read", async () => {
    const root = await makeTempRoot();
    const configDir = path.join(root, "config");
    await mkdir(configDir);
    await writeFile(path.join(configDir, "routes.yaml"), "customProxyGroups:\n  - [unclosed\n", "utf8");

    await expect(readAuthorProjectFile(baseOptions(root))).rejects.toThrow();
  });
});

describe("saveAuthorProject", () => {
  it("validates, writes v2 yaml with schemaVersion pinned at the top and reads back consistently", async () => {
    const root = await makeTempRoot();
    const configDir = path.join(root, "config");
    await mkdir(configDir);
    await writeFile(path.join(configDir, "routes.yaml"), CONFIG_YAML, "utf8");

    // 客户端 yaml 里 schemaVersion 不在首位，保存后应被固定置顶
    const reordered = V2_YAML.replace("schemaVersion: 2\n", "").replace(
      "proxyGroups:",
      "schemaVersion: 2\nproxyGroups:",
    );
    const result = await saveAuthorProject({ ...baseOptions(root), yaml: reordered });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schemaVersion).toBe(2);
    expect(result.yaml.startsWith("schemaVersion: 2\n")).toBe(true);
    expect(result.diagnostics.every((diagnostic) => diagnostic.severity !== "error")).toBe(true);
    expect(typeof result.mtime).toBe("number");

    const reread = await readAuthorProjectFile(baseOptions(root));
    expect(reread.schemaVersion).toBe(2);
    if (reread.schemaVersion !== 2) return;
    expect(reread.yaml).toBe(result.yaml);
    // 默认写入路径走原子替换：目录里不残留临时文件
    expect(await readdir(configDir)).toEqual(["routes.yaml"]);
  });

  it("rejects an invalid v2 config with error diagnostics and writes nothing", async () => {
    const root = await makeTempRoot();
    const configDir = path.join(root, "config");
    await mkdir(configDir);
    await writeFile(path.join(configDir, "routes.yaml"), CONFIG_YAML, "utf8");

    const invalidYaml = V2_YAML.replace("group: proxy", "group: ghost");
    const result = await saveAuthorProject({ ...baseOptions(root), yaml: invalidYaml });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.some((diagnostic) => diagnostic.severity === "error")).toBe(true);
    expect(await readdir(configDir)).toEqual(["routes.yaml"]);
  });

  it("throws ConfigDiagnosticError for broken or non-v2 yaml", async () => {
    const root = await makeTempRoot();
    const configDir = path.join(root, "config");
    await mkdir(configDir);
    await writeFile(path.join(configDir, "routes.yaml"), CONFIG_YAML, "utf8");

    await expect(
      saveAuthorProject({ ...baseOptions(root), yaml: "proxyGroups: [unclosed\n" }),
    ).rejects.toMatchObject({ name: "ConfigDiagnosticError" });
    // v1 文档送进 v2 保存同样拒绝
    await expect(
      saveAuthorProject({ ...baseOptions(root), yaml: CONFIG_YAML }),
    ).rejects.toMatchObject({ name: "ConfigDiagnosticError" });
    expect(await readdir(configDir)).toEqual(["routes.yaml"]);
  });
});
