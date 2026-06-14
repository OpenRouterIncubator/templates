import { describe, expect, it } from "bun:test";
import {
  classify,
  formatReport,
  type PullSummary,
  parsePatrolArgs,
} from "./patrol.ts";

const NOW = new Date("2026-02-01T00:00:00Z");

function pull(overrides: Partial<PullSummary>): PullSummary {
  return {
    draft: false,
    htmlUrl: "https://github.com/acme/x/pull/1",
    mergeableState: "clean",
    number: 1,
    title: "A PR",
    updatedAt: "2026-01-31T00:00:00Z",
    ...overrides,
  };
}

describe("parsePatrolArgs", () => {
  it("parses repo and stale-days with a default window", () => {
    expect(parsePatrolArgs(["--repo", "acme/x"])).toEqual({
      repo: "acme/x",
      staleDays: 7,
    });
    expect(
      parsePatrolArgs(["--repo", "acme/x", "--stale-days", "3"]).staleDays
    ).toBe(3);
  });
});

describe("classify", () => {
  it("flags conflicts, rebase, blocked, and failing checks by mergeable state", () => {
    expect(classify(pull({ mergeableState: "dirty" }), 7, NOW)).toContain(
      "merge conflicts"
    );
    expect(classify(pull({ mergeableState: "behind" }), 7, NOW)[0]).toContain(
      "rebase"
    );
    expect(classify(pull({ mergeableState: "blocked" }), 7, NOW)[0]).toContain(
      "blocked"
    );
    expect(classify(pull({ mergeableState: "unstable" }), 7, NOW)[0]).toContain(
      "failing checks"
    );
  });

  it("flags drafts and stale PRs", () => {
    expect(classify(pull({ draft: true }), 7, NOW)).toContain("draft");
    const stale = classify(pull({ updatedAt: "2026-01-01T00:00:00Z" }), 7, NOW);
    expect(stale.some((n) => n.startsWith("stale"))).toBe(true);
  });

  it("returns nothing for a clean, recent, non-draft PR", () => {
    expect(classify(pull({}), 7, NOW)).toEqual([]);
  });
});

describe("formatReport", () => {
  it("says all clear when nothing needs attention", () => {
    expect(formatReport([])).toContain("no open PRs need attention");
  });

  it("lists each PR with its needs", () => {
    const report = formatReport([
      { needs: ["merge conflicts"], pull: pull({ number: 42 }) },
    ]);
    expect(report).toContain("#42");
    expect(report).toContain("needs: merge conflicts");
  });
});
