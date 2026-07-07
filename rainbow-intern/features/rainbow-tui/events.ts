// Typed view of the runtime's streamed events plus the pure helpers that
// project them into UI text. Shared by the Ink renderer (`app.tsx`) and the
// non-TTY piped fallback (`piped.ts`).
//
// The runtime emits a normalized event vocabulary discriminated on `type`
// (see the harness capability): assistant prose arrives as
// `assistant.text.delta` events, turn/session outcomes are the
// `turn.succeeded`/`turn.failed` and `session.succeeded`/`session.failed`
// pairs (failures carry an `error` string), and diagnostics are
// `runtime.warning`/`runtime.error` (carrying a `message`). Consumers switch
// on the tag and never read an `ok`/`isError` boolean.

const ASSISTANT_TEXT_DELTA_EVENT = "assistant.text.delta";
const RUNTIME_ERROR_EVENT = "runtime.error";
const SESSION_FAILED_EVENT = "session.failed";
const TURN_FAILED_EVENT = "turn.failed";

export const EXIT_COMMAND = "/exit";

export interface AgentRuntimeEvent {
  readonly payload?: {
    readonly delta?: string;
    readonly error?: string;
    readonly message?: string;
  };
  readonly type: string;
}

export interface ChatRuntime {
  readonly sendMessage: (input: {
    readonly prompt: string;
  }) => AsyncIterable<AgentRuntimeEvent>;
}

// Pure: a status line for the events worth surfacing (runtime errors and failed
// turns/sessions), or undefined for everything else. Outcome is discriminated
// on the event `type`, so failures are the `*.failed` variants — never an
// `ok` boolean.
export const statusText = (event: AgentRuntimeEvent): string | undefined => {
  if (event.type === RUNTIME_ERROR_EVENT) {
    return `[runtime.error] ${event.payload?.message ?? "unknown runtime error"}`;
  }
  if (event.type === TURN_FAILED_EVENT || event.type === SESSION_FAILED_EVENT) {
    return `[${event.type}] ${event.payload?.error ?? "harness failed"}`;
  }
  return;
};

// Assistant prose is its own event type now (`assistant.text.delta`); there is
// no `streamKind` to filter on, so the check is a plain type match.
export const isAssistantDelta = (event: AgentRuntimeEvent): boolean =>
  event.type === ASSISTANT_TEXT_DELTA_EVENT;
