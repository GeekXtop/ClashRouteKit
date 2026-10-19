import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAuthorProjectConfig } from "@clash-route-kit/core";

const configDir = fileURLToPath(new URL("../../../config/", import.meta.url));

describe("config examples freshness", () => {
  it("所有 *.yaml.example 均可解析为 Schema v2", async () => {
    const files = (await readdir(configDir)).filter((name) => name.endsWith(".yaml.example"));
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const text = await readFile(path.join(configDir, name), "utf8");
      const parsed = parseAuthorProjectConfig(text);
      expect(parsed.v2.schemaVersion).toBe(2);
    }
  });
});
