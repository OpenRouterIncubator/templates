import { describe, expect, it } from "bun:test";
import { colorize, colorRuns } from "./rainbow.ts";

describe("colorRuns (Ink)", () => {
  it("maps each visible char to a rainbow color and advances the offset", () => {
    const { offset, runs } = colorRuns("ab", 0);
    expect(offset).toBe(2);
    expect(runs).toEqual([
      { color: "red", text: "a" },
      { color: "yellow", text: "b" },
    ]);
  });

  it("emits newlines as empty-color runs without advancing the cycle", () => {
    const { offset, runs } = colorRuns("a\nb", 0);
    expect(offset).toBe(2);
    expect(runs[1]).toEqual({ color: "", text: "\n" });
  });

  it("cycles colors using the starting offset", () => {
    // Six colors, so offset 6 wraps back to the first (red).
    expect(colorRuns("x", 6).runs[0]?.color).toBe("red");
  });
});

describe("colorize (ANSI fallback)", () => {
  it("wraps visible chars in ansi codes and advances the offset", () => {
    const { offset, text } = colorize("ab", 0);
    expect(offset).toBe(2);
    expect(text).toContain("[31ma");
    expect(text).toContain("[33mb");
  });

  it("passes newlines through untouched", () => {
    expect(colorize("a\nb", 0).text).toContain("\n");
  });
});
