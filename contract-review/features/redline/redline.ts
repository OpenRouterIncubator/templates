// Pure redlining logic: validate the model's proposed edits, anchor each edit
// to its exact text in the document, and render a track-changes-style markup
// (strikethrough = delete, bold = proposed replacement). No I/O.

import type { Severity } from "../review-contract/contract.ts";

export interface Edit {
  readonly original: string;
  readonly proposed: string;
  readonly rationale: string;
  readonly severity: Severity;
}

export interface RedlineResult {
  readonly applied: readonly Edit[];
  readonly marked: string;
  readonly unanchored: readonly Edit[];
}

const SNIPPET_LENGTH = 70;
const SEVERITIES: readonly Severity[] = ["critical", "high", "medium", "low"];

// A malformed or empty response throws instead of parsing to zero edits: an
// empty edit list is indistinguishable from a genuine "nothing needs changing".
export function parseEdits(jsonText: string): readonly Edit[] {
  const parsed = safeParse(jsonText);
  if (!isRecord(parsed)) {
    throw new Error(
      jsonText.trim() === ""
        ? "Model returned an empty response — no edits were proposed; the contract was not redlined."
        : "Model response is not valid edits JSON — the contract was not redlined."
    );
  }
  if (!Array.isArray(parsed.edits)) {
    return [];
  }
  const edits: Edit[] = [];
  for (const item of parsed.edits) {
    if (
      !isRecord(item) ||
      typeof item.original !== "string" ||
      item.original.trim() === ""
    ) {
      continue;
    }
    edits.push({
      original: item.original,
      proposed: typeof item.proposed === "string" ? item.proposed : "",
      rationale: typeof item.rationale === "string" ? item.rationale : "",
      severity: SEVERITIES.find((s) => s === item.severity) ?? "medium",
    });
  }
  return edits;
}

// Anchor each edit at the exact original text. Edits whose original text is
// not found verbatim (model paraphrased, or it sits past the truncation
// window) are reported separately rather than guessed at.
export function applyEdits(
  text: string,
  edits: readonly Edit[]
): RedlineResult {
  let marked = text;
  const applied: Edit[] = [];
  const unanchored: Edit[] = [];
  for (const edit of edits) {
    if (!marked.includes(edit.original)) {
      unanchored.push(edit);
      continue;
    }
    const replacement =
      edit.proposed === ""
        ? `~~${edit.original}~~`
        : `~~${edit.original}~~ **${edit.proposed}**`;
    // Function replacer: a string replacement would interpret $-patterns
    // ($$, $&, $`, $') — common in dollar-bearing contract text — and
    // silently corrupt the redline output.
    marked = marked.replace(edit.original, () => replacement);
    applied.push(edit);
  }
  return { applied, marked, unanchored };
}

export function renderRedline(filename: string, result: RedlineResult): string {
  const rationale = result.applied.map(
    (edit, i) =>
      `${i + 1}. [${edit.severity.toUpperCase()}] "${snippet(edit.original)}" → ${
        edit.proposed === "" ? "(delete)" : `"${snippet(edit.proposed)}"`
      } — ${edit.rationale}`
  );
  const manual = result.unanchored.map(
    (edit) =>
      `- [${edit.severity.toUpperCase()}] "${snippet(edit.original)}" — ${edit.rationale} (text not found verbatim; apply manually)`
  );
  return [
    `# Redline: ${filename}`,
    "",
    "~~Strikethrough~~ = delete, **bold** = proposed replacement.",
    "These are proposed edits for counsel to review — not legal advice.",
    "",
    "---",
    "",
    result.marked,
    "",
    "## Rationale",
    "",
    ...(rationale.length > 0 ? rationale : ["No edits proposed."]),
    ...(manual.length > 0 ? ["", "## Could not anchor", "", ...manual] : []),
    "",
  ].join("\n");
}

function snippet(text: string): string {
  const oneLine = text.replaceAll("\n", " ");
  if (oneLine.length <= SNIPPET_LENGTH) {
    return oneLine;
  }
  return `${oneLine.slice(0, SNIPPET_LENGTH)}…`;
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
