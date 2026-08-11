import { describe, expect, it } from "vitest";
import { findDependencyCycles, type DependencyGraph } from "../src/index.js";

describe("findDependencyCycles", () => {
  it("returns one canonical cycle for repeated traversal paths", () => {
    const graph: DependencyGraph = {
      a: ["b"],
      b: ["c"],
      c: ["a"],
      d: ["b"],
    };

    expect(findDependencyCycles(graph)).toEqual([["a", "b", "c"]]);
  });

  it("ignores edges to external nodes and returns an empty array for a DAG", () => {
    expect(findDependencyCycles({ a: ["b", "DIRECT"], b: [] })).toEqual([]);
  });
});
