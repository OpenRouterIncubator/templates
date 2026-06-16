import { describe, expect, it } from "bun:test";

import type { Hunk } from "./diff.ts";
import type { RankedFinding } from "./findings.ts";
import { buildReport, buildReviewSubmission } from "./report.ts";

const ranked = (overrides: Partial<RankedFinding>): RankedFinding => ({
  body: "issue",
  confidence: 1,
  dimensions: ["correctness"],
  line: 3,
  models: ["m1", "m2"],
  path: "a.ts",
  severity: "must-fix",
  votes: 2,
  ...overrides,
});

describe("buildReviewSubmission", () => {
  const hunks = new Map<string, readonly Hunk[]>([
    ["a.ts", [{ newEnd: 5, newStart: 1 }]],
  ]);

  it("posts in-hunk findings as inline comments and folds the rest into the body", () => {
    const submission = buildReviewSubmission(
      [
        ranked({ line: 3, path: "a.ts" }),
        ranked({ body: "off diff", line: 99, path: "b.ts" }),
      ],
      "REQUEST_CHANGES",
      hunks
    );
    expect(submission.event).toBe("REQUEST_CHANGES");
    expect(submission.comments).toHaveLength(1);
    expect(submission.comments[0]).toMatchObject({
      line: 3,
      path: "a.ts",
      side: "RIGHT",
    });
    expect(submission.body).toContain("b.ts:99");
  });
});

describe("buildReport", () => {
  it("summarizes the verdict and lists confirmed findings", () => {
    const report = buildReport({
      confirmed: [ranked({ body: "Null deref", line: 7 })],
      demotedCount: 2,
      files: [
        {
          additions: 1,
          deletions: 0,
          filename: "a.ts",
          patch: "@@",
          status: "modified",
        },
      ],
      models: ["m1", "m2"],
      title: "local working changes",
      verdict: "REQUEST_CHANGES",
    });
    expect(report).toContain("changes requested");
    expect(report).toContain("1 must-fix");
    expect(report).toContain("low-confidence demoted");
    expect(report).toContain("`a.ts:7` — Null deref");
  });

  it("states clearly when nothing is found", () => {
    const report = buildReport({
      confirmed: [],
      demotedCount: 0,
      files: [],
      models: ["m1"],
      title: "local working changes",
      verdict: "APPROVE",
    });
    expect(report).toContain("No blocking issues found");
  });
});
