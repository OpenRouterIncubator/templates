// Pure RCA logic: assemble the prompt from code snippets and validate the
// model's structured root-cause analysis. No I/O — unit-testable.

export interface Snippet {
  readonly path: string;
  readonly startLine: number;
  readonly text: string;
}

export type Confidence = "high" | "low" | "medium";

export interface Citation {
  readonly line: number;
  readonly note: string;
  readonly path: string;
}

export interface Rca {
  readonly citations: readonly Citation[];
  readonly confidence: Confidence;
  readonly fix: string;
  readonly needsRuntime: boolean;
  readonly rootCause: string;
  readonly summary: string;
}

export function buildRcaPrompt(
  report: string,
  snippets: readonly Snippet[]
): string {
  const code =
    snippets.length === 0
      ? "(no candidate code located — recommend runtime instrumentation)"
      : snippets
          .map(
            (s) =>
              `### ${s.path} (from line ${s.startLine})\n\n\`\`\`\n${s.text}\n\`\`\``
          )
          .join("\n\n");
  return [`# Bug report\n\n${report}`, "\n# Candidate code\n", code].join("\n");
}

export function parseRca(jsonText: string): Rca {
  const parsed = safeParse(jsonText);
  const record = isRecord(parsed) ? parsed : {};
  return {
    citations: toCitations(record.citations),
    confidence: toConfidence(record.confidence),
    fix: asString(record.fix),
    needsRuntime: record.needsRuntime === true,
    rootCause: asString(record.rootCause),
    summary: asString(record.summary),
  };
}

function toCitations(value: unknown): readonly Citation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const citations: Citation[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    const { line, note, path } = item;
    if (typeof path === "string" && typeof line === "number") {
      citations.push({ line, note: asString(note), path });
    }
  }
  return citations;
}

function toConfidence(value: unknown): Confidence {
  if (value === "high" || value === "low") {
    return value;
  }
  return "medium";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
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
