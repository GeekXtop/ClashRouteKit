import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadLocalSettings, resolveLocalSettingsPath } from "../src/index.js";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "local-server-settings-"));
  tempRoots.push(dir);
  return dir;
}

afterAll(async () => {
  for (const dir of tempRoots) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function writeLocalYaml(root: string, yaml: string): Promise<string> {
  const filePath = resolveLocalSettingsPath(root);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, yaml, "utf8");
  return filePath;
}

describe("loadLocalSettings", () => {
  it("returns defaults when the settings file is missing and env is empty", async () => {
    const root = await makeTempRoot();

    const settings = await loadLocalSettings({ root, env: {} });

    expect(settings).toEqual({
      serve: {
        host: "127.0.0.1",
        port: 8787,
        publicBaseUrl: "http://127.0.0.1:8787",
      },
      subconverterUrl: "http://127.0.0.1:25500/sub",
    });
  });

  it("applies the settings file on top of defaults", async () => {
    const root = await makeTempRoot();
    await writeLocalYaml(
      root,
      [
        "serve:",
        "  host: 0.0.0.0",
        "  port: 9000",
        "subconverterUrl: http://10.0.0.3:25500/sub",
        "",
      ].join("\n"),
    );

    const settings = await loadLocalSettings({ root, env: {} });

    expect(settings.serve.host).toBe("0.0.0.0");
    expect(settings.serve.port).toBe(9000);
    expect(settings.serve.publicBaseUrl).toBe("http://127.0.0.1:8787");
    expect(settings.subconverterUrl).toBe("http://10.0.0.3:25500/sub");
  });

  it("lets env variables override the settings file", async () => {
    const root = await makeTempRoot();
    await writeLocalYaml(
      root,
      [
        "serve:",
        "  host: 0.0.0.0",
        "  port: 9000",
        "  publicBaseUrl: http://192.168.1.10:8787",
        "subconverterUrl: http://10.0.0.3:25500/sub",
        "",
      ].join("\n"),
    );

    const settings = await loadLocalSettings({
      root,
      env: {
        CLASH_ROUTE_KIT_HOST: "127.0.0.2",
        CLASH_ROUTE_KIT_PORT: "9001",
        CLASH_ROUTE_KIT_PUBLISH_BASE_URL: "http://example.test:8787",
        CLASH_ROUTE_KIT_SUBCONVERTER_BASE_URL: "http://env-subconverter.test:25500/sub",
      },
    });

    expect(settings.serve).toEqual({
      host: "127.0.0.2",
      port: 9001,
      publicBaseUrl: "http://example.test:8787",
    });
    expect(settings.subconverterUrl).toBe("http://env-subconverter.test:25500/sub");
  });

  it("gives CLI overrides the highest priority over env and file", async () => {
    const root = await makeTempRoot();
    await writeLocalYaml(root, "serve:\n  port: 9000\n");

    const settings = await loadLocalSettings({
      root,
      env: { CLASH_ROUTE_KIT_PORT: "9001" },
      overrides: { serve: { port: 9002 } },
    });

    expect(settings.serve.port).toBe(9002);
  });

  it("rejects a broken settings file with the file path in the error", async () => {
    const root = await makeTempRoot();
    await writeLocalYaml(root, "serve: [unclosed\n");

    await expect(loadLocalSettings({ root, env: {} })).rejects.toThrow(/local\.yaml/);
  });

  it("rejects a settings file with wrong field types", async () => {
    const root = await makeTempRoot();
    await writeLocalYaml(root, "serve:\n  port: not-a-number\n");

    await expect(loadLocalSettings({ root, env: {} })).rejects.toThrow(/serve\.port/);
  });

  it("rejects an invalid port coming from env", async () => {
    const root = await makeTempRoot();

    await expect(
      loadLocalSettings({ root, env: { CLASH_ROUTE_KIT_PORT: "http" } }),
    ).rejects.toThrow(/CLASH_ROUTE_KIT_PORT/);
  });
});
