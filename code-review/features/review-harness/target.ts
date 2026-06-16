// Classify what the prompt wants. A pull-request reference selects PR review; a
// prompt opening with a review verb ("review/audit/critique") reviews the local
// working diff; anything else is a normal chat turn — so the intern stays
// conversational by default instead of forcing a review on every message. In PR
// mode the review is posted to GitHub by default; an opt-out cue ("dry run",
// "no post", "preview") keeps it report-only.
import { type PullRequestRef, parsePullRequestRef } from "./pr-ref.ts";

export type ReviewTarget =
  | {
      readonly mode: "pr";
      readonly ref: PullRequestRef;
    }
  | { readonly mode: "local" }
  | { readonly mode: "chat" };

const NO_POST_CUE =
  /\b(?:no[-\s]?post|don'?t\s+post|do\s+not\s+post|dry[-\s]?run|preview)\b/i;
const POST_CUE = /\bpost\b/i;
const REVIEW_INTENT = /^\s*\/?(?:review|audit|critique|code[-\s]?review)\b/i;
const WHITESPACE = /\s+/;

export function parseTarget(prompt: string): ReviewTarget {
  const ref = findRef(prompt);
  if (ref !== null) {
    return { mode: "pr", ref };
  }
  if (REVIEW_INTENT.test(prompt)) {
    return { mode: "local" };
  }
  return { mode: "chat" };
}

// Whether to post this PR review. An explicit one-off cue in the prompt wins;
// otherwise fall back to the session default (the user's standing preference).
export function resolvePostDecision(
  prompt: string,
  sessionDefault: boolean
): boolean {
  if (NO_POST_CUE.test(prompt)) {
    return false;
  }
  if (POST_CUE.test(prompt)) {
    return true;
  }
  return sessionDefault;
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
