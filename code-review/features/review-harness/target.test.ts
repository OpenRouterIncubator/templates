import { describe, expect, it } from "bun:test";

import { parseTarget } from "./target.ts";

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

  it("posts by default for a PR reference", () => {
    const target = parseTarget("please review owner/repo#15 carefully");
    expect(target).toMatchObject({ mode: "pr", post: true });
  });

  it("honors an opt-out cue to keep the review report-only", () => {
    for (const cue of ["dry run", "no post", "don't post", "preview"]) {
      expect(parseTarget(`review owner/repo#15 ${cue}`)).toMatchObject({
        mode: "pr",
        post: false,
      });
    }
  });
});
