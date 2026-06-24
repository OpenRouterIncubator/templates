// The discoverable contribution entry: the feature loader only scans
// `feature.ts` for module exports, and the agent-runtime export must be named
// `harness`. As the single project harness it is auto-selected as the intern's
// default runtime (over the built-in generic harness), so every `ori dev` turn
// runs the multi-stage code review. The pipeline and event projection live in
// sibling modules; this file just adapts them to the harness contract.
import type { AgentHarness } from "./contract.ts";
import { toRuntimeEvent } from "./events.ts";
import { runReview } from "./pipeline.ts";

const SESSION_PREFIX = "session=";

export const harness = {
  name: "review",
  parseSessionId(line: string): string | null {
    return line.startsWith(SESSION_PREFIX)
      ? line.slice(SESSION_PREFIX.length)
      : null;
  },
  async *invoke(options) {
    for await (const event of runReview(options)) {
      yield toRuntimeEvent(event);
    }
  },
} satisfies AgentHarness;
