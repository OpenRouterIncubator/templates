// The Ink JSX for the review TUI. All testable logic lives in the sibling
// `view.ts` (the pure view-model); this file only paints it and owns the
// terminal I/O, so it is intentionally not imported by any test. It renders the
// stream as a checklist of dimensions, color-coded findings, and the verdict;
// under a non-TTY harness `runPiped` streams the same content as plain text.
import { stdin, stdout } from "node:process";
import { Box, Text, useApp, useInput } from "ink";
import { useState } from "react";

import {
  type ChatRuntime,
  type DimensionRow,
  EXIT_COMMAND,
  type FindingRow,
  initialState,
  LINE_BREAK,
  type ReviewState,
  reduce,
  renderPlain,
  severityColor,
} from "./view.ts";

const DimensionView = ({ row }: { row: DimensionRow }) => {
  const icon = row.status === "done" ? "✓" : "…";
  const color = row.status === "done" ? "green" : "gray";
  return (
    <Text color={color}>
      {`  ${icon} ${row.title}`}
      {row.detail !== undefined && row.status === "done" ? (
        <Text dimColor>{` — ${row.detail}`}</Text>
      ) : null}
    </Text>
  );
};

const FindingView = ({ row }: { row: FindingRow }) => (
  <Box flexDirection="column">
    <Text color={severityColor(row.severity)}>{`  • ${row.title}`}</Text>
    <Text dimColor>{`    ${row.body}`}</Text>
  </Box>
);

const ReviewView = ({ state }: { state: ReviewState }) => (
  <Box flexDirection="column">
    {state.dimensions.length > 0 ? <Text bold>Dimensions</Text> : null}
    {state.dimensions.map((row) => (
      <DimensionView key={row.title} row={row} />
    ))}
    {state.findings.length > 0 ? (
      <Text bold>{`Findings (${state.findings.length})`}</Text>
    ) : null}
    {state.findings.map((row) => (
      <FindingView key={row.title} row={row} />
    ))}
    {state.report.length > 0 ? <Text>{state.report}</Text> : null}
    {state.error === undefined ? null : (
      <Text color="red">{`✗ ${state.error}`}</Text>
    )}
    {state.status !== undefined && !state.done ? (
      <Text dimColor>{state.status}</Text>
    ) : null}
  </Box>
);

export const App = ({ chat }: { chat: ChatRuntime }) => {
  const { exit } = useApp();
  const [history, setHistory] = useState<readonly ReviewState[]>([]);
  const [active, setActive] = useState<ReviewState | undefined>(undefined);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (prompt: string): Promise<void> => {
    setBusy(true);
    let state = initialState;
    setActive(state);
    for await (const event of chat.sendMessage({ prompt })) {
      state = reduce(state, event);
      setActive(state);
    }
    // The stream closing IS the end of the turn — Ori may not deliver a
    // session.ended to the chat, so finalize here to clear the status line.
    setHistory((prev) => [...prev, { ...state, done: true }]);
    setActive(undefined);
    setBusy(false);
  };

  useInput((char, key) => {
    if (busy) {
      return;
    }
    if (key.ctrl && char === "c") {
      exit();
      return;
    }
    if (key.return) {
      const prompt = input.trim();
      setInput("");
      if (prompt === EXIT_COMMAND) {
        exit();
        return;
      }
      if (prompt.length > 0) {
        submit(prompt).catch(() => undefined);
      }
      return;
    }
    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }
    setInput((prev) => prev + char);
  });

  return (
    <Box flexDirection="column">
      {history.map((state, index) => (
        <ReviewView key={index} state={state} />
      ))}
      {active === undefined ? null : <ReviewView state={active} />}
      {busy ? <Text dimColor>reviewing…</Text> : <Text>{`> ${input}`}</Text>}
    </Box>
  );
};

// Non-TTY fallback: read piped prompts and stream a plain-text review per line.
export const runPiped = async (chat: ChatRuntime): Promise<void> => {
  stdin.setEncoding("utf-8");
  let text = "";
  for await (const chunk of stdin) {
    text += String(chunk);
  }
  for (const line of text.split(LINE_BREAK)) {
    const prompt = line.trim();
    if (prompt.length === 0 || prompt === EXIT_COMMAND) {
      continue;
    }
    let state = initialState;
    for await (const event of chat.sendMessage({ prompt })) {
      state = reduce(state, event);
    }
    stdout.write(renderPlain(state));
  }
};
