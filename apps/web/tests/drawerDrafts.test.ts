import { describe, expect, it } from "vitest";
import {
  createCustomProxyGroupDraft,
  createProjectDefaultsDraft,
  createRuleSetDraft,
  finalizeCustomProxyGroupDraft,
  finalizeProjectDefaultsDraft,
  finalizeRuleSetDraft,
  nodeFiltersFromText,
  nodeFiltersToText,
} from "../src/drawerDrafts.js";

describe("drawer draft helpers", () => {
  it("round-trips node filters through one-regex-per-line text", () => {
    expect(nodeFiltersToText(["(港|HK)", "!!GROUPID=0!!US"])).toBe(
      "(港|HK)\n!!GROUPID=0!!US",
    );
    expect(nodeFiltersFromText("(港|HK)\r\n  \r\n !!GROUPID=0!!US \n")).toEqual([
      "(港|HK)",
      " !!GROUPID=0!!US ",
    ]);
  });

  it("materializes GEOIP no-resolve as true in project defaults", () => {
    const draft = createProjectDefaultsDraft(undefined);

    expect(draft.ruleSets?.geoipNoResolve).toBe(true);
    expect(finalizeProjectDefaultsDraft(draft)).toEqual({
      ok: true,
      value: { ruleSets: { geoipNoResolve: true } },
    });
  });

  it("accepts custom empty timeout and tolerance but rejects empty interval", () => {
    const draft = createCustomProxyGroupDraft({
      name: "Auto",
      type: "url-test",
      options: [],
      nodeFilters: [".*"],
    });
    draft.group.timeout = null;
    draft.group.tolerance = null;

    expect(finalizeCustomProxyGroupDraft(draft, [draft.group], "Auto")).toEqual({
      ok: true,
      value: {
        name: "Auto",
        type: "url-test",
        options: [],
        nodeFilters: [".*"],
        timeout: null,
        tolerance: null,
      },
    });

    draft.group.interval = null;
    expect(finalizeCustomProxyGroupDraft(draft, [draft.group], "Auto")).toEqual({
      ok: false,
      error: "测速间隔（秒）不能为空",
    });
  });

  it("rejects duplicate group names without mutating the draft", () => {
    const draft = createCustomProxyGroupDraft({
      name: "Auto",
      type: "url-test",
      options: [],
      nodeFilters: [".*"],
    });
    draft.group.name = "Proxy";

    expect(
      finalizeCustomProxyGroupDraft(
        draft,
        [{ name: "Proxy" }, { name: "Auto" }],
        "Auto",
      ),
    ).toEqual({
      ok: false,
      error: 'custom_proxy_group "Proxy" already exists',
    });
    expect(draft.group.name).toBe("Proxy");
  });

  it("rejects a blank custom Rule Provider interval", () => {
    const draft = createRuleSetDraft({
      id: "ai-provider",
      policy: "AI",
      source: { type: "rule-provider", behavior: "domain", file: "AI.yaml" },
    });
    if (draft.source.type !== "rule-provider") throw new Error("unexpected source");
    draft.source.interval = null;

    expect(finalizeRuleSetDraft(draft, [draft.id], "ai-provider")).toEqual({
      ok: false,
      error: "更新间隔（秒）不能为空",
    });
  });
});
