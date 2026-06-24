// Pure presentation: turn confirmed findings into the streamed markdown report
// and (for the opt-in PR path) a GitHub review submission with inline comments
// resolved onto changed diff lines.
import { type ChangedFile, type Hunk, resolveLine } from "./diff.ts";
import { DIMENSIONS } from "./dimensions.ts";
import type { RankedFinding, Verdict } from "./findings.ts";
import type {
  ExistingComment,
  ReviewComment,
  ReviewSubmission,
} from "./github.ts";

export interface ReportInput {
  readonly confirmed: readonly RankedFinding[];
  readonly demotedCount: number;
  readonly files: readonly ChangedFile[];
  readonly models: readonly string[];
  readonly title: string;
  readonly verdict: Verdict;
}

const WHITESPACE = /\s+/g;

const VERDICT_LABEL: Record<Verdict, string> = {
  APPROVE: "approved",
  COMMENT: "comments",
  REQUEST_CHANGES: "changes requested",
};

export function buildReport(input: ReportInput): string {
  const mustFix = input.confirmed.filter(
    (finding) => finding.severity === "must-fix"
  ).length;
  const lines = [
    `## Code review — ${VERDICT_LABEL[input.verdict]}`,
    "",
    `Reviewed ${input.files.length} file(s) across ${DIMENSIONS.length} dimensions with ${input.models.length} model(s): ${input.title}.`,
    "",
    summaryLine(mustFix, input.confirmed.length - mustFix, input.demotedCount),
  ];
  if (input.confirmed.length === 0) {
    lines.push(
      "",
      "No blocking issues found in this pass. Note any residual risk before merging."
    );
    return lines.join("\n");
  }
  lines.push("", "### Findings");
  for (const finding of input.confirmed) {
    lines.push(
      `- **[${finding.severity}]** \`${finding.path}:${finding.line}\` — ${finding.body} _(${finding.dimensions.join(
        ", "
      )} · ${finding.votes}/${input.models.length} models)_`
    );
  }
  return lines.join("\n");
}

export function emptyReport(title: string): string {
  return `## Code review — approved\n\nNothing to review in ${title}: no changed lines were found.`;
}

export function buildReviewSubmission(
  confirmed: readonly RankedFinding[],
  verdict: Verdict,
  hunksByPath: ReadonlyMap<string, readonly Hunk[]>,
  existing: readonly ExistingComment[] = []
): ReviewSubmission {
  const fresh = filterAlreadyRaised(confirmed, existing);
  const comments: ReviewComment[] = [];
  const folded: RankedFinding[] = [];
  for (const finding of fresh) {
    const line = resolveLine(hunksByPath.get(finding.path) ?? [], finding.line);
    if (line === null) {
      folded.push(finding);
      continue;
    }
    comments.push({
      body: commentBody(finding, line),
      line,
      path: finding.path,
      side: "RIGHT",
    });
  }
  return {
    body: submissionBody(fresh, folded),
    comments,
    event: reconcileEvent(verdict, fresh),
  };
}

// After dedup, the verdict may overstate what survives: a rerun where every
// must-fix was already posted leaves no blocking comments to make, so a
// REQUEST_CHANGES event would contradict the "No blocking issues" body. Recompute
// the event from the surviving findings — nothing fresh approves, no fresh
// must-fix downgrades to a comment, and only a fresh must-fix keeps the verdict.
function reconcileEvent(
  verdict: Verdict,
  fresh: readonly RankedFinding[]
): Verdict {
  if (fresh.length === 0) {
    return "APPROVE";
  }
  const hasMustFix = fresh.some((finding) => finding.severity === "must-fix");
  if (!hasMustFix) {
    return "COMMENT";
  }
  return verdict;
}

// Build the inline comment, appending a committable GitHub suggestion block when
// the model proposed a replacement AND the comment lands on the exact changed
// line (a snapped/nearest line would replace the wrong code).
function commentBody(finding: RankedFinding, line: number): string {
  const note = line === finding.line ? "" : NEAREST_LINE_NOTE;
  const base = `**${finding.severity}** — ${finding.body}${note}`;
  if (finding.suggestion !== undefined && line === finding.line) {
    return `${base}\n\n\`\`\`suggestion\n${finding.suggestion}\n\`\`\``;
  }
  return base;
}

const NEAREST_LINE_NOTE = " _(nearest changed line)_";
const SEVERITY_PREFIX = /^\*\*[^*]+\*\*\s*—\s*/;
const SUGGESTION_FENCE = /\n*```suggestion[\s\S]*$/;

// Reduce a posted, decorated comment back to the raw finding body so dedup can
// compare like-for-like. commentBody() wraps the body in a "**severity** — "
// prefix and may append a "nearest changed line" note or a suggestion fence;
// strip all three before normalizing so a re-run matches the original finding.
function canonicalCommentBody(body: string): string {
  return body
    .replace(SUGGESTION_FENCE, "")
    .replace(SEVERITY_PREFIX, "")
    .replace(NEAREST_LINE_NOTE, "");
}

// Drop findings already raised on the PR — same path+line, or same path+text.
function filterAlreadyRaised(
  findings: readonly RankedFinding[],
  existing: readonly ExistingComment[]
): readonly RankedFinding[] {
  const byLine = new Set<string>();
  const byText = new Set<string>();
  for (const comment of existing) {
    if (comment.line !== null) {
      byLine.add(`${comment.path}:${comment.line}`);
    }
    byText.add(
      `${comment.path}::${normalizeText(canonicalCommentBody(comment.body))}`
    );
  }
  return findings.filter(
    (finding) =>
      !(
        byLine.has(`${finding.path}:${finding.line}`) ||
        byText.has(`${finding.path}::${normalizeText(finding.body)}`)
      )
  );
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(WHITESPACE, " ").trim();
}

function summaryLine(
  mustFix: number,
  suggestions: number,
  demoted: number
): string {
  const base = `${mustFix} must-fix · ${suggestions} suggestion(s) confirmed`;
  return demoted > 0
    ? `${base} · ${demoted} low-confidence demoted.`
    : `${base}.`;
}

function submissionBody(
  confirmed: readonly RankedFinding[],
  folded: readonly RankedFinding[]
): string {
  if (confirmed.length === 0) {
    return "No blocking issues found in this pass.";
  }
  const mustFix = confirmed.filter(
    (finding) => finding.severity === "must-fix"
  ).length;
  const lines = [
    `Review complete: ${mustFix} must-fix, ${confirmed.length - mustFix} suggestion(s).`,
  ];
  if (folded.length > 0) {
    lines.push("", "Findings not on changed lines:");
    for (const finding of folded) {
      lines.push(
        `- \`${finding.path}:${finding.line}\` (${finding.severity}) — ${finding.body}`
      );
    }
  }
  return lines.join("\n");
}
