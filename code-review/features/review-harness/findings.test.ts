import { describe, expect, it } from "bun:test";

import {
  aggregateFindings,
  type Candidate,
  chooseVerdict,
  type Finding,
  parseFindings,
} from "./findings.ts";

const suggestionA = (model: string, dimension: string): Candidate => ({
  dimension,
  finding: {
    body: "Prefer a guard clause here",
    line: 1,
    path: "a.ts",
    severity: "suggestion",
  },
  model,
});

describe("parseFindings", () => {
  it("reads the findings array and drops malformed entries", () => {
    const json = JSON.stringify({
      findings: [
        { body: "real", line: 4, path: "x.ts", severity: "must-fix" },
        { body: "no line", path: "x.ts", severity: "suggestion" },
        { line: 2, path: "x.ts", severity: "suggestion" },
        "garbage",
      ],
    });
    const findings = parseFindings(json);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      line: 4,
      path: "x.ts",
      severity: "must-fix",
    });
  });

  it("defaults unknown severity to suggestion and accepts a bare array", () => {
    const findings = parseFindings(
      '[{"body":"b","line":1,"path":"p","severity":"weird"}]'
    );
    expect(findings[0]?.severity).toBe("suggestion");
  });

  it("returns nothing for non-JSON", () => {
    expect(parseFindings("not json")).toEqual([]);
  });
});

describe("aggregateFindings", () => {
  it("confirms a suggestion only when a majority of models agree", () => {
    const twoVotes = aggregateFindings(
      [suggestionA("m1", "correctness"), suggestionA("m2", "security")],
      2
    );
    expect(twoVotes.confirmed).toHaveLength(1);
    expect(twoVotes.confirmed[0]).toMatchObject({ confidence: 1, votes: 2 });
    expect(twoVotes.confirmed[0]?.dimensions).toContain("correctness");

    const oneVote = aggregateFindings([suggestionA("m1", "correctness")], 2);
    expect(oneVote.confirmed).toHaveLength(0);
    expect(oneVote.demoted).toHaveLength(1);
    expect(oneVote.demoted[0]?.confidence).toBe(0.5);
  });

  it("confirms a single-vote must-fix and ranks it ahead of suggestions", () => {
    const mustFix: Candidate = {
      dimension: "security",
      finding: {
        body: "Committed secret",
        line: 9,
        path: "c.ts",
        severity: "must-fix",
      },
      model: "m1",
    };
    const result = aggregateFindings(
      [suggestionA("m1", "x"), suggestionA("m2", "y"), mustFix],
      2
    );
    expect(result.confirmed.map((finding) => finding.severity)).toEqual([
      "must-fix",
      "suggestion",
    ]);
  });

  it("takes every finding at face value with a single model", () => {
    const result = aggregateFindings([suggestionA("solo", "correctness")], 1);
    expect(result.confirmed).toHaveLength(1);
  });
});

describe("chooseVerdict", () => {
  const ranked = (severity: Finding["severity"]) => ({
    body: "b",
    confidence: 1,
    dimensions: ["x"],
    line: 1,
    models: ["m1"],
    path: "p",
    severity,
    votes: 1,
  });

  it("requests changes when any must-fix is confirmed", () => {
    expect(chooseVerdict([ranked("must-fix")])).toBe("REQUEST_CHANGES");
  });

  it("comments on suggestions and approves an empty review", () => {
    expect(chooseVerdict([ranked("suggestion")])).toBe("COMMENT");
    expect(chooseVerdict([])).toBe("APPROVE");
  });
});
