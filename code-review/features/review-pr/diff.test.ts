import { describe, expect, it } from "bun:test";
import { hunkIndex, parseHunks, resolveLine } from "./diff.ts";

const PATCH = [
  "@@ -1,3 +1,4 @@",
  " a",
  "+b",
  " c",
  "@@ -20,2 +21,5 @@",
  "+x",
].join("\n");

describe("parseHunks", () => {
  it("reads new-file ranges from hunk headers", () => {
    expect(parseHunks(PATCH)).toEqual([
      { newEnd: 4, newStart: 1 },
      { newEnd: 25, newStart: 21 },
    ]);
  });

  it("treats a missing count as 1", () => {
    expect(parseHunks("@@ -5 +7 @@")).toEqual([{ newEnd: 7, newStart: 7 }]);
  });
});

describe("resolveLine", () => {
  const hunks = parseHunks(PATCH);

  it("keeps a line that falls inside a hunk", () => {
    expect(resolveLine(hunks, 3)).toBe(3);
  });

  it("snaps an out-of-hunk line to the nearest boundary", () => {
    expect(resolveLine(hunks, 19)).toBe(21);
  });

  it("returns null when there are no hunks", () => {
    expect(resolveLine([], 3)).toBeNull();
  });
});

describe("hunkIndex", () => {
  it("indexes hunks by filename and skips file-less entries", () => {
    const index = hunkIndex([
      {
        additions: 1,
        deletions: 0,
        filename: "a.ts",
        patch: PATCH,
        status: "modified",
      },
      { additions: 0, deletions: 0, filename: "b.ts", status: "renamed" },
    ]);
    expect(index.get("a.ts")).toHaveLength(2);
    expect(index.has("b.ts")).toBe(false);
  });
});
