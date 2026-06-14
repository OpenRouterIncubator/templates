// Pure anti-AI-prose linter: banned phrases, em-dash density, hedging density,
// and exclamation density, with line numbers and a verdict. Zero dependencies,
// no network — deterministic and unit-testable.

export type StyleSeverity = "error" | "warning";

export interface StyleFinding {
  readonly line: number;
  readonly message: string;
  readonly severity: StyleSeverity;
}

export interface StyleReport {
  readonly findings: readonly StyleFinding[];
  readonly ok: boolean;
  readonly words: number;
}

// Phrases that read as AI filler. Case-insensitive, matched per line.
const BANNED_PHRASES: readonly string[] = [
  "delve",
  "tapestry",
  "in today's fast-paced world",
  "in the ever-evolving landscape",
  "it's important to note",
  "it is important to note",
  "game-changer",
  "unlock the power",
  "seamlessly",
  "revolutionize",
  "elevate your",
  "dive into",
  "navigate the complexities",
  "in conclusion",
  "furthermore",
  "moreover",
  "look no further",
  "buckle up",
];

const HEDGES: readonly string[] = [
  "might",
  "perhaps",
  "possibly",
  "arguably",
  "somewhat",
  "potentially",
];

const WORD = /[A-Za-z0-9'-]+/g;
const PER_100 = 100;
const EM_DASH_MAX_PER_100 = 1.5;
const HEDGE_MAX_PER_100 = 2;
const EXCLAIM_MAX = 1;

export function checkStyle(text: string): StyleReport {
  const findings: StyleFinding[] = [];
  const lines = text.split("\n");
  const words = (text.match(WORD) ?? []).length;

  lines.forEach((line, index) => {
    const lower = line.toLowerCase();
    for (const phrase of BANNED_PHRASES) {
      if (lower.includes(phrase)) {
        findings.push({
          line: index + 1,
          message: `AI-filler phrase: "${phrase}"`,
          severity: "error",
        });
      }
    }
  });

  if (words > 0) {
    const emDashes = (text.match(/—/g) ?? []).length;
    const emDashRate = (emDashes / words) * PER_100;
    if (emDashRate > EM_DASH_MAX_PER_100) {
      findings.push({
        line: 0,
        message: `em-dash density ${emDashRate.toFixed(1)}/100 words (max ${EM_DASH_MAX_PER_100}) — vary the punctuation`,
        severity: "warning",
      });
    }

    const lowerText = text.toLowerCase();
    let hedges = 0;
    for (const hedge of HEDGES) {
      hedges += (lowerText.match(new RegExp(`\\b${hedge}\\b`, "g")) ?? [])
        .length;
    }
    const hedgeRate = (hedges / words) * PER_100;
    if (hedgeRate > HEDGE_MAX_PER_100) {
      findings.push({
        line: 0,
        message: `hedging density ${hedgeRate.toFixed(1)}/100 words (max ${HEDGE_MAX_PER_100}) — commit to claims`,
        severity: "warning",
      });
    }
  }

  const exclaims = (text.match(/!/g) ?? []).length;
  if (exclaims > EXCLAIM_MAX) {
    findings.push({
      line: 0,
      message: `${exclaims} exclamation marks (max ${EXCLAIM_MAX}) — let the content carry the energy`,
      severity: "warning",
    });
  }

  return {
    findings,
    ok: !findings.some((finding) => finding.severity === "error"),
    words,
  };
}

export function formatReport(report: StyleReport): string {
  if (report.findings.length === 0) {
    return `Style check passed (${report.words} words). Reads human.\n`;
  }
  const lines = report.findings.map((finding) => {
    const where = finding.line > 0 ? `line ${finding.line}: ` : "";
    return `[${finding.severity}] ${where}${finding.message}`;
  });
  const verdict = report.ok
    ? "Style check passed with warnings."
    : "Style check FAILED — fix the errors before shipping.";
  return `${lines.join("\n")}\n\n${verdict}\n`;
}
