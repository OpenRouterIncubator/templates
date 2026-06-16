// Decide what the prompt is asking us to review. A pull-request reference
// anywhere in the prompt selects PR mode; otherwise we review the local working
// diff. PR writes are opt-in: the review is only posted when the prompt also
// asks to "post" (a deliberate cue, since this harness is the live dev runtime).
import { type PullRequestRef, parsePullRequestRef } from "./pr-ref.ts";

export type ReviewTarget =
  | {
      readonly mode: "pr";
      readonly post: boolean;
      readonly ref: PullRequestRef;
    }
  | { readonly mode: "local" };

const POST_CUE = /\bpost\b/i;
const WHITESPACE = /\s+/;

export function parseTarget(prompt: string): ReviewTarget {
  const ref = findRef(prompt);
  if (ref !== null) {
    return { mode: "pr", post: POST_CUE.test(prompt), ref };
  }
  return { mode: "local" };
}

// The short "owner/repo#N" form is anchored, so scan each token; the URL form is
// matched against the whole prompt.
function findRef(prompt: string): PullRequestRef | null {
  for (const token of prompt.split(WHITESPACE)) {
    const ref = parsePullRequestRef(token);
    if (ref !== null) {
      return ref;
    }
  }
  return parsePullRequestRef(prompt);
}
