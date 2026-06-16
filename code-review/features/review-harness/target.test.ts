import { describe, expect, it } from "bun:test";

import { parseTarget } from "./target.ts";

describe("parseTarget", () => {
  it("selects local review when there is no PR reference", () => {
    expect(parseTarget("review my staged changes")).toEqual({ mode: "local" });
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
