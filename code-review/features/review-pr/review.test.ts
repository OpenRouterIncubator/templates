import { describe, expect, it } from "bun:test";
import {
  buildReview,
  buildReviewPrompt,
  chooseEvent,
  dedupeFindings,
  type Finding,
  filterAlreadyRaised,
  parseFindings,
} from "./review.ts";

const mustFix: Finding = {
  body: "Null deref when list is empty.",
  line: 12,
  path: "src/a.ts",
  severity: "must-fix",
};
const suggestion: Finding = {
  body: "Rename for clarity.",
  line: 3,
  path: "src/b.ts",
  severity: "suggestion",
};

const hunksByPath = new Map([
  ["src/a.ts", [{ newEnd: 20, newStart: 10 }]],
  ["src/b.ts", [{ newEnd: 5, newStart: 1 }]],
]);

describe("parseFindings", () => {
  it("parses a findings array wrapper", () => {
    expect(parseFindings(JSON.stringify({ findings: [mustFix] }))).toEqual([
      mustFix,
    ]);
  });

  it("defaults unknown severities to suggestion", () => {
    const json = JSON.stringify([
      { body: "x", line: 1, path: "p", severity: "weird" },
    ]);
    expect(parseFindings(json)[0]?.severity).toBe("suggestion");
  });

  it("drops malformed entries and invalid JSON", () => {
    expect(parseFindings("not json")).toEqual([]);
    expect(parseFindings(JSON.stringify([{ body: "x", path: "p" }]))).toEqual(
      []
    );
  });

  it("drops non-object entries while keeping valid ones", () => {
    expect(parseFindings(JSON.stringify([42, "nope", null, mustFix]))).toEqual([
      mustFix,
    ]);
  });
});

describe("buildReviewPrompt", () => {
  const pr = {
    body: "Fixes the flaky retry.",
    headSha: "abc123",
    state: "open",
    title: "fix: retry once",
  };

  it("renders the PR body and each patched file as a fenced diff", () => {
    const prompt = buildReviewPrompt(pr, [
      {
        additions: 2,
        deletions: 1,
        filename: "src/a.ts",
        patch: "@@ -1 +1,2 @@",
        status: "modified",
      },
      { additions: 0, deletions: 0, filename: "bin/blob", status: "added" },
    ]);
    expect(prompt).toContain("# Pull request: fix: retry once");
    expect(prompt).toContain("Fixes the flaky retry.");
    expect(prompt).toContain("### src/a.ts (+2 -1)");
    expect(prompt).toContain("```diff\n@@ -1 +1,2 @@\n```");
    expect(prompt).not.toContain("bin/blob");
  });

  it("omits the body section when the PR body is empty", () => {
    const prompt = buildReviewPrompt({ ...pr, body: "" }, []);
    expect(prompt).toContain("# Pull request: fix: retry once");
    expect(prompt).not.toContain("\n\n\n");
  });

  it("truncates oversized patches", () => {
    const prompt = buildReviewPrompt(pr, [
      {
        additions: 1,
        deletions: 0,
        filename: "src/big.ts",
        patch: "x".repeat(7000),
        status: "modified",
      },
    ]);
    expect(prompt).toContain("… (truncated)");
    expect(prompt).not.toContain("x".repeat(6001));
  });
});

describe("dedupeFindings", () => {
  it("removes duplicate path+line+body", () => {
    expect(dedupeFindings([mustFix, mustFix])).toEqual([mustFix]);
  });
});

describe("chooseEvent", () => {
  it("requests changes when any finding is must-fix", () => {
    expect(chooseEvent([mustFix, suggestion])).toBe("REQUEST_CHANGES");
  });

  it("comments when there are only suggestions", () => {
    expect(chooseEvent([suggestion])).toBe("COMMENT");
  });

  it("approves a clean pass with no findings", () => {
    expect(chooseEvent([])).toBe("APPROVE");
  });
});

describe("filterAlreadyRaised", () => {
  it("drops a finding already commented at the same path+line", () => {
    const result = filterAlreadyRaised(
      [mustFix, suggestion],
      [{ body: "anything", line: 12, path: "src/a.ts" }]
    );
    expect(result).toEqual([suggestion]);
  });

  it("drops a finding with matching path+text even if the line differs", () => {
    const result = filterAlreadyRaised(
      [mustFix],
      [{ body: "Null deref when list is empty.", line: 999, path: "src/a.ts" }]
    );
    expect(result).toEqual([]);
  });
});

describe("buildReview", () => {
  it("posts in-hunk comments and sets the verdict", () => {
    const review = buildReview({
      existing: [],
      findings: [mustFix, suggestion],
      hunksByPath,
    });
    expect(review.event).toBe("REQUEST_CHANGES");
    expect(review.comments).toHaveLength(2);
    expect(review.comments.find((c) => c.path === "src/a.ts")?.line).toBe(12);
  });

  it("snaps an out-of-hunk finding to the nearest boundary", () => {
    const review = buildReview({
      existing: [],
      findings: [{ ...mustFix, line: 50 }],
      hunksByPath,
    });
    expect(review.comments[0]?.line).toBe(20);
    expect(review.comments[0]?.body).toContain("nearest changed line");
  });

  it("folds findings with no matching hunks into the body", () => {
    const review = buildReview({
      existing: [],
      findings: [
        { body: "x", line: 1, path: "src/unknown.ts", severity: "suggestion" },
      ],
      hunksByPath,
    });
    expect(review.comments).toHaveLength(0);
    expect(review.body).toContain("src/unknown.ts:1");
  });

  it("skips findings already raised on the PR", () => {
    const review = buildReview({
      existing: [{ body: "x", line: 12, path: "src/a.ts" }],
      findings: [mustFix],
      hunksByPath,
    });
    expect(review.comments).toHaveLength(0);
    expect(review.body).toContain("No new issues");
  });
});
