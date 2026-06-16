// A bespoke Ink TUI for the review harness. Instead of a plain assistant-text
// transcript it renders the review as it streams: a checklist of dimensions, a
// color-coded list of confirmed findings, and the final verdict. The pure
// reducer (`reduce`) turns the harness's runtime events into a view-model and is
// unit-tested in isolation; the JSX below just paints that view-model. Under a
// non-TTY harness (piped stdin) `runPiped` streams the same content as plain ANSI.
import { stdin, stdout } from "node:process";
import { Box, Text, useApp, useInput } from "ink";
import { useState } from "react";

const CONTENT_DELTA = "content.delta";
const ITEM_STARTED = "item.started";
const ITEM_COMPLETED = "item.completed";
const RUNTIME_ERROR = "runtime.error";
const SESSION_ENDED = "session.ended";
const ASSISTANT_TEXT = "assistant_text";
const REASONING_TEXT = "reasoning_text";
const DIMENSION_ITEM = "review-dimension";
const FINDING_ITEM = "review-finding";
const EXIT_COMMAND = "/exit";
const LINE_BREAK = /\r?\n/u;

export interface RuntimeEvent {
  readonly payload?: {
    readonly data?: unknown;
    readonly delta?: string;
    readonly detail?: string;
    readonly error?: string;
    readonly itemType?: string;
    readonly message?: string;
    readonly ok?: boolean;
    readonly status?: string;
    readonly streamKind?: string;
    readonly title?: string;
  };
  readonly type: string;
}

export interface ChatRuntime {
  readonly sendMessage: (input: {
    readonly prompt: string;
  }) => AsyncIterable<RuntimeEvent>;
}

export type Severity = "must-fix" | "suggestion";

export interface DimensionRow {
  readonly detail?: string;
  readonly status: "done" | "running";
  readonly title: string;
}

export interface FindingRow {
  readonly body: string;
  readonly severity: Severity;
  readonly title: string;
}

export interface ReviewState {
  readonly dimensions: readonly DimensionRow[];
  readonly done: boolean;
  readonly error?: string;
  readonly findings: readonly FindingRow[];
  readonly report: string;
  readonly status?: string;
}

export const initialState: ReviewState = {
  dimensions: [],
  done: false,
  findings: [],
  report: "",
};

type Payload = NonNullable<RuntimeEvent["payload"]>;

// Pure: fold one harness event into the review view-model.
export function reduce(state: ReviewState, event: RuntimeEvent): ReviewState {
  const payload = event.payload ?? {};
  switch (event.type) {
    case CONTENT_DELTA:
      return reduceDelta(state, payload);
    case ITEM_STARTED:
    case ITEM_COMPLETED:
      return reduceItem(state, event.type, payload);
    case RUNTIME_ERROR:
      return { ...state, error: payload.message ?? "runtime error" };
    case SESSION_ENDED:
      return {
        ...state,
        done: true,
        error:
          payload.ok === false
            ? (payload.error ?? state.error ?? "review failed")
            : state.error,
      };
    default:
      return state;
  }
}

function reduceDelta(state: ReviewState, payload: Payload): ReviewState {
  if (payload.streamKind === ASSISTANT_TEXT) {
    return { ...state, report: state.report + (payload.delta ?? "") };
  }
  if (payload.streamKind === REASONING_TEXT) {
    const status = (payload.delta ?? "").trim();
    return status.length > 0 ? { ...state, status } : state;
  }
  return state;
}

function reduceItem(
  state: ReviewState,
  type: string,
  payload: Payload
): ReviewState {
  if (payload.itemType === DIMENSION_ITEM) {
    const status = type === ITEM_COMPLETED ? "done" : "running";
    return {
      ...state,
      dimensions: upsertDimension(
        state.dimensions,
        payload.title ?? "",
        status,
        payload.detail
      ),
    };
  }
  if (type === ITEM_COMPLETED && payload.itemType === FINDING_ITEM) {
    return { ...state, findings: [...state.findings, toFindingRow(payload)] };
  }
  return state;
}

export function reduceAll(events: readonly RuntimeEvent[]): ReviewState {
  return events.reduce(reduce, initialState);
}

export function severityColor(severity: Severity): string {
  return severity === "must-fix" ? "red" : "yellow";
}

function upsertDimension(
  rows: readonly DimensionRow[],
  title: string,
  status: DimensionRow["status"],
  detail?: string
): readonly DimensionRow[] {
  const next: DimensionRow = { detail, status, title };
  return rows.some((row) => row.title === title)
    ? rows.map((row) => (row.title === title ? next : row))
    : [...rows, next];
}

function toFindingRow(
  payload: NonNullable<RuntimeEvent["payload"]>
): FindingRow {
  return {
    body: payload.detail ?? "",
    severity: readSeverity(payload),
    title: payload.title ?? "",
  };
}

function readSeverity(payload: NonNullable<RuntimeEvent["payload"]>): Severity {
  if (isRecord(payload.data) && payload.data.severity === "must-fix") {
    return "must-fix";
  }
  return (payload.title ?? "").includes("[must-fix]")
    ? "must-fix"
    : "suggestion";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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
    setHistory((prev) => [...prev, state]);
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

function renderPlain(state: ReviewState): string {
  const lines = state.findings.map(
    (row) =>
      `${row.severity === "must-fix" ? "!" : "-"} ${row.title}\n  ${row.body}`
  );
  if (state.error !== undefined) {
    lines.push(`error: ${state.error}`);
  }
  return `${[...lines, state.report].filter((part) => part.length > 0).join("\n")}\n`;
}
