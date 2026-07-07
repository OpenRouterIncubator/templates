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
        payload: { error: "harness failed" },
        type: "turn.failed",
      })
    ).toBe("[turn.failed] harness failed");
    expect(
      statusText({
        payload: { error: "session died" },
        type: "session.failed",
      })
    ).toBe("[session.failed] session died");
  });

  it("returns undefined for normal content deltas", () => {
    expect(
      statusText({ payload: { delta: "hi" }, type: "assistant.text.delta" })
    ).toBeUndefined();
    expect(statusText({ payload: {}, type: "turn.succeeded" })).toBeUndefined();
  });
});

describe("isAssistantDelta", () => {
  it("accepts assistant text deltas", () => {
    expect(
      isAssistantDelta({
        payload: { delta: "hi" },
        type: "assistant.text.delta",
      })
    ).toBe(true);
  });

  it("rejects other streamed content and other event types", () => {
    expect(
      isAssistantDelta({
        payload: { delta: "hi" },
        type: "reasoning.delta",
      })
    ).toBe(false);
    expect(
      isAssistantDelta({
        payload: { delta: "hi" },
        type: "content.delta",
      })
    ).toBe(false);
    expect(isAssistantDelta({ type: "turn.succeeded" })).toBe(false);
  });
});
