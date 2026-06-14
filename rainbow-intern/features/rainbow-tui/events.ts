// Typed view of the runtime's streamed events plus the pure helpers that
// project them into UI text. Shared by the Ink renderer (`app.tsx`) and the
// non-TTY piped fallback (`piped.ts`).

const ASSISTANT_TEXT_STREAM = "assistant_text";
const CONTENT_DELTA_EVENT = "content.delta";
const RUNTIME_ERROR_EVENT = "runtime.error";
const SESSION_ENDED_EVENT = "session.ended";
const TURN_COMPLETED_EVENT = "turn.completed";

export const EXIT_COMMAND = "/exit";

export interface AgentRuntimeEvent {
  readonly payload?: {
    readonly delta?: string;
    readonly error?: string;
    readonly message?: string;
    readonly ok?: boolean;
    readonly streamKind?: string;
  };
  readonly type: string;
}

export interface ChatRuntime {
  readonly sendMessage: (input: {
    readonly prompt: string;
  }) => AsyncIterable<AgentRuntimeEvent>;
}

// Pure: a status line for the events worth surfacing (runtime errors and failed
// turns/sessions), or undefined for everything else.
export const statusText = (event: AgentRuntimeEvent): string | undefined => {
  if (event.type === RUNTIME_ERROR_EVENT) {
    return `[runtime.error] ${event.payload?.message ?? "unknown runtime error"}`;
  }
  if (
    (event.type === TURN_COMPLETED_EVENT ||
      event.type === SESSION_ENDED_EVENT) &&
    event.payload?.ok === false
  ) {
    return `[${event.type}] ${event.payload.error ?? "harness failed"}`;
  }
  return;
};

export const isAssistantDelta = (event: AgentRuntimeEvent): boolean =>
  event.type === CONTENT_DELTA_EVENT &&
  event.payload?.streamKind === ASSISTANT_TEXT_STREAM;
