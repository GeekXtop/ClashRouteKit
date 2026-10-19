import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { readAuthorProjectFile, saveAuthorProject } from "../src/index.js";

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

const V1_YAML = [
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

describe("readAuthorProjectFile", () => {
  it("returns schemaVersion 2 with yaml for a v2 config", async () => {
    const root = await makeTempRoot();
    const configDir = path.join(root, "config");
    await mkdir(configDir);
    await writeFile(path.join(configDir, "routes.yaml"), V2_YAML, "utf8");

    const result = await readAuthorProjectFile(baseOptions(root));
    expect(result.schemaVersion).toBe(2);
    if (result.schemaVersion !== 2) return;
    expect(result.v2.proxyGroups[0]?.id).toBe("proxy");
    expect(result.yaml).toBe(V2_YAML);
    expect(typeof result.mtime).toBe("number");
  });

  it("rejects broken YAML on read", async () => {
    const root = await makeTempRoot();
    const configDir = path.join(root, "config");
    await mkdir(configDir);
    await writeFile(path.join(configDir, "routes.yaml"), "proxyGroups:\n  - [unclosed\n", "utf8");

    await expect(readAuthorProjectFile(baseOptions(root))).rejects.toThrow();
  });

  it("rejects v1 documents with an explicit unsupported-format message", async () => {
    const root = await makeTempRoot();
    const configDir = path.join(root, "config");
    await mkdir(configDir);
    await writeFile(path.join(configDir, "routes.yaml"), V1_YAML, "utf8");

    await expect(readAuthorProjectFile(baseOptions(root))).rejects.toThrow(/不支持 v1/);
  });
});

describe("saveAuthorProject", () => {
  it("validates, writes v2 yaml with schemaVersion pinned at the top and reads back consistently", async () => {
    const root = await makeTempRoot();
    const configDir = path.join(root, "config");
    await mkdir(configDir);
    await writeFile(path.join(configDir, "routes.yaml"), V2_YAML, "utf8");

    // 客户端 yaml 里 schemaVersion 不在首位，保存后应被固定置顶
    const reordered = V2_YAML.replace("schemaVersion: 2\n", "").replace(
      "proxyGroups:",
      "schemaVersion: 2\nproxyGroups:",
    );
    const result = await saveAuthorProject({
      ...baseOptions(root),
      yaml: reordered,
      baseMtime: 1000,
      statMtime: async () => 1000,
    });
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
    await writeFile(path.join(configDir, "routes.yaml"), V2_YAML, "utf8");

    const invalidYaml = V2_YAML.replace("group: proxy", "group: ghost");
    const result = await saveAuthorProject({ ...baseOptions(root), yaml: invalidYaml, baseMtime: 0 });
    expect(result.ok).toBe(false);
    if (result.ok || "conflict" in result) return;
    expect(result.diagnostics.some((diagnostic) => diagnostic.severity === "error")).toBe(true);
    expect(await readdir(configDir)).toEqual(["routes.yaml"]);
  });

  it("throws ConfigDiagnosticError for broken or non-v2 yaml", async () => {
    const root = await makeTempRoot();
    const configDir = path.join(root, "config");
    await mkdir(configDir);
    await writeFile(path.join(configDir, "routes.yaml"), V2_YAML, "utf8");

    await expect(
      saveAuthorProject({ ...baseOptions(root), yaml: "proxyGroups: [unclosed\n", baseMtime: 0 }),
    ).rejects.toMatchObject({ name: "ConfigDiagnosticError" });
    // v1 文档送进 v2 保存同样拒绝
    await expect(
      saveAuthorProject({ ...baseOptions(root), yaml: V1_YAML, baseMtime: 0 }),
    ).rejects.toMatchObject({ name: "ConfigDiagnosticError" });
    expect(await readdir(configDir)).toEqual(["routes.yaml"]);
  });
});

describe("saveAuthorProject baseMtime 冲突检测", () => {
  it("baseMtime 与盘上 mtime 匹配时写入", async () => {
    const written: string[] = [];
    const result = await saveAuthorProject({
      ...baseOptions("unused-root"),
      yaml: V2_YAML,
      baseMtime: 1000,
      statMtime: async () => 1000,
      writeText: async (_filePath, text) => {
        written.push(text);
      },
    });
    expect(result.ok).toBe(true);
    expect(written.join("")).toContain("schemaVersion: 2");
  });

  it("baseMtime 过期时返回 conflict 且不落盘", async () => {
    const writeText = vi.fn(async () => {});
    const result = await saveAuthorProject({
      ...baseOptions("unused-root"),
      yaml: V2_YAML,
      baseMtime: 999,
      statMtime: async () => 1000,
      readText: async () => "server current yaml",
      writeText,
    });
    expect(result).toMatchObject({
      ok: false,
      conflict: true,
      code: "config.conflict",
      currentYaml: "server current yaml",
      mtime: 1000,
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("文件不存在按 mtime 0 语义处理", async () => {
    const miss = await saveAuthorProject({
      ...baseOptions("unused-root"),
      yaml: V2_YAML,
      baseMtime: 5,
      statMtime: async () => 0,
      readText: async () => {
        throw new Error("ENOENT");
      },
      writeText: async () => {},
    });
    expect(miss).toMatchObject({ ok: false, conflict: true, currentYaml: "", mtime: 0 });

    const hit = await saveAuthorProject({
      ...baseOptions("unused-root"),
      yaml: V2_YAML,
      baseMtime: 0,
      statMtime: async () => 0,
      writeText: async () => {},
    });
    expect(hit.ok).toBe(true);
  });
});
