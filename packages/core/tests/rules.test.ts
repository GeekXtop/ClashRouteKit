import { describe, expect, it } from "vitest";
import { parseDomainListEntry } from "../src/index.js";

describe("parseDomainListEntry", () => {
  it("collects deduped includes and counts own non-include rules", () => {
    const info = parseDomainListEntry(
      [
        "# comment line",
        "include:npmjs",
        "github.com",
        "full:api.github.com  # trailing comment",
        "include:npmjs", // duplicate include
        "domain:githubusercontent.com",
        "",
      ].join("\n"),
    );

    expect(info.includes).toEqual(["npmjs"]);
    expect(info.ruleCount).toBe(3); // github.com, full:api.github.com, domain:githubusercontent.com
  });
});
