import { describe, expect, it } from "bun:test";

import { parseSseLine } from "./chat.ts";

describe("parseSseLine", () => {
  it("extracts a content delta", () => {
    expect(
      parseSseLine('data: {"choices":[{"delta":{"content":"hi"}}]}')
    ).toEqual({ kind: "delta", text: "hi" });
  });

  it("recognizes the done sentinel", () => {
    expect(parseSseLine("data: [DONE]")).toEqual({ kind: "done" });
  });

  it("skips keepalives, empty deltas, and malformed JSON", () => {
    expect(parseSseLine(": keepalive")).toEqual({ kind: "skip" });
    expect(parseSseLine('data: {"choices":[{"delta":{}}]}')).toEqual({
      kind: "skip",
    });
    expect(parseSseLine("data: not json")).toEqual({ kind: "skip" });
  });
});
