// Drives a single prompt turn against the chat runtime, projecting streamed
// events into rainbow runs and status lines. The try/catch/finally contract is
// the point: a rejecting stream surfaces as an `[error]` status line instead
// of an unhandled rejection, and `onDone` always fires so callers can clear
// their busy state no matter how the stream ends.
import type { AgentRuntimeEvent, ChatRuntime } from "./events.ts";
import { isAssistantDelta, statusText } from "./events.ts";
import type { Run } from "./rainbow.ts";
import { colorRuns } from "./rainbow.ts";

export interface TurnHandlers {
  readonly onDone: () => void;
  readonly onRuns: (runs: readonly Run[]) => void;
  readonly onStatus: (text: string) => void;
}

const errorStatus = (error: unknown): string =>
  `[error] ${error instanceof Error ? error.message : String(error)}`;

export const runTurn = async (
  chat: ChatRuntime,
  prompt: string,
  handlers: TurnHandlers
): Promise<void> => {
  let offset = 0;
  const handleEvent = (event: AgentRuntimeEvent): void => {
    if (isAssistantDelta(event)) {
      const result = colorRuns(event.payload?.delta ?? "", offset);
      offset = result.offset;
      handlers.onRuns(result.runs);
      return;
    }
    const status = statusText(event);
    if (status !== undefined) {
      handlers.onStatus(status);
    }
  };
  try {
    for await (const event of chat.sendMessage({ prompt })) {
      handleEvent(event);
    }
  } catch (error) {
    handlers.onStatus(errorStatus(error));
  } finally {
    handlers.onDone();
  }
};
