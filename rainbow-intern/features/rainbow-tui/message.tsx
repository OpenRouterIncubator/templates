// Presentational message components for the rainbow chat UI, split out of
// `app.tsx` so the container is left with just state and input wiring. Each
// message renders by role: assistant replies as per-character rainbow runs,
// status lines in yellow, and the user's own prompts dimmed. The `Message`
// shape lives here too since it is what these components consume.
import { Text } from "ink";

import type { Run } from "./rainbow.ts";
import { NEWLINE } from "./rainbow.ts";

type Role = "assistant" | "status" | "user";

export interface Message {
  readonly id: number;
  readonly role: Role;
  readonly runs?: readonly Run[];
  readonly text?: string;
}

const renderRun = (run: Run, index: number) => {
  if (run.text === NEWLINE) {
    return NEWLINE;
  }
  return (
    <Text color={run.color} key={index}>
      {run.text}
    </Text>
  );
};

const RunText = ({ runs }: { runs: readonly Run[] }) => (
  <Text>{runs.map(renderRun)}</Text>
);

export const MessageView = ({ message }: { message: Message }) => {
  if (message.role === "assistant") {
    return <RunText runs={message.runs ?? []} />;
  }
  if (message.role === "status") {
    return <Text color="yellow">{message.text}</Text>;
  }
  return <Text dimColor>{`> ${message.text ?? ""}`}</Text>;
};
