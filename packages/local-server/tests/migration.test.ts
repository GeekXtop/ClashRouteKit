import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parseRouteKitConfig,
  planLegacyMigration,
  type MigrationPlan,
} from "@clash-route-kit/core";
import { afterAll, describe, expect, it } from "vitest";
import { analyzeMigration, applyMigration } from "../src/index.js";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "local-server-migrate-"));
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
  "    options: [DIRECT]",
  "  - name: Auto",
  "    type: url-test",
  "    options: [Proxy]",
  "    url: http://www.gstatic.com/generate_204",
  "    interval: 300",
  "ruleSets:",
  "  - id: final",
  "    policy: Proxy",
  "    source:",
  "      type: final",
  "ruleProviders: []",
  "",
].join("\n");

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

const baseOptions = { root: "E:/repo", configFile: "config/routes.yaml" };
const configPath = path.resolve(baseOptions.root, baseOptions.configFile);
const fixedNow = () => new Date("2026-09-13T08:30:00.000Z");
const expectedBackupPath = `${configPath}.bak-2026-09-13T08-30-00.000Z`;

function buildPlan(): MigrationPlan {
  return planLegacyMigration(parseRouteKitConfig(V1_YAML));
}

function tamperPlan(plan: MigrationPlan): MigrationPlan {
  return {
    ...plan,
    draft: {
      ...plan.draft,
      routes: plan.draft.routes.map((route) =>
        route.id === "final" ? { ...route, policy: { group: "ghost" } } : route,
      ),
    },
  };
}

function createMemoryFs(initial: Record<string, string>) {
  const files = new Map<string, string>(Object.entries(initial));
  const writes: Array<{ filePath: string; text: string }> = [];
  return {
    files,
    writes,
    readText: async (filePath: string) => {
      const text = files.get(filePath);
      if (text === undefined) throw new Error(`ENOENT: ${filePath}`);
      return text;
    },
    writeText: async (filePath: string, text: string) => {
      writes.push({ filePath, text });
      files.set(filePath, text);
    },
    fileExists: async (filePath: string) => files.has(filePath),
  };
}

describe("analyzeMigration", () => {
  it("returns a full plan with summary for a v1 config", async () => {
    const analysis = await analyzeMigration({
      ...baseOptions,
      readText: async (filePath) => {
        expect(filePath).toBe(configPath);
        return V1_YAML;
      },
    });
    expect(analysis.currentSchemaVersion).toBe(1);
    expect(analysis.plan).not.toBeNull();
    const plan = analysis.plan!;
    expect(plan.summary).toEqual({
      groups: 2,
      routes: 1,
      providers: 0,
      memberSets: 0,
      issues: plan.issues.length,
    });
    expect(plan.issues.length).toBeGreaterThanOrEqual(1);
    expect(plan.issues.every((issue) => issue.code.startsWith("migrate."))).toBe(true);
    expect(plan.yaml).toContain("schemaVersion: 2");
    expect(plan.draft.proxyGroups.map((group) => group.id)).toEqual(["proxy", "auto"]);
  });

  it("returns currentSchemaVersion 2 without a plan for a v2 config", async () => {
    const analysis = await analyzeMigration({
      ...baseOptions,
      readText: async () => V2_YAML,
    });
    expect(analysis.currentSchemaVersion).toBe(2);
    expect(analysis.plan).toBeNull();
  });

  it("throws ConfigDiagnosticError for an unsupported schemaVersion", async () => {
    const analysis = analyzeMigration({
      ...baseOptions,
      readText: async () => "schemaVersion: 3\nproxyGroups: []\n",
    });
    await expect(analysis).rejects.toMatchObject({ name: "ConfigDiagnosticError" });
  });
});

describe("applyMigration", () => {
  it("backs up the original file and writes v2 YAML with schemaVersion at the top", async () => {
    const fs = createMemoryFs({ [configPath]: V1_YAML });
    const result = await applyMigration({
      ...baseOptions,
      plan: buildPlan(),
      readText: fs.readText,
      writeText: fs.writeText,
      fileExists: fs.fileExists,
      now: fixedNow,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backupPath).toBe(expectedBackupPath);
    expect(result.yaml.startsWith("schemaVersion: 2\n")).toBe(true);
    expect(result.diagnostics.every((diagnostic) => diagnostic.severity !== "error")).toBe(true);
    expect(fs.files.get(configPath)).toBe(result.yaml);
    expect(fs.files.get(expectedBackupPath)).toBe(V1_YAML);
    // 写入顺序：先备份原文件，再原子替换当前配置
    expect(fs.writes.map((write) => write.filePath)).toEqual([expectedBackupPath, configPath]);
  });

  it("appends a serial number when the backup path already exists", async () => {
    const fs = createMemoryFs({
      [configPath]: V1_YAML,
      [expectedBackupPath]: "previous backup",
    });
    const result = await applyMigration({
      ...baseOptions,
      plan: buildPlan(),
      readText: fs.readText,
      writeText: fs.writeText,
      fileExists: fs.fileExists,
      now: fixedNow,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backupPath).toBe(`${expectedBackupPath}-2`);
    expect(fs.files.get(`${expectedBackupPath}-2`)).toBe(V1_YAML);
  });

  it("rejects a tampered plan with error diagnostics and leaves every file untouched", async () => {
    const fs = createMemoryFs({ [configPath]: V1_YAML });
    const result = await applyMigration({
      ...baseOptions,
      plan: tamperPlan(buildPlan()),
      readText: fs.readText,
      writeText: fs.writeText,
      fileExists: fs.fileExists,
      now: fixedNow,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.some((diagnostic) => diagnostic.severity === "error")).toBe(true);
    // 原文件与备份均无变化，没有任何写盘
    expect(fs.files.get(configPath)).toBe(V1_YAML);
    expect(fs.files.has(expectedBackupPath)).toBe(false);
    expect(fs.writes).toEqual([]);
  });

  it("rejects applying when the current config is already v2", async () => {
    const fs = createMemoryFs({ [configPath]: V2_YAML });
    const result = await applyMigration({
      ...baseOptions,
      plan: buildPlan(),
      readText: fs.readText,
      writeText: fs.writeText,
      fileExists: fs.fileExists,
      now: fixedNow,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.code).toBe("migrate.apply.already-v2");
    expect(fs.writes).toEqual([]);
  });

  it("writes the backup and the v2 config atomically on the real filesystem", async () => {
    const root = await makeTempRoot();
    const configDir = path.join(root, "config");
    await mkdir(configDir);
    await writeFile(path.join(configDir, "routes.yaml"), V1_YAML, "utf8");

    const result = await applyMigration({ root, configFile: "config/routes.yaml", plan: buildPlan() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const entries = (await readdir(configDir)).sort();
    expect(entries).toHaveLength(2);
    const backupName = entries.find((entry) => entry !== "routes.yaml")!;
    expect(backupName).toMatch(/^routes\.yaml\.bak-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
    const { readFile } = await import("node:fs/promises");
    expect(await readFile(path.join(configDir, backupName), "utf8")).toBe(V1_YAML);
    const migrated = await readFile(path.join(configDir, "routes.yaml"), "utf8");
    expect(migrated).toBe(result.yaml);
    expect(migrated.startsWith("schemaVersion: 2\n")).toBe(true);
    // 原子替换不应残留临时文件
    expect(entries.some((entry) => entry.endsWith(".tmp"))).toBe(false);
  });
});
