import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const tsxCli = path.join(repositoryRoot, "node_modules/tsx/dist/cli.mjs");
const cliEntry = path.join(repositoryRoot, "apps/cli/src/index.ts");

async function runCheck(root: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, "--conditions", "development", cliEntry, "check"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        CLASH_ROUTE_KIT_CONFIG: "routes.yaml",
        CLASH_ROUTE_KIT_ROOT: root,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function checkConfig(policy: string, geosite: string): string {
  return [
    "publishBaseUrl: http://127.0.0.1:8787",
    "template:",
    "  output: Custom_Clash.ini",
    "customProxyGroups:",
    "  - name: Proxy",
    "    type: select",
    "    options:",
    "      - DIRECT",
    "ruleSets:",
    "  - id: catalog",
    `    policy: ${policy}`,
    "    source:",
    "      type: geosite",
    `      value: ${geosite}`,
    "  - id: final",
    "    policy: Proxy",
    "    source:",
    "      type: final",
    "ruleProviders: []",
    "",
  ].join("\n");
}

describe("CLI check command", () => {
  it("prints warnings to stderr and exits zero", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await mkdir(path.join(root, "vendor/domain-list-community/data"), { recursive: true });
    await writeFile(path.join(root, "routes.yaml"), checkConfig("Proxy", "missing-catalog"), "utf8");

    const result = await runCheck(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("[check] [workspace.geosite.missing]");
  });

  it("prints errors to stderr and exits one", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "route-kit-"));
    await writeFile(path.join(root, "routes.yaml"), checkConfig("Missing", "catalog"), "utf8");

    const result = await runCheck(root);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("[check] [route.policy.missing]");
  });
});
