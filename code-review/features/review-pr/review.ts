// Pure review logic: build the prompt, parse/validate model findings, resolve
// each finding onto a valid diff line, drop ones already raised, and assemble a
// GitHub review. No I/O — unit-testable.
import { type Hunk, resolveLine } from "./diff.ts";
import type {
  ChangedFile,
  PullRequest,
  ReviewComment,
  ReviewEvent,
  ReviewSubmission,
} from "./github.ts";

export type Severity = "must-fix" | "suggestion";

export interface Finding {
  readonly body: string;
  readonly line: number;
  readonly path: string;
  readonly severity: Severity;
}

export interface ExistingComment {
  readonly body: string;
  readonly line: number | null;
  readonly path: string;
}

export interface ReviewInput {
  readonly existing: readonly ExistingComment[];
  readonly findings: readonly Finding[];
  readonly hunksByPath: ReadonlyMap<string, readonly Hunk[]>;
}

const MAX_PATCH_CHARS = 6000;

export function buildReviewPrompt(
  pr: PullRequest,
  files: readonly ChangedFile[]
): string {
  const sections = files
    .filter((file) => file.patch !== undefined)
    .map(
      (file) =>
        `### ${file.filename} (+${file.additions} -${file.deletions})\n\n\`\`\`diff\n${truncate(file.patch ?? "")}\n\`\`\``
    );
  return [
    `# Pull request: ${pr.title}`,
    pr.body.length > 0 ? `\n${pr.body}\n` : "",
    "## Changed files",
    sections.join("\n\n"),
  ].join("\n");
}

function truncate(patch: string): string {
  if (patch.length <= MAX_PATCH_CHARS) {
    return patch;
  }
  return `${patch.slice(0, MAX_PATCH_CHARS)}\n… (truncated)`;
}

function extractList(parsed: unknown): readonly unknown[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (isRecord(parsed) && Array.isArray(parsed.findings)) {
    return parsed.findings;
  }
  return [];
}

export function parseFindings(jsonText: string): readonly Finding[] {
  const list = extractList(safeParse(jsonText));
  const findings: Finding[] = [];
  for (const item of list) {
    const finding = toFinding(item);
    if (finding !== null) {
      findings.push(finding);
    }
  }
  return dedupeFindings(findings);
}

export function dedupeFindings(
  findings: readonly Finding[]
): readonly Finding[] {
  const seen = new Set<string>();
  const unique: Finding[] = [];
  for (const finding of findings) {
    const key = `${finding.path}:${finding.line}:${finding.body}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(finding);
    }
  }
  return unique;
}

// Drop findings already raised on the PR — same path+line, or same path+text.
export function filterAlreadyRaised(
  findings: readonly Finding[],
  existing: readonly ExistingComment[]
): readonly Finding[] {
  const byLine = new Set<string>();
  const byText = new Set<string>();
  for (const comment of existing) {
    if (comment.line !== null) {
      byLine.add(`${comment.path}:${comment.line}`);
    }
    byText.add(`${comment.path}::${normalize(comment.body)}`);
  }
  return findings.filter(
    (finding) =>
      !(
        byLine.has(`${finding.path}:${finding.line}`) ||
        byText.has(`${finding.path}::${normalize(finding.body)}`)
      )
  );
}

export function chooseEvent(findings: readonly Finding[]): ReviewEvent {
  if (findings.some((finding) => finding.severity === "must-fix")) {
    return "REQUEST_CHANGES";
  }
  return findings.length === 0 ? "APPROVE" : "COMMENT";
}

export function buildReview(input: ReviewInput): ReviewSubmission {
  const fresh = filterAlreadyRaised(
    dedupeFindings(input.findings),
    input.existing
  );
  const comments: ReviewComment[] = [];
  const folded: Finding[] = [];
  for (const finding of fresh) {
    const hunks = input.hunksByPath.get(finding.path) ?? [];
    const line = resolveLine(hunks, finding.line);
    if (line === null) {
      folded.push(finding);
      continue;
    }
    comments.push({
      body: commentBody(finding, line !== finding.line),
      line,
      path: finding.path,
      side: "RIGHT",
    });
  }
  return {
    body: reviewBody(fresh, folded),
    comments,
    event: chooseEvent(fresh),
  };
}

function commentBody(finding: Finding, adjusted: boolean): string {
  const note = adjusted ? " _(nearest changed line)_" : "";
  return `**${finding.severity}** — ${finding.body}${note}`;
}

function reviewBody(
  fresh: readonly Finding[],
  folded: readonly Finding[]
): string {
  if (fresh.length === 0) {
    return "No new issues in this pass. Note any residual risk before merging.";
  }
  const mustFix = fresh.filter((f) => f.severity === "must-fix").length;
  const lines = [
    `Review complete: ${mustFix} must-fix, ${fresh.length - mustFix} suggestion(s).`,
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

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function toFinding(value: unknown): Finding | null {
  if (!isRecord(value)) {
    return null;
  }
  const { body, line, path, severity } = value;
  if (typeof body !== "string" || typeof path !== "string") {
    return null;
  }
  if (typeof line !== "number" || !Number.isInteger(line)) {
    return null;
  }
  return {
    body,
    line,
    path,
    severity: severity === "must-fix" ? "must-fix" : "suggestion",
  };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
