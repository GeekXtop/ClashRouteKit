import { describe, expect, it } from "vitest";
import {
  createInitialActionStates,
  createRawUrlTemplates,
  getPublishActionWarning,
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
      providers: "https://raw.githubusercontent.com/acme/routes/publish/providers/",
    });
  });
});
