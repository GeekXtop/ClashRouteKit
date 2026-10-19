import { describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  deleteProjectRuleFile,
  listProjectRuleFiles,
  readProjectRuleFile,
  writeProjectRuleFile,
} from "../src/index.js";

describe("project rule file helpers", () => {
  const root = path.resolve("fixture-repo");

  it("lists only .list files under config/rules", async () => {
    const files = await listProjectRuleFiles({
      root,
      configFile: "config/routes.yaml",
      readDirectory: async (directory) => {
        expect(directory).toBe(path.resolve(root, "config/rules"));
        return ["AI.list", "README.md", "Custom.list"];
      },
    });

    expect(files).toEqual(["AI.list", "Custom.list"]);
  });

  it("reads and writes rule files under config/rules", async () => {
    const reads: string[] = [];
    const writes: Array<{ filePath: string; text: string }> = [];
    const read = await readProjectRuleFile({
      root,
      configFile: "config/routes.yaml",
      file: "AI.list",
      readText: async (filePath) => {
        reads.push(filePath);
        return "DOMAIN,openai.com\n";
      },
    });
    const write = await writeProjectRuleFile({
      root,
      configFile: "config/routes.yaml",
      file: "AI.list",
      text: "DOMAIN,openai.com\n",
      writeText: async (filePath, text) => {
        writes.push({ filePath, text });
      },
    });

    expect(read).toEqual({ file: "AI.list", text: "DOMAIN,openai.com\n" });
    expect(write).toEqual({ file: "AI.list", text: "DOMAIN,openai.com\n" });
    expect(reads[0]).toBe(path.resolve(root, "config/rules/AI.list"));
    expect(writes[0]).toEqual({
      filePath: path.resolve(root, "config/rules/AI.list"),
      text: "DOMAIN,openai.com\n",
    });
  });

  it("deletes rule files under config/rules", async () => {
    const removed: string[] = [];
    const result = await deleteProjectRuleFile({
      root,
      configFile: "config/routes.yaml",
      file: "AI.list",
      removePath: async (filePath) => {
        removed.push(filePath);
      },
    });

    expect(result).toEqual({ file: "AI.list" });
    expect(removed).toEqual([path.resolve(root, "config/rules/AI.list")]);
  });

  it("rejects path traversal and non-list rule files", async () => {
    await expect(readProjectRuleFile({
      root,
      configFile: "config/routes.yaml",
      file: "../routes.yaml",
      readText: async () => "",
    })).rejects.toThrow("Invalid rule file");

    await expect(writeProjectRuleFile({
      root,
      configFile: "config/routes.yaml",
      file: "AI.yaml",
      text: "",
      writeText: async () => {},
    })).rejects.toThrow("Invalid rule file");

    await expect(deleteProjectRuleFile({
      root,
      configFile: "config/routes.yaml",
      file: "../routes.yaml",
      removePath: async () => {},
    })).rejects.toThrow("Invalid rule file");
  });
});

// spyOn 命名空间导出（保留原实现，透传）：钉住"默认写入口必须走 writeFileAtomic"
// 这一接线契约——这是唯一能从外部观察默认路径选了哪个写原语的方式。
import * as atomicModule from "../src/config/atomic.js";

describe("writeProjectRuleFile 原子替换", () => {
  it("默认写入口走 writeFileAtomic 且不残留临时文件", async () => {
    const spy = vi.spyOn(atomicModule, "writeFileAtomic");
    const dir = await mkdtemp(path.join(tmpdir(), "rulefiles-atomic-"));
    const configDir = path.join(dir, "config", "rules");
    await mkdir(configDir, { recursive: true });
    const target = path.join(configDir, "Demo_Domain.list");
    await writeFile(target, "old-content", "utf8");

    const result = await writeProjectRuleFile({
      root: dir,
      configFile: "config/routes.yaml",
      file: "Demo_Domain.list",
      text: "new-content",
    });

    expect(result.text).toBe("new-content\n");
    expect(await readFile(target, "utf8")).toBe("new-content\n");
    expect(spy).toHaveBeenCalledTimes(1);
    const leftovers = (await readdir(configDir)).filter((name) => name !== "Demo_Domain.list");
    expect(leftovers).toEqual([]);
    await rm(dir, { recursive: true, force: true });
  });
});
