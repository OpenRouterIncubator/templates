// Decide what the prompt is asking us to review. A pull-request reference
// anywhere in the prompt selects PR mode; otherwise we review the local working
// diff. In PR mode the review (inline comments + suggestions) is posted to
// GitHub by default; an explicit opt-out cue ("dry run", "no post", "preview")
// keeps it report-only.
import { type PullRequestRef, parsePullRequestRef } from "./pr-ref.ts";

export type ReviewTarget =
  | {
      readonly mode: "pr";
      readonly post: boolean;
      readonly ref: PullRequestRef;
    }
  | { readonly mode: "local" };

const NO_POST_CUE =
  /\b(?:no[-\s]?post|don'?t\s+post|do\s+not\s+post|dry[-\s]?run|preview)\b/i;
const WHITESPACE = /\s+/;

export function parseTarget(prompt: string): ReviewTarget {
  const ref = findRef(prompt);
  if (ref !== null) {
    return { mode: "pr", post: !NO_POST_CUE.test(prompt), ref };
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
