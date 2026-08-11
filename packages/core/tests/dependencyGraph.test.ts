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

  it("returns every canonical cycle when cycles share nodes", () => {
    const expected = [
      ["a", "b", "c"],
      ["a", "c"],
    ];

    expect(
      findDependencyCycles({ a: ["b", "c"], b: ["c"], c: ["a"] }),
    ).toEqual(expected);
    expect(
      findDependencyCycles({ a: ["c", "b"], b: ["c"], c: ["a"] }),
    ).toEqual(expected);
  });

  it("ignores edges to external nodes and returns an empty array for a DAG", () => {
    expect(findDependencyCycles({ a: ["b", "DIRECT"], b: [] })).toEqual([]);
  });

  it("ignores external edges named after object prototype properties", () => {
    expect(findDependencyCycles({ a: ["toString"] })).toEqual([]);
  });
});
