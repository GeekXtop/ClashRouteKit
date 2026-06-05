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
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          action: "check",
          ok: false,
          output: "[check] Module ai references missing policy group: AI",
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
    });
  });

  it("throws when the API returns an invalid payload", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(requestLocalAction("generate", fetcher)).rejects.toThrow("Invalid local action response");
  });
});
