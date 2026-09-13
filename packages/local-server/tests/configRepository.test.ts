import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { readAuthorProject, readProjectConfigFile, writeProjectConfigFile } from "../src/index.js";

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
