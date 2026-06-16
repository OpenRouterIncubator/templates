import { describe, expect, it } from "bun:test";

import { parseTarget } from "./target.ts";

describe("parseTarget", () => {
  it("selects local review when there is no PR reference", () => {
    expect(parseTarget("review my staged changes")).toEqual({ mode: "local" });
  });

  it("finds a PR reference embedded in a sentence", () => {
    const target = parseTarget("please review owner/repo#15 carefully");
    expect(target).toMatchObject({ mode: "pr", post: false });
  });

  it("treats a 'post' cue as explicit opt-in to write the review", () => {
    const target = parseTarget("review owner/repo#15 and post it");
    expect(target).toMatchObject({ mode: "pr", post: true });
  });
});
