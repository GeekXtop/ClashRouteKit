import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadLocalSettings } from "../src/index.js";

async function prepareSettingsRoot(settings: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "route-kit-settings-"));
  await mkdir(path.join(root, ".clashroutekit"), { recursive: true });
  await writeFile(path.join(root, ".clashroutekit", "local.yaml"), settings, "utf8");
  return root;
}

const fileSettings = `
serve:
  host: 0.0.0.0
  port: 9000
  publicBaseUrl: http://10.0.0.5:9000
subconverterUrl: http://10.0.0.5:25500/sub
`;

describe("local settings priority chain", () => {
  it("resolves defaults when no file, env, or CLI overrides exist", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-settings-"));
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

  it("applies the settings file above defaults", async () => {
    const root = await prepareSettingsRoot(fileSettings);
    const settings = await loadLocalSettings({ root, env: {} });

    expect(settings.serve).toEqual({
      host: "0.0.0.0",
      port: 9000,
      publicBaseUrl: "http://10.0.0.5:9000",
    });
    expect(settings.subconverterUrl).toBe("http://10.0.0.5:25500/sub");
  });

  it("lets environment variables override the settings file", async () => {
    const root = await prepareSettingsRoot(fileSettings);
    const settings = await loadLocalSettings({
      root,
      env: {
        CLASH_ROUTE_KIT_HOST: "127.0.0.2",
        CLASH_ROUTE_KIT_PORT: "9001",
        CLASH_ROUTE_KIT_PUBLISH_BASE_URL: "http://10.0.0.6:9001",
        CLASH_ROUTE_KIT_SUBCONVERTER_BASE_URL: "http://10.0.0.6:25500/sub",
      },
    });

    expect(settings.serve).toEqual({
      host: "127.0.0.2",
      port: 9001,
      publicBaseUrl: "http://10.0.0.6:9001",
    });
    expect(settings.subconverterUrl).toBe("http://10.0.0.6:25500/sub");
  });

  it("gives CLI overrides the highest priority over env and file", async () => {
    const root = await prepareSettingsRoot(fileSettings);
    const settings = await loadLocalSettings({
      root,
      env: {
        CLASH_ROUTE_KIT_HOST: "127.0.0.2",
        CLASH_ROUTE_KIT_PORT: "9001",
        CLASH_ROUTE_KIT_PUBLISH_BASE_URL: "http://10.0.0.6:9001",
        CLASH_ROUTE_KIT_SUBCONVERTER_BASE_URL: "http://10.0.0.6:25500/sub",
      },
      overrides: {
        serve: {
          host: "127.0.0.3",
          port: 9002,
          publicBaseUrl: "http://10.0.0.7:9002",
        },
        subconverterUrl: "http://10.0.0.7:25500/sub",
      },
    });

    expect(settings).toEqual({
      serve: {
        host: "127.0.0.3",
        port: 9002,
        publicBaseUrl: "http://10.0.0.7:9002",
      },
      subconverterUrl: "http://10.0.0.7:25500/sub",
    });
  });
});
