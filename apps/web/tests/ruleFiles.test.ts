import { describe, expect, it, vi } from "vitest";
import {
  listRuleFiles,
  loadRuleFile,
  saveRuleFile,
} from "../src/ruleFiles.js";

describe("rule file client", () => {
  it("lists config rule files", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ files: ["AI.list"] }), { status: 200 }));

    await expect(listRuleFiles(fetcher)).resolves.toEqual(["AI.list"]);
    expect(fetcher).toHaveBeenCalledWith("/api/project/rules");
  });

  it("loads one config rule file", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ file: "AI.list", text: "DOMAIN,openai.com\n" }), { status: 200 }),
    );

    await expect(loadRuleFile("AI.list", fetcher)).resolves.toEqual({
      file: "AI.list",
      text: "DOMAIN,openai.com\n",
    });
    expect(fetcher).toHaveBeenCalledWith("/api/project/rules/AI.list");
  });

  it("saves one config rule file", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ file: "AI.list", text: "DOMAIN,openai.com\n" }), { status: 200 }),
    );

    await expect(saveRuleFile("AI.list", "DOMAIN,openai.com\n", fetcher)).resolves.toEqual({
      file: "AI.list",
      text: "DOMAIN,openai.com\n",
    });
    expect(fetcher).toHaveBeenCalledWith("/api/project/rules/AI.list", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "DOMAIN,openai.com\n" }),
    });
  });
});
