import { describe, expect, it } from "bun:test";

import { buildDimensionPrompt, DIMENSIONS, renderDiff } from "./dimensions.ts";

describe("DIMENSIONS", () => {
  it("covers five distinct concerns, each with a JSON-shaped system prompt", () => {
    expect(DIMENSIONS).toHaveLength(5);
    expect(new Set(DIMENSIONS.map((dimension) => dimension.id)).size).toBe(5);
    for (const dimension of DIMENSIONS) {
      expect(dimension.system).toContain('"findings"');
    }
  });
});

describe("renderDiff", () => {
  it("renders changed files as fenced diff blocks and skips patch-less files", () => {
    const rendered = renderDiff([
      {
        additions: 1,
        deletions: 0,
        filename: "a.ts",
        patch: "@@ -1 +1,2 @@\n+x",
        status: "modified",
      },
      { additions: 0, deletions: 0, filename: "bin", status: "modified" },
    ]);
    expect(rendered).toContain("### a.ts (+1 -0)");
    expect(rendered).toContain("```diff");
    expect(rendered).not.toContain("bin");
  });
});

describe("buildDimensionPrompt", () => {
  it("embeds the target title and the rendered diff", () => {
    const prompt = buildDimensionPrompt("local working changes", "### a.ts");
    expect(prompt).toContain("local working changes");
    expect(prompt).toContain("### a.ts");
  });
});
