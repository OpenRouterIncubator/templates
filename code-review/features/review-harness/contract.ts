// Minimal local mirror of Ori's author harness contract. Templates are
// standalone Bun workspaces and do not depend on `@ori-contracts/author`
// (the runtime validates the harness structurally at load), so we redeclare
// just the shapes this feature emits and `satisfies` them. The string values
// MUST match Ori's `AgentRuntimeEvent` tags exactly or the projector drops them.

export const EVENT = {
  ContentDelta: "content.delta",
  ItemCompleted: "item.completed",
  ItemStarted: "item.started",
  RuntimeError: "runtime.error",
  SessionEnded: "session.ended",
  ToolCompleted: "tool.completed",
  ToolStarted: "tool.started",
} as const;

export const STREAM = {
  Assistant: "assistant_text",
  Reasoning: "reasoning_text",
} as const;

export const ITEM_STATUS = {
  Completed: "completed",
  Failed: "failed",
  InProgress: "inProgress",
} as const;

type StreamKind = (typeof STREAM)[keyof typeof STREAM];
type ItemStatus = (typeof ITEM_STATUS)[keyof typeof ITEM_STATUS];

export type AgentRuntimeEvent =
  | {
      readonly type: typeof EVENT.ContentDelta;
      readonly payload: {
        readonly delta: string;
        readonly streamKind: StreamKind;
      };
    }
  | {
      readonly type: typeof EVENT.ItemStarted | typeof EVENT.ItemCompleted;
      readonly payload: {
        readonly itemType: string;
        readonly title?: string;
        readonly status?: ItemStatus;
        readonly detail?: string;
        readonly data?: unknown;
      };
    }
  | {
      readonly type: typeof EVENT.ToolStarted;
      readonly payload: { readonly name: string; readonly input?: unknown };
    }
  | {
      readonly type: typeof EVENT.ToolCompleted;
      readonly payload: {
        readonly name: string;
        readonly isError: boolean;
        readonly result: unknown;
      };
    }
  | {
      readonly type: typeof EVENT.SessionEnded;
      readonly payload: {
        readonly ok: boolean;
        readonly error?: string;
        readonly sessionId?: string;
      };
    }
  | {
      readonly type: typeof EVENT.RuntimeError;
      readonly payload: { readonly message: string; readonly detail?: unknown };
    };

export interface HarnessInvokeOptions {
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
  readonly model?: string | null;
  readonly prompt: string;
  readonly sessionId?: string;
  readonly systemPrompt?: string;
  readonly temperature?: number;
}

export interface AgentHarness {
  readonly invoke: (
    options: HarnessInvokeOptions
  ) => AsyncIterable<AgentRuntimeEvent>;
  readonly name: string;
  readonly parseSessionId: (line: string) => string | null;
}
