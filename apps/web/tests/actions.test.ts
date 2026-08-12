import { describe, expect, it, vi } from "vitest";
import { requestLocalAction } from "../src/actions.js";

describe("requestLocalAction", () => {
  it("posts to the local API endpoint", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ action: "check", ok: true, output: "[check] ok" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await expect(requestLocalAction("check", fetcher)).resolves.toEqual({
      action: "check",
      ok: true,
      output: "[check] ok",
    });
    expect(fetcher).toHaveBeenCalledWith("/api/actions/check", { method: "POST" });
  });

  it("keeps command output for failed API actions", async () => {
    const diagnostics = [{
      code: "route.policy.missing",
      severity: "error",
      path: "ruleSets[0].policy",
      message: "RuleSet ai 引用了不存在的策略组",
    }];
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          action: "check",
          ok: false,
          output: "[check] Module ai references missing policy group: AI",
          diagnostics,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 422,
        },
      ),
    );

    await expect(requestLocalAction("check", fetcher)).resolves.toEqual({
      action: "check",
      ok: false,
      output: "[check] Module ai references missing policy group: AI",
      diagnostics,
    });
  });

  it("throws when the API returns an invalid payload", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(requestLocalAction("generate", fetcher)).rejects.toThrow("Invalid local action response");
  });

  it("throws when diagnostics is present but is not an array", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({
        action: "check",
        ok: true,
        output: "[check] ok",
        diagnostics: "not-an-array",
      }), { status: 200 }),
    );

    await expect(requestLocalAction("check", fetcher)).rejects.toThrow("Invalid local action response");
  });

  it("posts to the local git status endpoint", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ action: "git-status", ok: true, output: "clean" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await expect(requestLocalAction("git-status", fetcher)).resolves.toEqual({
      action: "git-status",
      ok: true,
      output: "clean",
    });
    expect(fetcher).toHaveBeenCalledWith("/api/actions/git-status", { method: "POST" });
  });
});
