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

  it("renders a committable suggestion block on the exact changed line", () => {
    const submission = buildReviewSubmission(
      [ranked({ line: 3, path: "a.ts", suggestion: "const y = 3;" })],
      "REQUEST_CHANGES",
      hunks
    );
    expect(submission.comments[0]?.body).toContain(
      "```suggestion\nconst y = 3;\n```"
    );
  });

  it("omits the suggestion block when the comment snaps to a nearby line", () => {
    const submission = buildReviewSubmission(
      [ranked({ line: 99, path: "a.ts", suggestion: "const y = 3;" })],
      "COMMENT",
      hunks
    );
    // line 99 snaps to the hunk boundary (5), so a one-line suggestion would
    // replace the wrong code and must not be emitted.
    expect(submission.comments[0]?.line).toBe(5);
    expect(submission.comments[0]?.body).not.toContain("```suggestion");
  });

  it("skips findings already raised on the PR", () => {
    const submission = buildReviewSubmission(
      [ranked({ line: 3, path: "a.ts" })],
      "REQUEST_CHANGES",
      hunks,
      [{ body: "stale", line: 3, path: "a.ts" }]
    );
    expect(submission.comments).toHaveLength(0);
  });

  it("downgrades the event when every must-fix was already raised", () => {
    const submission = buildReviewSubmission(
      [ranked({ body: "issue", line: 3, path: "a.ts", severity: "must-fix" })],
      "REQUEST_CHANGES",
      hunks,
      [{ body: "issue", line: 3, path: "a.ts" }]
    );
    expect(submission.comments).toHaveLength(0);
    expect(submission.event).not.toBe("REQUEST_CHANGES");
    expect(submission.body).toContain("No blocking issues found");
  });

  it("filters a finding whose decorated comment snapped to a nearby line", () => {
    // The prior run posted this must-fix decorated by commentBody(): the
    // "**severity** — " prefix plus the "nearest changed line" note because it
    // snapped from line 99 to the hunk boundary (5). Dedup must still match it
    // against the raw finding body so it is not reposted.
    const submission = buildReviewSubmission(
      [ranked({ body: "off diff", line: 99, path: "a.ts" })],
      "REQUEST_CHANGES",
      hunks,
      [
        {
          body: "**must-fix** — off diff _(nearest changed line)_",
          line: 5,
          path: "a.ts",
        },
      ]
    );
    expect(submission.comments).toHaveLength(0);
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
