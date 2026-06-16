import { describe, expect, it } from "bun:test";

import { EVENT, ITEM_STATUS, STREAM } from "./contract.ts";
import {
  DIMENSION_ITEM,
  FINDING_ITEM,
  type PipelineEvent,
  toRuntimeEvent,
} from "./events.ts";

describe("toRuntimeEvent", () => {
  it("maps status to a reasoning content delta", () => {
    const event = toRuntimeEvent({ kind: "status", text: "Reviewing…" });
    expect(event).toMatchObject({
      payload: { delta: "Reviewing…\n", streamKind: STREAM.Reasoning },
      type: EVENT.ContentDelta,
    });
  });

  it("maps the report to an assistant content delta", () => {
    const event = toRuntimeEvent({
      kind: "report",
      markdown: "## Code review",
    });
    expect(event).toMatchObject({
      payload: { delta: "## Code review", streamKind: STREAM.Assistant },
      type: EVENT.ContentDelta,
    });
  });

  it("opens a dimension as an in-progress item", () => {
    const event = toRuntimeEvent({
      kind: "dimension-start",
      title: "Security",
    });
    expect(event).toMatchObject({
      payload: {
        itemType: DIMENSION_ITEM,
        status: ITEM_STATUS.InProgress,
        title: "Security",
      },
      type: EVENT.ItemStarted,
    });
  });

  it("renders a must-fix finding as a failed item carrying structured data", () => {
    const event = toRuntimeEvent({
      finding: {
        body: "Null deref",
        confidence: 1,
        dimensions: ["correctness"],
        line: 12,
        models: ["m1", "m2"],
        path: "a.ts",
        severity: "must-fix",
        votes: 2,
      },
      kind: "finding",
    });
    expect(event.type).toBe(EVENT.ItemCompleted);
    expect(event).toMatchObject({
      payload: {
        data: {
          confidence: 1,
          line: 12,
          path: "a.ts",
          severity: "must-fix",
          votes: 2,
        },
        itemType: FINDING_ITEM,
        status: ITEM_STATUS.Failed,
        title: "[must-fix] a.ts:12",
      },
    });
  });

  it("maps tool and terminal events", () => {
    expect(toRuntimeEvent({ kind: "tool-start", name: "model:x" }).type).toBe(
      EVENT.ToolStarted
    );
    expect(
      toRuntimeEvent({
        isError: true,
        kind: "tool-done",
        name: "model:x",
        result: {},
      })
    ).toMatchObject({
      payload: { isError: true },
      type: EVENT.ToolCompleted,
    });
    expect(toRuntimeEvent({ kind: "error", message: "boom" })).toMatchObject({
      payload: { message: "boom" },
      type: EVENT.RuntimeError,
    });
    expect(toRuntimeEvent({ kind: "ended", ok: true })).toMatchObject({
      payload: { ok: true },
      type: EVENT.SessionEnded,
    });
  });

  it("covers every pipeline event kind", () => {
    const kinds: PipelineEvent["kind"][] = [
      "status",
      "tool-start",
      "tool-done",
      "dimension-start",
      "dimension-done",
      "finding",
      "report",
      "error",
      "ended",
    ];
    expect(new Set(kinds).size).toBe(9);
  });
});
