import { describe, expect, it, vi } from "vitest";
import {
  getGitBranch,
  getPublishStatus,
  getWorkflowRunStatus,
  parseGitHubOwnerRepo,
  readGitRemote,
  runRouteKitAction,
} from "../src/index.js";

describe("routeKitAction (check/generate)", () => {
  const baseOptions = {
    root: "E:/repo",
    configFile: "config/routes.yaml",
  };

  it("formats a successful check action", async () => {
    const result = await runRouteKitAction("check", {
      ...baseOptions,
      checkConfig: async () => [],
    });

    expect(result).toEqual({
      action: "check",
      ok: true,
      output: "[check] ok",
      diagnostics: [],
    });
  });

  it("returns structured diagnostics from check actions", async () => {
    const diagnostic = {
      code: "workspace.geosite.missing",
      severity: "warning" as const,
      message: "Catalog 中未找到 gfw",
    };
    const result = await runRouteKitAction("check", {
      ...baseOptions,
      checkConfig: async () => [diagnostic],
    });
    expect(result).toMatchObject({ ok: true, diagnostics: [diagnostic] });
    expect(result.output).toContain("[workspace.geosite.missing]");
  });

  it("returns diagnostics for a failed check action", async () => {
    const diagnostic = {
      code: "route.policy.missing",
      severity: "error" as const,
      path: "ruleSets[0].policy",
      message: "RuleSet ai 引用了不存在的 custom_proxy_group：AI",
      related: ["AI"],
    };
    const result = await runRouteKitAction("check", {
      ...baseOptions,
      checkConfig: async () => [diagnostic],
    });

    expect(result).toEqual({
      action: "check",
      ok: false,
      output: "[check] [route.policy.missing] ruleSets[0].policy: RuleSet ai 引用了不存在的 custom_proxy_group：AI",
      diagnostics: [diagnostic],
    });
  });

  it("summarizes generated output paths and report counts", async () => {
    const result = await runRouteKitAction("generate", {
      ...baseOptions,
      generateOutputs: async () => ({
        templatePath: "E:/repo/output/templates/Custom_Clash.ini",
        rulePaths: ["E:/repo/output/rules/AI_Domain.yaml"],
        reportPath: "E:/repo/output/reports/rule-report.json",
        providers: [
          {
            name: "AI",
            output: "AI_Domain.yaml",
            path: "E:/repo/output/rules/AI_Domain.yaml",
            inputRules: 9,
            outputRules: 6,
            excludedRules: 1,
            sources: [
              { name: "Local", type: "clash-list" as const, inputRules: 9, outputRules: 6 },
            ],
          },
        ],
        duplicates: [{ provider: "AI", rules: [{ rule: "DOMAIN,example.com", sources: ["a", "b"] }] }],
        overlaps: [{ rule: "DOMAIN-SUFFIX,example.org", providers: ["AI", "Developer"] }],
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.output).toContain("[generate] template: E:/repo/output/templates/Custom_Clash.ini");
    expect(result.output).toContain("[generate] rules: E:/repo/output/rules/AI_Domain.yaml");
    expect(result.output).toContain("[generate] summary: AI output=6 excluded=1 sources=[Local:6/9]");
    expect(result.output).toContain("[generate] duplicates: providers=1 rules=1");
    expect(result.output).toContain("[generate] overlaps: rules=1");
    expect(result.output).toContain("[generate] report: E:/repo/output/reports/rule-report.json");
  });
});

describe("git route kit actions", () => {
  const baseOptions = {
    root: "E:/repo",
    configFile: "config/routes.yaml",
  };

  it("runs git status through injected command runner", async () => {
    const result = await runRouteKitAction("git-status", {
      ...baseOptions,
      runCommand: async (command, args, cwd) => {
        expect(command).toBe("git");
        expect(args).toEqual(["status", "--short"]);
        expect(cwd).toBe("E:/repo");
        return " M config/routes.yaml\n";
      },
    });

    expect(result).toEqual({
      action: "git-status",
      ok: true,
      output: " M config/routes.yaml\n",
    });
  });

  it("commits config changes through injected command runner", async () => {
    const commands: string[] = [];
    const result = await runRouteKitAction("git-commit", {
      ...baseOptions,
      checkConfig: async () => [],
      runCommand: async (command, args) => {
        commands.push([command, ...args].join(" "));
        return "";
      },
    });

    expect(commands).toEqual([
      "git add config/modules.yaml config/rules",
      "git commit -m chore: update route config",
    ]);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("[git] committed route config");
    expect(result.diagnostics).toEqual([]);
  });

  it("blocks an independent git commit when check diagnostics contain errors", async () => {
    const commands: string[] = [];
    const diagnostic = {
      code: "route.final.missing",
      severity: "error" as const,
      path: "ruleSets",
      message: "ruleSets 需要包含一条 FINAL 兜底规则",
    };
    const result = await runRouteKitAction("git-commit", {
      ...baseOptions,
      checkConfig: async () => [diagnostic],
      runCommand: async (command, args) => {
        commands.push([command, ...args].join(" "));
        return "committed";
      },
    });

    expect(result).toMatchObject({ action: "git-commit", ok: false, diagnostics: [diagnostic] });
    expect(commands).toEqual([]);
  });

  it("allows an independent git commit when check diagnostics only contain warnings", async () => {
    const commands: string[] = [];
    const diagnostic = {
      code: "workspace.geosite.missing",
      severity: "warning" as const,
      message: "Catalog 中未找到 gfw",
    };
    const result = await runRouteKitAction("git-commit", {
      ...baseOptions,
      checkConfig: async () => [diagnostic],
      runCommand: async (command, args) => {
        commands.push([command, ...args].join(" "));
        return "committed";
      },
    });

    expect(commands).toEqual([
      "git add config/modules.yaml config/rules",
      "git commit -m chore: update route config",
    ]);
    expect(result).toMatchObject({
      action: "git-commit",
      ok: true,
      output: "committed",
      diagnostics: [diagnostic],
    });
  });

  it("blocks an independent git push when check diagnostics contain errors", async () => {
    const commands: string[] = [];
    const diagnostic = {
      code: "route.final.missing",
      severity: "error" as const,
      path: "ruleSets",
      message: "ruleSets 需要包含一条 FINAL 兜底规则",
    };
    const result = await runRouteKitAction("git-push", {
      ...baseOptions,
      checkConfig: async () => [diagnostic],
      runCommand: async (command, args) => {
        commands.push([command, ...args].join(" "));
        return "pushed";
      },
    });

    expect(result).toMatchObject({ action: "git-push", ok: false, diagnostics: [diagnostic] });
    expect(commands).toEqual([]);
  });

  it("allows an independent git push when check diagnostics only contain warnings", async () => {
    const commands: string[] = [];
    const diagnostic = {
      code: "workspace.geosite.missing",
      severity: "warning" as const,
      message: "Catalog 中未找到 gfw",
    };
    const result = await runRouteKitAction("git-push", {
      ...baseOptions,
      checkConfig: async () => [diagnostic],
      runCommand: async (command, args) => {
        commands.push([command, ...args].join(" "));
        return "pushed";
      },
    });

    expect(commands).toEqual(["git push"]);
    expect(result).toMatchObject({
      action: "git-push",
      ok: true,
      output: "pushed",
      diagnostics: [diagnostic],
    });
  });

  it("reads the origin git remote url with a trimmed output", async () => {
    const url = await readGitRemote({
      ...baseOptions,
      runCommand: async (command, args) => {
        expect(command).toBe("git");
        expect(args).toEqual(["remote", "get-url", "origin"]);
        return "git@github.com:acme/routes.git\n";
      },
    });
    expect(url).toBe("git@github.com:acme/routes.git");
  });
});

describe("getGitBranch", () => {
  const baseOptions = {
    root: "E:/repo",
    configFile: "config/routes.yaml",
  };

  it("returns the current branch via the injected command runner", async () => {
    const branch = await getGitBranch({
      ...baseOptions,
      runCommand: async (command, args, cwd) => {
        expect(command).toBe("git");
        expect(args).toEqual(["rev-parse", "--abbrev-ref", "HEAD"]);
        expect(cwd).toBe("E:/repo");
        return "feature/publish-loop\n";
      },
    });
    expect(branch).toBe("feature/publish-loop");
  });

  it("throws a descriptive error on detached HEAD", async () => {
    await expect(
      getGitBranch({
        ...baseOptions,
        runCommand: async () => "HEAD\n",
      }),
    ).rejects.toThrow("detached HEAD");
  });

  it("throws a descriptive error when the git command fails", async () => {
    await expect(
      getGitBranch({
        ...baseOptions,
        runCommand: async () => {
          throw new Error("git failed");
        },
      }),
    ).rejects.toThrow("无法读取当前分支");
  });
});

describe("parseGitHubOwnerRepo", () => {
  it("parses https and ssh remotes and rejects non-GitHub hosts", () => {
    expect(parseGitHubOwnerRepo("https://github.com/acme/routes.git")).toEqual({ owner: "acme", repo: "routes" });
    expect(parseGitHubOwnerRepo("https://github.com/acme/routes")).toEqual({ owner: "acme", repo: "routes" });
    expect(parseGitHubOwnerRepo("git@github.com:acme/routes.git")).toEqual({ owner: "acme", repo: "routes" });
    expect(parseGitHubOwnerRepo("https://gitlab.com/acme/routes.git")).toBeNull();
    expect(parseGitHubOwnerRepo("")).toBeNull();
  });
});

describe("getWorkflowRunStatus", () => {
  const baseOptions = {
    root: "E:/repo",
    configFile: "config/routes.yaml",
  };

  function runsPayload(run: Record<string, unknown>): unknown {
    return {
      total_count: 1,
      workflow_runs: [
        {
          html_url: "https://github.com/acme/routes/actions/runs/123",
          created_at: "2026-09-13T01:02:03Z",
          ...run,
        },
      ],
    };
  }

  function fetchMock(payload: unknown, status = 200) {
    return vi.fn(async (_input: string, _init?: RequestInit) =>
      new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } }),
    );
  }

  it("maps in_progress and queued statuses without a conclusion", async () => {
    const fetchImpl = fetchMock(runsPayload({ status: "in_progress", conclusion: null }));
    const status = await getWorkflowRunStatus({
      ...baseOptions,
      runCommand: async () => "https://github.com/acme/routes.git\n",
      fetchImpl,
      env: {},
    });
    expect(status).toEqual({
      state: "in-progress",
      runUrl: "https://github.com/acme/routes/actions/runs/123",
      createdAt: "2026-09-13T01:02:03Z",
    });

    const queued = await getWorkflowRunStatus({
      ...baseOptions,
      runCommand: async () => "git@github.com:acme/routes.git",
      fetchImpl: fetchMock(runsPayload({ status: "queued", conclusion: null })),
      env: {},
    });
    expect(queued.state).toBe("queued");
  });

  it("maps success and failure conclusions", async () => {
    const success = await getWorkflowRunStatus({
      ...baseOptions,
      runCommand: async () => "https://github.com/acme/routes.git",
      fetchImpl: fetchMock(runsPayload({ status: "completed", conclusion: "success" })),
      env: {},
    });
    expect(success.state).toBe("success");
    expect(success.conclusion).toBe("success");

    const failed = await getWorkflowRunStatus({
      ...baseOptions,
      runCommand: async () => "https://github.com/acme/routes.git",
      fetchImpl: fetchMock(runsPayload({ status: "completed", conclusion: "failure" })),
      env: {},
    });
    expect(failed.state).toBe("failed");
  });

  it("requests the latest publish workflow run with GitHub API headers", async () => {
    const fetchImpl = fetchMock(runsPayload({ status: "completed", conclusion: "success" }));
    await getWorkflowRunStatus({
      ...baseOptions,
      runCommand: async () => "git@github.com:acme/routes.git",
      fetchImpl,
      env: {},
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/repos/acme/routes/actions/workflows/publish.yml/runs?per_page=1");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.accept).toBe("application/vnd.github+json");
    expect(headers["user-agent"]).toBeTruthy();
    expect(headers.authorization).toBeUndefined();
  });

  it("sends a bearer token from the environment when present", async () => {
    const fetchImpl = fetchMock(runsPayload({ status: "completed", conclusion: "success" }));
    await getWorkflowRunStatus({
      ...baseOptions,
      runCommand: async () => "https://github.com/acme/routes.git",
      fetchImpl,
      env: { GITHUB_TOKEN: "secret-token" },
    });
    const headers = (fetchImpl.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe("Bearer secret-token");
  });

  it("prefers GITHUB_TOKEN over GH_TOKEN", async () => {
    const fetchImpl = fetchMock(runsPayload({ status: "completed", conclusion: "success" }));
    await getWorkflowRunStatus({
      ...baseOptions,
      runCommand: async () => "https://github.com/acme/routes.git",
      fetchImpl,
      env: { GITHUB_TOKEN: "primary", GH_TOKEN: "fallback" },
    });
    const headers = (fetchImpl.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe("Bearer primary");
  });

  it("falls back to unsupported for non-GitHub remotes without calling the API", async () => {
    const fetchImpl = fetchMock({});
    const status = await getWorkflowRunStatus({
      ...baseOptions,
      runCommand: async () => "https://gitlab.com/acme/routes.git",
      fetchImpl,
      env: {},
    });
    expect(status).toEqual({ state: "unsupported" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("falls back to unsupported when the remote cannot be read", async () => {
    const fetchImpl = fetchMock({});
    const status = await getWorkflowRunStatus({
      ...baseOptions,
      runCommand: async () => {
        throw new Error("not a repo");
      },
      fetchImpl,
      env: {},
    });
    expect(status).toEqual({ state: "unsupported" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("falls back to unsupported on network errors and non-2xx responses", async () => {
    const network = await getWorkflowRunStatus({
      ...baseOptions,
      runCommand: async () => "https://github.com/acme/routes.git",
      fetchImpl: async () => {
        throw new Error("offline");
      },
      env: {},
    });
    expect(network).toEqual({ state: "unsupported" });

    const httpError = await getWorkflowRunStatus({
      ...baseOptions,
      runCommand: async () => "https://github.com/acme/routes.git",
      fetchImpl: fetchMock({ message: "Not Found" }, 404),
      env: {},
    });
    expect(httpError).toEqual({ state: "unsupported" });
  });

  it("reports unknown when the workflow has no runs yet", async () => {
    const status = await getWorkflowRunStatus({
      ...baseOptions,
      runCommand: async () => "https://github.com/acme/routes.git",
      fetchImpl: fetchMock({ total_count: 0, workflow_runs: [] }),
      env: {},
    });
    expect(status).toEqual({ state: "unknown" });
  });
});

describe("getPublishStatus", () => {
  const baseOptions = {
    root: "E:/repo",
    configFile: "config/routes.yaml",
  };

  it("aggregates the current branch and the latest workflow run", async () => {
    const status = await getPublishStatus({
      ...baseOptions,
      runCommand: async (_command, args) =>
        args[0] === "rev-parse" ? "main\n" : "git@github.com:acme/routes.git\n",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            workflow_runs: [
              {
                html_url: "https://github.com/acme/routes/actions/runs/9",
                created_at: "2026-09-13T00:00:00Z",
                status: "in_progress",
                conclusion: null,
              },
            ],
          }),
          { status: 200 },
        ),
      env: {},
    });
    expect(status).toEqual({
      branch: "main",
      workflow: {
        state: "in-progress",
        runUrl: "https://github.com/acme/routes/actions/runs/9",
        createdAt: "2026-09-13T00:00:00Z",
      },
    });
  });
});
