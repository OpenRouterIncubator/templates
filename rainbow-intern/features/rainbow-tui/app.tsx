// The Ink rainbow chat UI container. The discoverable contribution entry lives
// in `feature.ts` (the only filename the feature loader scans for module
// exports); this sibling holds the stateful component that wires the runtime to
// the screen. In an interactive terminal the conversation renders as an Ink
// component, coloring each character of the assistant's streamed reply across a
// rainbow. The pure pieces live alongside: message rendering in `message.tsx`,
// keypress interpretation in `input.ts`, colors in `rainbow.ts`, runtime-event
// projection in `events.ts`, and the streaming turn driver in `turn.ts`; the
// non-TTY fallback lives in `piped.ts`.
import { Box, Text, useApp, useInput } from "ink";
import { useRef, useState } from "react";

import type { ChatRuntime } from "./events.ts";
import { interpretKey } from "./input.ts";
import type { Message } from "./message.tsx";
import { MessageView } from "./message.tsx";
import type { Run } from "./rainbow.ts";
import { runTurn } from "./turn.ts";

export const App = ({ chat }: { chat: ChatRuntime }) => {
  const { exit } = useApp();
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const idRef = useRef(0);
  // Streamed runs are appended into a mutable per-message buffer instead of
  // re-spreading the whole array on every delta (which is O(n^2) over a
  // per-character rainbow). The version counter is what tells React to
  // re-render after each in-place append.
  const [, setVersion] = useState(0);

  const nextId = (): number => {
    idRef.current += 1;
    return idRef.current;
  };

  const submit = (prompt: string): Promise<void> => {
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "user", text: prompt },
    ]);
    const assistantRuns: Run[] = [];
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "assistant", runs: assistantRuns },
    ]);
    // runTurn's try/catch/finally guarantees onDone fires (clearing busy) and
    // a rejecting stream surfaces as an [error] status line.
    return runTurn(chat, prompt, {
      onDone: () => setBusy(false),
      onRuns: (runs) => {
        assistantRuns.push(...runs);
        setVersion((version) => version + 1);
      },
      onStatus: (text) => {
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "status", text },
        ]);
      },
    });
  };

  useInput((char, key) => {
    const command = interpretKey(char, key, input, busy);
    if (command.kind === "exit") {
      exit();
      return;
    }
    if (command.kind === "ignore") {
      return;
    }
    if (command.kind === "submit") {
      setInput("");
      if (command.prompt.length > 0) {
        submit(command.prompt).catch(() => undefined);
      }
      return;
    }
    if (command.kind === "backspace") {
      setInput((prev) => prev.slice(0, -1));
      return;
    }
    setInput((prev) => prev + command.char);
  });

  return (
    <Box flexDirection="column">
      {messages.map((message) => (
        <MessageView key={message.id} message={message} />
      ))}
      {busy ? null : (
        <Box>
          <Text>{`> ${input}`}</Text>
        </Box>
      )}
    </Box>
  );
};
