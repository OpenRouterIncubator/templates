import { describe, expect, it } from "bun:test";
import { parsePullRequestRef } from "./pr-ref.ts";

describe("parsePullRequestRef", () => {
  it("parses the owner/repo#number short form", () => {
    expect(parsePullRequestRef("acme/widgets#42")).toEqual({
      number: 42,
      owner: "acme",
      repo: "widgets",
    });
  });

  it("parses a full GitHub PR URL", () => {
    expect(
      parsePullRequestRef("https://github.com/acme/widgets/pull/7")
    ).toEqual({ number: 7, owner: "acme", repo: "widgets" });
  });

  it("trims surrounding whitespace", () => {
    expect(parsePullRequestRef("  acme/widgets#1  ")?.number).toBe(1);
  });

  it("returns null for unrecognized input", () => {
    expect(parsePullRequestRef("not a pr")).toBeNull();
    expect(parsePullRequestRef("")).toBeNull();
  });
});
