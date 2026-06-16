import { describe, expect, it } from "bun:test";

import { parsePullRequestRef } from "./pr-ref.ts";

describe("parsePullRequestRef", () => {
  it("parses the short owner/repo#N form", () => {
    expect(parsePullRequestRef("OpenRouterIncubator/templates#42")).toEqual({
      number: 42,
      owner: "OpenRouterIncubator",
      repo: "templates",
    });
  });

  it("parses a GitHub PR URL", () => {
    expect(parsePullRequestRef("https://github.com/owner/repo/pull/7")).toEqual(
      {
        number: 7,
        owner: "owner",
        repo: "repo",
      }
    );
  });

  it("rejects non-references", () => {
    expect(parsePullRequestRef("review my changes")).toBeNull();
    expect(parsePullRequestRef("owner/repo")).toBeNull();
  });
});
