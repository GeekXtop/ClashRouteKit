import { describe, expect, it } from "vitest";
import type { CustomProxyGroup } from "@clash-route-kit/core";
import {
  buildProxyGroupTree,
  composeNodeFilter,
  detectProxyGroupCycles,
  parseNodeFilter,
  policyTone,
} from "../src/proxyGroups.js";

function group(name: string, options: string[]): CustomProxyGroup {
  return { name, type: "select", options };
}

describe("composeNodeFilter", () => {
  it("composes a GROUPID-scoped regex into one entry", () => {
    expect(composeNodeFilter({ scopeType: "groupId", scopeValue: "0", regex: "(港|HK)" })).toBe(
      "!!GROUPID=0!!(港|HK)",
    );
  });

  it("composes a GROUP-tag-scoped regex", () => {
    expect(composeNodeFilter({ scopeType: "group", scopeValue: "Proxy", regex: ".*" })).toBe(
      "!!GROUP=Proxy!!.*",
    );
  });

  it("emits a bare regex for the all scope", () => {
    expect(composeNodeFilter({ scopeType: "all", scopeValue: "", regex: "(港|HK)" })).toBe("(港|HK)");
  });
});

describe("parseNodeFilter", () => {
  it("round-trips a GROUPID-scoped filter", () => {
    expect(parseNodeFilter("!!GROUPID=0!!(港|HK)")).toEqual({
      scopeType: "groupId",
      scopeValue: "0",
      regex: "(港|HK)",
    });
  });

  it("parses a bare regex as the all scope", () => {
    expect(parseNodeFilter(".*")).toEqual({ scopeType: "all", scopeValue: "", regex: ".*" });
  });
});

describe("detectProxyGroupCycles", () => {
  it("finds a cycle between two groups", () => {
    const cycles = detectProxyGroupCycles([group("A", ["B"]), group("B", ["A"])]);
    expect(cycles.length).toBe(1);
    expect([...cycles[0]!].sort()).toEqual(["A", "B"]);
  });

  it("returns no cycles for a DAG that references external proxies", () => {
    expect(
      detectProxyGroupCycles([group("A", ["B", "DIRECT"]), group("B", ["DIRECT", "REJECT"])]),
    ).toEqual([]);
  });
});

describe("buildProxyGroupTree", () => {
  it("expands nested references and marks external leaves", () => {
    const tree = buildProxyGroupTree([group("A", ["B", "DIRECT"]), group("B", ["DIRECT"])], "A");
    expect(tree.name).toBe("A");
    expect(tree.children.map((child) => child.name)).toEqual(["B", "DIRECT"]);
    expect(tree.children[1]!.external).toBe(true);
    expect(tree.children[0]!.children.map((child) => child.name)).toEqual(["DIRECT"]);
  });

  it("marks a cyclic reference instead of recursing forever", () => {
    const tree = buildProxyGroupTree([group("A", ["B"]), group("B", ["A"])], "A");
    expect(tree.children[0]!.children[0]!.cyclic).toBe(true);
  });
});

describe("policyTone", () => {
  it("maps common semantics to fixed tones", () => {
    expect(policyTone("全球直连")).toBe("dir");
    expect(policyTone("广告拦截")).toBe("rej");
    expect(policyTone("漏网之鱼")).toBe("fin");
  });

  it("assigns a stable tone to other names", () => {
    expect(policyTone("AI")).toBe(policyTone("AI"));
    expect(["cat", "reg"]).toContain(policyTone("AI"));
  });
});
