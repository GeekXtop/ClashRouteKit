import { describe, expect, it } from "vitest";
import {
  createInitialActionStates,
  createRawUrlTemplates,
  fetchGitRemote,
  fetchPublishStatus,
  getPublishActionWarning,
  parseGitHubRemote,
  parseGitHubRepo,
  updateActionState,
} from "../src/publishWorkflow.js";

describe("publish workflow", () => {
  it("tracks status and output independently for each action", () => {
    const states = createInitialActionStates();
    const next = updateActionState(states, "check", { status: "success", output: "[check] ok" });

    expect(next.check).toEqual({ status: "success", output: "[check] ok" });
    expect(next.generate).toEqual({ status: "idle", output: "尚未运行" });
    expect(states.check).toEqual({ status: "idle", output: "尚未运行" });
  });

  it("warns before commit when check or generate has not succeeded", () => {
    const states = createInitialActionStates();

    expect(getPublishActionWarning("git-commit", states)).toBe("提交前应先运行检查和生成输出");

    const checked = updateActionState(states, "check", { status: "success", output: "[check] ok" });
    const generated = updateActionState(checked, "generate", { status: "success", output: "[generate] ok" });

    expect(getPublishActionWarning("git-commit", generated)).toBeUndefined();
  });

  it("warns before commit when git status says there are no changes", () => {
    const states = updateActionState(
      updateActionState(
        updateActionState(createInitialActionStates(), "check", { status: "success", output: "[check] ok" }),
        "generate",
        { status: "success", output: "[generate] ok" },
      ),
      "git-status",
      { status: "success", output: "nothing to commit, working tree clean" },
    );

    expect(getPublishActionWarning("git-commit", states)).toBe("Git 状态显示没有可提交更改");
  });

  it("parses GitHub repository metadata from raw publish URLs", () => {
    expect(parseGitHubRepo("https://raw.githubusercontent.com/acme/routes/publish")).toEqual({
      owner: "acme",
      repo: "routes",
    });
    expect(parseGitHubRepo("http://127.0.0.1:8787")).toBeUndefined();
  });

  it("creates copyable raw URL templates", () => {
    expect(createRawUrlTemplates({ owner: "acme", repo: "routes" })).toEqual({
      template: "https://raw.githubusercontent.com/acme/routes/publish/templates/Custom_Clash.ini",
      rules: "https://raw.githubusercontent.com/acme/routes/publish/rules/",
    });
  });

  it("parses GitHub owner/repo from https and ssh git remotes", () => {
    expect(parseGitHubRemote("https://github.com/acme/routes.git")).toEqual({ owner: "acme", repo: "routes" });
    expect(parseGitHubRemote("git@github.com:acme/routes.git")).toEqual({ owner: "acme", repo: "routes" });
    expect(parseGitHubRemote("https://gitlab.com/acme/routes.git")).toBeUndefined();
  });

  it("reads the git remote url from the local API", async () => {
    const fetcher = async () => new Response(JSON.stringify({ url: "git@github.com:acme/routes.git" }), { status: 200 });
    await expect(fetchGitRemote(fetcher)).resolves.toBe("git@github.com:acme/routes.git");
  });

  it("reads branch and workflow status from the publish-status API", async () => {
    const payload = {
      branch: "main",
      workflow: {
        state: "success",
        conclusion: "success",
        createdAt: "2026-09-13T01:00:00Z",
        runUrl: "https://github.com/acme/routes/actions/runs/7",
      },
    };
    const fetcher = async () => new Response(JSON.stringify(payload), { status: 200 });
    await expect(fetchPublishStatus(fetcher)).resolves.toEqual(payload);
  });

  it("rejects a malformed publish-status payload", async () => {
    const fetcher = async () => new Response(JSON.stringify({ branch: "main" }), { status: 200 });
    await expect(fetchPublishStatus(fetcher)).rejects.toThrow("Invalid publish status response");
  });
});
