// Pure view-model for the review TUI: fold the harness's runtime events into the
// rows the Ink components paint, and render the non-TTY plain-text fallback.
// Kept separate from the JSX (app.tsx) so it is unit-tested in isolation.

export const EXIT_COMMAND = "/exit";
export const LINE_BREAK = /\r?\n/u;

const CONTENT_DELTA = "content.delta";
const ITEM_STARTED = "item.started";
const ITEM_COMPLETED = "item.completed";
const RUNTIME_ERROR = "runtime.error";
const SESSION_ENDED = "session.ended";
const ASSISTANT_TEXT = "assistant_text";
const REASONING_TEXT = "reasoning_text";
const DIMENSION_ITEM = "review-dimension";
const FINDING_ITEM = "review-finding";

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

export function reduceAll(events: readonly RuntimeEvent[]): ReviewState {
  return events.reduce(reduce, initialState);
}

export function severityColor(severity: Severity): string {
  return severity === "must-fix" ? "red" : "yellow";
}

// Plain-text rendering for the non-TTY (piped) fallback.
export function renderPlain(state: ReviewState): string {
  const lines = state.findings.map(
    (row) =>
      `${row.severity === "must-fix" ? "!" : "-"} ${row.title}\n  ${row.body}`
  );
  if (state.error !== undefined) {
    lines.push(`error: ${state.error}`);
  }
  return `${[...lines, state.report].filter((part) => part.length > 0).join("\n")}\n`;
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

function toFindingRow(payload: Payload): FindingRow {
  return {
    body: payload.detail ?? "",
    severity: readSeverity(payload),
    title: payload.title ?? "",
  };
}

function readSeverity(payload: Payload): Severity {
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
