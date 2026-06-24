import { describe, expect, it } from "bun:test";

import { parseTarget, resolvePostDecision } from "./target.ts";

describe("parseTarget", () => {
  it("reviews the local diff when the prompt opens with a review verb", () => {
    expect(parseTarget("review my staged changes")).toEqual({ mode: "local" });
    expect(parseTarget("audit this function")).toEqual({ mode: "local" });
  });

  it("treats a non-review prompt as a chat turn", () => {
    expect(parseTarget("how should I structure this module?")).toEqual({
      mode: "chat",
    });
    expect(parseTarget("what does this regex do?")).toEqual({ mode: "chat" });
  });

  it("selects PR mode for a PR reference", () => {
    expect(parseTarget("please review owner/repo#15 carefully")).toMatchObject({
      mode: "pr",
      ref: { number: 15, owner: "owner", repo: "repo" },
    });
  });

  it("selects PR mode when the ref carries trailing or wrapping punctuation", () => {
    for (const prompt of [
      "please review owner/repo#15, then ship",
      "please review owner/repo#15.",
      "please review owner/repo#15; thanks",
      "please review (owner/repo#15)",
    ]) {
      expect(parseTarget(prompt)).toMatchObject({
        mode: "pr",
        ref: { number: 15, owner: "owner", repo: "repo" },
      });
    }
  });
});

describe("resolvePostDecision", () => {
  it("follows the session default when there is no cue", () => {
    expect(resolvePostDecision("review owner/repo#15", true)).toBe(true);
    expect(resolvePostDecision("review owner/repo#15", false)).toBe(false);
  });

  it("lets an opt-out cue override a posting default", () => {
    for (const cue of ["dry run", "no post", "don't post", "preview"]) {
      expect(resolvePostDecision(`review owner/repo#15 ${cue}`, true)).toBe(
        false
      );
    }
  });

  it("lets an explicit post cue override a report-only default", () => {
    expect(resolvePostDecision("review owner/repo#15 and post it", false)).toBe(
      true
    );
  });
});
