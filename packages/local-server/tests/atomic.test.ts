import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { writeFileAtomic } from "../src/index.js";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "local-server-atomic-"));
  tempRoots.push(dir);
  return dir;
}

afterAll(async () => {
  for (const dir of tempRoots) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("writeFileAtomic", () => {
  it("writes content atomically and leaves no temp files behind", async () => {
    const root = await makeTempRoot();
    const target = path.join(root, "routes.yaml");

    await writeFileAtomic(target, "publishBaseUrl: http://127.0.0.1:8787\n");

    await expect(readFile(target, "utf8")).resolves.toBe("publishBaseUrl: http://127.0.0.1:8787\n");
    expect(await readdir(root)).toEqual(["routes.yaml"]);
  });

  it("replaces existing content in place", async () => {
    const root = await makeTempRoot();
    const target = path.join(root, "routes.yaml");
    await writeFile(target, "old: true\n", "utf8");

    await writeFileAtomic(target, "new: true\n");

    await expect(readFile(target, "utf8")).resolves.toBe("new: true\n");
  });

  it("cleans up the temp file when the rename fails and keeps the target intact", async () => {
    const root = await makeTempRoot();
    const target = path.join(root, "blocked");
    await mkdir(target);
    await writeFile(path.join(target, "occupant.txt"), "keep\n", "utf8");

    await expect(writeFileAtomic(target, "should not land\n")).rejects.toThrow();
    await expect(readFile(path.join(target, "occupant.txt"), "utf8")).resolves.toBe("keep\n");

    const entries = await readdir(root);
    expect(entries).toEqual(["blocked"]);
    expect(entries.some((entry) => entry.includes(".tmp"))).toBe(false);
  });
});
