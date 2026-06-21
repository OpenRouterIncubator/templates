// Deterministic review checks: pure functions over file text, no LLM and no
// network. This is the worked example a fresh intern starts from — extend it with
// your own checks, or replace it with a model-backed review (see the code-review
// template for a CommandHook that calls OpenRouter).

export interface Finding {
  readonly line: number;
  readonly message: string;
  readonly rule: string;
}

const MAX_LINE_LENGTH = 120;
const LEFTOVER_MARKERS = ["TODO", "FIXME", "XXX"] as const;
const CONSOLE_LOG_PATTERN = /\bconsole\.log\b/u;

/** Scan one file's text and return deterministic findings, in line order. */
export function reviewText(text: string): readonly Finding[] {
  const findings: Finding[] = [];
  const lines = text.split("\n");

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;

    for (const marker of LEFTOVER_MARKERS) {
      if (line.includes(marker)) {
        findings.push({
          line: lineNumber,
          message: `leftover ${marker} marker`,
          rule: "no-leftover-markers",
        });
      }
    }

    if (CONSOLE_LOG_PATTERN.test(line)) {
      findings.push({
        line: lineNumber,
        message: "stray console.log",
        rule: "no-console-log",
      });
    }

    if (line.length > MAX_LINE_LENGTH) {
      findings.push({
        line: lineNumber,
        message: `line exceeds ${MAX_LINE_LENGTH} characters (${line.length})`,
        rule: "max-line-length",
      });
    }

    if (line !== line.trimEnd()) {
      findings.push({
        line: lineNumber,
        message: "trailing whitespace",
        rule: "no-trailing-whitespace",
      });
    }
  }

  return findings;
}

/** Render findings as one line each: `<line>:<rule> <message>`. */
export function formatFindings(findings: readonly Finding[]): string {
  return findings
    .map((finding) => `${finding.line}:${finding.rule} ${finding.message}`)
    .join("\n");
}
