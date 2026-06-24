import { describe, expect, it } from "bun:test";

import {
  initialState,
  type RuntimeEvent,
  reduce,
  reduceAll,
  renderPlain,
  severityColor,
} from "./view.ts";

const SEQUENCE: readonly RuntimeEvent[] = [
  {
    payload: { itemType: "review-dimension", title: "Security" },
    type: "item.started",
  },
  {
    payload: {
      detail: "2 candidate finding(s)",
      itemType: "review-dimension",
      title: "Security",
    },
    type: "item.completed",
  },
  {
    payload: {
      data: { severity: "must-fix" },
      detail: "Null deref",
      itemType: "review-finding",
      title: "[must-fix] a.ts:3",
    },
    type: "item.completed",
  },
  {
    payload: { delta: "Reviewing…", streamKind: "reasoning_text" },
    type: "content.delta",
  },
  {
    payload: { delta: "## Code review", streamKind: "assistant_text" },
    type: "content.delta",
  },
  { payload: { ok: true }, type: "session.ended" },
];

describe("reduce", () => {
  it("folds a full review stream into a view-model", () => {
    const state = reduceAll(SEQUENCE);
    expect(state.dimensions).toEqual([
      { detail: "2 candidate finding(s)", status: "done", title: "Security" },
    ]);
    expect(state.findings).toEqual([
      { body: "Null deref", severity: "must-fix", title: "[must-fix] a.ts:3" },
    ]);
    expect(state.report).toBe("## Code review");
    expect(state.status).toBe("Reviewing…");
    expect(state.done).toBe(true);
    expect(state.error).toBeUndefined();
  });

  it("updates a dimension in place rather than duplicating it", () => {
    const started = reduce(initialState, SEQUENCE[0] as RuntimeEvent);
    const completed = reduce(started, SEQUENCE[1] as RuntimeEvent);
    expect(completed.dimensions).toHaveLength(1);
    expect(completed.dimensions[0]?.status).toBe("done");
  });

  it("derives finding severity from title when data is absent", () => {
    const state = reduce(initialState, {
      payload: {
        detail: "weak test",
        itemType: "review-finding",
        title: "[suggestion] t.ts:1",
      },
      type: "item.completed",
    });
    expect(state.findings[0]?.severity).toBe("suggestion");
  });

  it("surfaces a failed session as an error", () => {
    const state = reduce(initialState, {
      payload: { error: "no api key", ok: false },
      type: "session.ended",
    });
    expect(state.done).toBe(true);
    expect(state.error).toBe("no api key");
  });

  it("ignores empty reasoning deltas", () => {
    const withStatus = reduce(initialState, {
      payload: { delta: "first", streamKind: "reasoning_text" },
      type: "content.delta",
    });
    const after = reduce(withStatus, {
      payload: { delta: "   ", streamKind: "reasoning_text" },
      type: "content.delta",
    });
    expect(after.status).toBe("first");
  });
});

describe("severityColor", () => {
  it("colors must-fix red and suggestions yellow", () => {
    expect(severityColor("must-fix")).toBe("red");
    expect(severityColor("suggestion")).toBe("yellow");
  });
});

describe("renderPlain", () => {
  it("renders findings, an error, and the report as plain text", () => {
    const text = renderPlain({
      dimensions: [],
      done: true,
      error: "boom",
      findings: [
        { body: "fix it", severity: "must-fix", title: "[must-fix] a.ts:1" },
      ],
      report: "## done",
      status: undefined,
    });
    expect(text).toContain("! [must-fix] a.ts:1");
    expect(text).toContain("error: boom");
    expect(text).toContain("## done");
  });
});
