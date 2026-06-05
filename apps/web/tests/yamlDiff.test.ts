import { describe, expect, it } from "vitest";
import { createLineDiff } from "../src/yamlDiff.js";

describe("yaml line diff", () => {
  it("marks unchanged, removed, and added lines", () => {
    const diff = createLineDiff("a: 1\nb: 2\nc: 3\n", "a: 1\nb: 4\nc: 3\n");

    expect(diff).toEqual([
      { type: "unchanged", text: "a: 1", oldLine: 1, newLine: 1 },
      { type: "removed", text: "b: 2", oldLine: 2 },
      { type: "added", text: "b: 4", newLine: 2 },
      { type: "unchanged", text: "c: 3", oldLine: 3, newLine: 3 },
    ]);
  });

  it("handles inserted lines without marking the rest of the file as changed", () => {
    const diff = createLineDiff("modules:\n  - id: private\nfinal: DIRECT\n", "modules:\n  - id: ai\n  - id: private\nfinal: DIRECT\n");

    expect(diff).toEqual([
      { type: "unchanged", text: "modules:", oldLine: 1, newLine: 1 },
      { type: "added", text: "  - id: ai", newLine: 2 },
      { type: "unchanged", text: "  - id: private", oldLine: 2, newLine: 3 },
      { type: "unchanged", text: "final: DIRECT", oldLine: 3, newLine: 4 },
    ]);
  });
});
