import { describe, expect, it } from "bun:test";
import { isAssistantDelta, statusText } from "./events.ts";

describe("statusText", () => {
  it("formats runtime errors", () => {
    expect(
      statusText({ payload: { message: "boom" }, type: "runtime.error" })
    ).toBe("[runtime.error] boom");
  });

  it("formats failed turns and sessions", () => {
    expect(
      statusText({
        payload: { error: "harness failed", ok: false },
        type: "turn.completed",
      })
    ).toBe("[turn.completed] harness failed");
  });

  it("returns undefined for normal content deltas", () => {
    expect(
      statusText({
        payload: { delta: "hi", streamKind: "assistant_text" },
        type: "content.delta",
      })
    ).toBeUndefined();
  });
});

describe("isAssistantDelta", () => {
  it("accepts assistant text deltas", () => {
    expect(
      isAssistantDelta({
        payload: { delta: "hi", streamKind: "assistant_text" },
        type: "content.delta",
      })
    ).toBe(true);
  });

  it("rejects deltas from other streams and other event types", () => {
    expect(
      isAssistantDelta({
        payload: { delta: "hi", streamKind: "tool_output" },
        type: "content.delta",
      })
    ).toBe(false);
    expect(isAssistantDelta({ type: "turn.completed" })).toBe(false);
  });
});
