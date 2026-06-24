import { describe, expect, it } from "bun:test";

import {
  getPreferences,
  parsePostingPreference,
  setPreferences,
} from "./preferences.ts";

describe("parsePostingPreference", () => {
  it("detects disabling instructions", () => {
    for (const prompt of [
      "don't post comments by default",
      "stop posting",
      "keep reviews report-only",
      "no auto-post",
    ]) {
      expect(parsePostingPreference(prompt)).toBe(false);
    }
  });

  it("detects enabling instructions", () => {
    for (const prompt of [
      "post by default",
      "auto-post reviews",
      "always post comments",
      "resume posting",
    ]) {
      expect(parsePostingPreference(prompt)).toBe(true);
    }
  });

  it("returns null for unrelated prompts", () => {
    expect(parsePostingPreference("how do I write a test?")).toBeNull();
  });
});

describe("get/setPreferences", () => {
  it("persists per session and defaults to autopost", () => {
    expect(getPreferences("s1").autopost).toBe(true);
    setPreferences("s1", { autopost: false });
    expect(getPreferences("s1").autopost).toBe(false);
    // A different session is unaffected.
    expect(getPreferences("s2").autopost).toBe(true);
  });
});
