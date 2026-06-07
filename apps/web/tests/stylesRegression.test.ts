import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "apps/web/src/styles.css"), "utf8");

function cssRule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...css.matchAll(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, "g"))];
  const match = matches.at(-1);
  if (!match) throw new Error(`Missing CSS rule: ${selector}`);
  return match[1]!;
}

describe("web editor CSS regression checks", () => {
  it("keeps entity list labels readable instead of squeezing them behind details", () => {
    const entityRow = cssRule(".entity-row");

    expect(entityRow).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(entityRow).not.toContain("auto");
  });
});
