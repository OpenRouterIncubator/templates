import { describe, expect, it } from "bun:test";
import type { AgentRuntimeEvent, ChatRuntime } from "./events.ts";
import type { Run } from "./rainbow.ts";
import type { TurnHandlers } from "./turn.ts";
import { runTurn } from "./turn.ts";

const delta = (text: string): AgentRuntimeEvent => ({
  payload: { delta: text, streamKind: "assistant_text" },
  type: "content.delta",
});

const chatYielding = (
  ...events: readonly AgentRuntimeEvent[]
): ChatRuntime => ({
  async *sendMessage() {
    for (const event of events) {
      yield await Promise.resolve(event);
    }
  },
});

interface Recorded {
  readonly doneCount: () => number;
  readonly handlers: TurnHandlers;
  readonly runs: Run[];
  readonly statuses: string[];
}

const record = (): Recorded => {
  let done = 0;
  const runs: Run[] = [];
  const statuses: string[] = [];
  return {
    doneCount: () => done,
    handlers: {
      onDone: () => {
        done += 1;
      },
      onRuns: (next) => {
        runs.push(...next);
      },
      onStatus: (text) => {
        statuses.push(text);
      },
    },
    runs,
    statuses,
  };
};

describe("runTurn", () => {
  it("projects deltas into runs with a continuous rainbow offset", async () => {
    const recorded = record();
    await runTurn(
      chatYielding(delta("ab"), delta("c")),
      "hi",
      recorded.handlers
    );
    expect(recorded.runs.map((run) => run.text).join("")).toBe("abc");
    expect(new Set(recorded.runs.map((run) => run.color)).size).toBe(3);
    expect(recorded.doneCount()).toBe(1);
    expect(recorded.statuses).toEqual([]);
  });

  it("surfaces status events", async () => {
    const recorded = record();
    await runTurn(
      chatYielding({ payload: { message: "boom" }, type: "runtime.error" }),
      "hi",
      recorded.handlers
    );
    expect(recorded.statuses).toEqual(["[runtime.error] boom"]);
    expect(recorded.doneCount()).toBe(1);
  });

  it("turns a rejecting stream into an [error] status and still completes", async () => {
    const recorded = record();
    const chat: ChatRuntime = {
      async *sendMessage() {
        yield await Promise.resolve(delta("par"));
        throw new Error("stream dropped");
      },
    };
    await runTurn(chat, "hi", recorded.handlers);
    expect(recorded.runs.map((run) => run.text).join("")).toBe("par");
    expect(recorded.statuses).toEqual(["[error] stream dropped"]);
    expect(recorded.doneCount()).toBe(1);
  });

  it("completes even when the stream fails before yielding", async () => {
    const recorded = record();
    const failing: ChatRuntime = {
      sendMessage: () => ({
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.reject(new Error("wires crossed")),
        }),
      }),
    };
    await runTurn(failing, "hi", recorded.handlers);
    expect(recorded.statuses).toEqual(["[error] wires crossed"]);
    expect(recorded.doneCount()).toBe(1);
  });
});
