import { describe, expect, it } from "bun:test";
import type { Key } from "ink";

import { interpretKey } from "./input.ts";

// A blank Ink key with every flag false; tests flip only what they exercise.
const key = (overrides: Partial<Key> = {}): Key =>
  ({
    backspace: false,
    ctrl: false,
    delete: false,
    downArrow: false,
    escape: false,
    leftArrow: false,
    meta: false,
    pageDown: false,
    pageUp: false,
    return: false,
    rightArrow: false,
    shift: false,
    tab: false,
    upArrow: false,
    ...overrides,
  }) as Key;

describe("interpretKey", () => {
  it("exits on ctrl-c even while busy", () => {
    expect(interpretKey("c", key({ ctrl: true }), "draft", true)).toEqual({
      kind: "exit",
    });
  });

  it("ignores other keys while busy", () => {
    expect(interpretKey("x", key(), "draft", true)).toEqual({ kind: "ignore" });
  });

  it("submits the trimmed buffer on return", () => {
    expect(
      interpretKey("", key({ return: true }), "  hi there  ", false)
    ).toEqual({ kind: "submit", prompt: "hi there" });
  });

  it("exits when the buffer is the /exit command", () => {
    expect(interpretKey("", key({ return: true }), "/exit", false)).toEqual({
      kind: "exit",
    });
  });

  it("submits an empty prompt for a blank return (App skips it)", () => {
    expect(interpretKey("", key({ return: true }), "   ", false)).toEqual({
      kind: "submit",
      prompt: "",
    });
  });

  it("backspaces on backspace or delete", () => {
    expect(interpretKey("", key({ backspace: true }), "ab", false)).toEqual({
      kind: "backspace",
    });
    expect(interpretKey("", key({ delete: true }), "ab", false)).toEqual({
      kind: "backspace",
    });
  });

  it("appends a typed character", () => {
    expect(interpretKey("z", key(), "ab", false)).toEqual({
      kind: "append",
      char: "z",
    });
  });

  it("ignores SGR mouse press events", () => {
    // \x1b[<0;10;20M after Ink strips the ESC prefix
    expect(interpretKey("[<0;10;20M", key(), "ab", false)).toEqual({
      kind: "ignore",
    });
  });

  it("ignores SGR mouse release events", () => {
    // \x1b[<0;10;20m after Ink strips the ESC prefix
    expect(interpretKey("[<0;10;20m", key(), "ab", false)).toEqual({
      kind: "ignore",
    });
  });

  it("ignores SGR mouse scroll events", () => {
    // \x1b[<64;10;20M after Ink strips the ESC prefix
    expect(interpretKey("[<64;10;20M", key(), "ab", false)).toEqual({
      kind: "ignore",
    });
  });

  it("ignores X10 mouse events", () => {
    // \x1b[M followed by 3 data bytes, after Ink strips the ESC prefix
    expect(interpretKey("[M \x20!", key(), "ab", false)).toEqual({
      kind: "ignore",
    });
  });

  it("ignores mouse events even while busy", () => {
    expect(interpretKey("[<0;10;20M", key(), "ab", true)).toEqual({
      kind: "ignore",
    });
  });

  it("still appends a literal '[' character", () => {
    expect(interpretKey("[", key(), "ab", false)).toEqual({
      kind: "append",
      char: "[",
    });
  });
});
