// Pure draft logic: enforce the approval gate and build the writing prompt
// from an approved brief. No I/O — unit-testable.
import { type ParsedBrief, parseBrief, validateBrief } from "../brief/brief.ts";

export interface GateResult {
  readonly ok: boolean;
  readonly reason: string;
}

export function approvalGate(markdown: string): GateResult {
  const parsed: ParsedBrief = parseBrief(markdown);
  if (parsed.fields.size === 0) {
    return { ok: false, reason: "not a brief (no frontmatter)" };
  }
  if (parsed.status !== "approved") {
    return {
      ok: false,
      reason: `brief is not approved (status: ${parsed.status}); run brief approve first`,
    };
  }
  // Re-validate even when stamped approved: a hand-edited status line (or a
  // brief approved under an older required-field set) must not draft from an
  // incomplete brief.
  const problems = validateBrief(parsed);
  if (problems.length > 0) {
    return {
      ok: false,
      reason: `brief is approved but incomplete: ${problems.join("; ")}`,
    };
  }
  return { ok: true, reason: "" };
}

export function buildDraftPrompt(briefMarkdown: string): string {
  return [
    "Write the full draft specified by this approved brief.",
    "Follow the outline, answer the listed questions, serve the thesis,",
    "and end with the CTA. Write in a concrete, plain, human voice —",
    "no filler phrases, no hype words. Output markdown only.",
    "",
    "# Approved brief",
    "",
    briefMarkdown,
  ].join("\n");
}
