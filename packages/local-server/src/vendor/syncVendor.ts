import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { RouteKitProjectConfig, VendorRepoConfig } from "@clash-route-kit/core";
import { readConfig, type ProjectOptions } from "../config/configRepository.js";
import type { VendorSyncActionResult } from "../git/gitActions.js";

const execFileAsync = promisify(execFile);

/** 与 gitActions 的 VendorSyncActionResult 同构；保留原 apps/cli 导出名。 */
export type VendorSyncResult = VendorSyncActionResult;

export interface SyncVendorOptions extends ProjectOptions {
  runGit?: (args: string[], cwd: string) => Promise<void>;
  only?: string;
}

async function defaultRunGit(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

function readVendorRepos(config: RouteKitProjectConfig, configFile: string): VendorRepoConfig[] {
  if (!Array.isArray(config.vendorRepos)) {
    throw new Error(`Missing vendorRepos in ${configFile}`);
  }

  return config.vendorRepos;
}

/** sync-vendor 用例：按 vendorRepos 声明 clone 缺失仓库、pull 既有仓库，单仓失败不中断。 */
export async function syncVendor(options: SyncVendorOptions): Promise<VendorSyncResult[]> {
  const runGit = options.runGit ?? defaultRunGit;
  const config = await readConfig(options);
  const repos = readVendorRepos(config, options.configFile);
  const selected = options.only ? repos.filter((repo) => repo.name === options.only) : repos;
  const results: VendorSyncResult[] = [];
  await mkdir(path.join(options.root, "vendor"), { recursive: true });

  for (const repo of selected) {
    const repoPath = path.join(options.root, repo.path);
    try {
      const gitDir = path.join(repoPath, ".git");
      if (existsSync(gitDir)) {
        if (repo.branch) {
          await runGit(["-C", repoPath, "fetch", "--depth", "1", "origin", repo.branch], options.root);
          await runGit(["-C", repoPath, "checkout", "-B", repo.branch, "FETCH_HEAD"], options.root);
        } else {
          await runGit(["-C", repoPath, "pull", "--ff-only"], options.root);
        }
        results.push({ name: repo.name, action: "pull", path: repoPath });
        continue;
      }

      if (existsSync(repoPath)) {
        throw new Error(`Vendor path exists but is not a git repository: ${repoPath}`);
      }

      const cloneArgs = ["clone", "--depth", "1"];
      if (repo.branch) cloneArgs.push("--branch", repo.branch);
      cloneArgs.push(repo.url, repoPath);
      await runGit(cloneArgs, options.root);
      results.push({ name: repo.name, action: "clone", path: repoPath });
    } catch (error: unknown) {
      results.push({
        name: repo.name,
        action: "error",
        path: repoPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
