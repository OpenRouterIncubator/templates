// The seam between the review pipeline and Ori's runtime: project each internal
// pipeline event onto a normalized AgentRuntimeEvent. Keeping this pure and
// separate means the TUI (and the built-in renderer) receive well-typed,
// structured events, and the mapping is unit-tested in isolation.
import {
  type AgentRuntimeEvent,
  EVENT,
  ITEM_STATUS,
  STREAM,
} from "./contract.ts";
import type { RankedFinding } from "./findings.ts";

export const DIMENSION_ITEM = "review-dimension";
export const FINDING_ITEM = "review-finding";

export type PipelineEvent =
  | { readonly kind: "status"; readonly text: string }
  | {
      readonly kind: "tool-start";
      readonly name: string;
      readonly input?: unknown;
    }
  | {
      readonly kind: "tool-done";
      readonly isError: boolean;
      readonly name: string;
      readonly result: unknown;
    }
  | { readonly kind: "dimension-start"; readonly title: string }
  | {
      readonly kind: "dimension-done";
      readonly count: number;
      readonly title: string;
    }
  | { readonly kind: "finding"; readonly finding: RankedFinding }
  | { readonly kind: "report"; readonly markdown: string }
  | { readonly kind: "chat"; readonly text: string }
  | {
      readonly kind: "error";
      readonly detail?: unknown;
      readonly message: string;
    }
  | { readonly kind: "ended"; readonly error?: string; readonly ok: boolean };

export function toRuntimeEvent(event: PipelineEvent): AgentRuntimeEvent {
  switch (event.kind) {
    case "status":
      return {
        payload: { delta: `${event.text}\n`, streamKind: STREAM.Reasoning },
        type: EVENT.ContentDelta,
      };
    case "tool-start":
      return {
        payload: { input: event.input, name: event.name },
        type: EVENT.ToolStarted,
      };
    case "tool-done":
      return {
        payload: {
          isError: event.isError,
          name: event.name,
          result: event.result,
        },
        type: EVENT.ToolCompleted,
      };
    case "dimension-start":
      return {
        payload: {
          itemType: DIMENSION_ITEM,
          status: ITEM_STATUS.InProgress,
          title: event.title,
        },
        type: EVENT.ItemStarted,
      };
    case "dimension-done":
      return {
        payload: {
          detail: `${event.count} candidate finding(s)`,
          itemType: DIMENSION_ITEM,
          status: ITEM_STATUS.Completed,
          title: event.title,
        },
        type: EVENT.ItemCompleted,
      };
    case "finding":
      return findingEvent(event.finding);
    case "report":
      return {
        payload: { delta: event.markdown, streamKind: STREAM.Assistant },
        type: EVENT.ContentDelta,
      };
    case "chat":
      return {
        payload: { delta: event.text, streamKind: STREAM.Assistant },
        type: EVENT.ContentDelta,
      };
    case "error":
      return {
        payload: { detail: event.detail, message: event.message },
        type: EVENT.RuntimeError,
      };
    default:
      return {
        payload: { error: event.error, ok: event.ok },
        type: EVENT.SessionEnded,
      };
  }
}

function findingEvent(finding: RankedFinding): AgentRuntimeEvent {
  return {
    payload: {
      data: {
        confidence: finding.confidence,
        dimensions: finding.dimensions,
        line: finding.line,
        path: finding.path,
        severity: finding.severity,
        votes: finding.votes,
      },
      detail: finding.body,
      itemType: FINDING_ITEM,
      status:
        finding.severity === "must-fix"
          ? ITEM_STATUS.Failed
          : ITEM_STATUS.Completed,
      title: `[${finding.severity}] ${finding.path}:${finding.line}`,
    },
    type: EVENT.ItemCompleted,
  };
}
