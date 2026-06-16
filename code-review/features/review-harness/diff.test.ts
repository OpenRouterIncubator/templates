import { describe, expect, it } from "bun:test";

import { hunkIndex, parseHunks, resolveLine } from "./diff.ts";

describe("parseHunks", () => {
  it("extracts new-file ranges from hunk headers", () => {
    const hunks = parseHunks("@@ -1,3 +10,4 @@\n+a\n@@ -20 +40 @@\n+b");
    expect(hunks).toEqual([
      { newEnd: 13, newStart: 10 },
      { newEnd: 40, newStart: 40 },
    ]);
  });
});

describe("resolveLine", () => {
  const hunks = [{ newEnd: 14, newStart: 10 }];

  it("keeps an in-hunk line", () => {
    expect(resolveLine(hunks, 12)).toBe(12);
  });

  it("snaps an out-of-hunk line to the nearest boundary", () => {
    expect(resolveLine(hunks, 30)).toBe(14);
    expect(resolveLine(hunks, 2)).toBe(10);
  });

  it("returns null when there are no hunks", () => {
    expect(resolveLine([], 5)).toBeNull();
  });
});

describe("hunkIndex", () => {
  it("indexes patches by filename", () => {
    const index = hunkIndex([
      {
        additions: 1,
        deletions: 0,
        filename: "a.ts",
        patch: "@@ -1 +1,2 @@\n+x",
        status: "modified",
      },
      { additions: 0, deletions: 0, filename: "bin", status: "modified" },
    ]);
    expect(index.get("a.ts")).toEqual([{ newEnd: 2, newStart: 1 }]);
    expect(index.has("bin")).toBe(false);
  });
});
