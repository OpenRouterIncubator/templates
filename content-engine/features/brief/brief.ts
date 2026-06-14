// Pure content-brief logic: the brief format (markdown + YAML-ish frontmatter),
// parsing, required-field validation, the approval stamp, and rendering a brief
// from the model's structured output. No I/O — unit-testable.

export type BriefStatus = "approved" | "draft";

export interface BriefData {
  readonly angle: string;
  readonly audience: string;
  readonly cta: string;
  readonly intent: string;
  readonly keywords: readonly string[];
  readonly outline: readonly string[];
  readonly questions: readonly string[];
  readonly thesis: string;
  readonly topic: string;
}

export interface ParsedBrief {
  readonly fields: ReadonlyMap<string, string>;
  readonly status: BriefStatus | "unknown";
}

export const REQUIRED_FIELDS: readonly string[] = [
  "topic",
  "audience",
  "intent",
  "angle",
  "thesis",
  "cta",
];

const FRONTMATTER = /^---\n([\s\S]*?)\n---/;
const NON_SLUG = /[^a-z0-9]+/;
// No whitespace eater before the value capture: `\s*(.*)` backtracks
// polynomially on long space runs (CodeQL js/polynomial-redos). Trim in code.
const FIELD_LINE = /^([a-z-]+):(.*)$/;
const WHITESPACE_RUN = /\s+/gu;

export function parseBrief(markdown: string): ParsedBrief {
  const match = FRONTMATTER.exec(markdown);
  const fields = new Map<string, string>();
  if (match !== null) {
    for (const raw of (match[1] ?? "").split("\n")) {
      const field = FIELD_LINE.exec(raw.trim());
      const value = field?.[2]?.trim() ?? "";
      if (field?.[1] !== undefined && value !== "") {
        fields.set(field[1], value);
      }
    }
  }
  const status = fields.get("status");
  return {
    fields,
    status: status === "approved" || status === "draft" ? status : "unknown",
  };
}

// Returns the list of problems; empty means the brief is approvable.
export function validateBrief(parsed: ParsedBrief): readonly string[] {
  const problems: string[] = [];
  if (parsed.fields.size === 0) {
    return ["no frontmatter found (expected --- delimited fields)"];
  }
  for (const field of REQUIRED_FIELDS) {
    if (!parsed.fields.has(field)) {
      problems.push(`missing required field: ${field}`);
    }
  }
  return problems;
}

// Stamp status: approved in place (replacing an existing status line if any).
export function stampApproved(markdown: string): string {
  const match = FRONTMATTER.exec(markdown);
  if (match === null) {
    return markdown;
  }
  const body = match[1] ?? "";
  const withoutStatus = body
    .split("\n")
    .filter((line) => !line.trim().startsWith("status:"))
    .join("\n");
  // Replacer function: a replacement *string* would expand `$`-sequences
  // ($&, $`, $', $1, $$) found in frontmatter values and corrupt the brief.
  return markdown.replace(
    FRONTMATTER,
    () => `---\n${withoutStatus}\nstatus: approved\n---`
  );
}

// Frontmatter values come from model output: collapse whitespace runs
// (including newlines) so a multi-line value cannot inject extra frontmatter
// lines or terminate the block early.
function fieldValue(text: string): string {
  return text.replaceAll(WHITESPACE_RUN, " ").trim();
}

export function renderBrief(data: BriefData): string {
  const lines = [
    "---",
    `topic: ${fieldValue(data.topic)}`,
    `audience: ${fieldValue(data.audience)}`,
    `intent: ${fieldValue(data.intent)}`,
    `angle: ${fieldValue(data.angle)}`,
    `thesis: ${fieldValue(data.thesis)}`,
    `cta: ${fieldValue(data.cta)}`,
    "status: draft",
    "---",
    "",
    `# Brief: ${data.topic}`,
    "",
    "## Outline",
    ...data.outline.map((h) => `- ${h}`),
    "",
    "## Keywords",
    ...data.keywords.map((k) => `- ${k}`),
    "",
    "## Questions to answer",
    ...data.questions.map((q) => `- ${q}`),
    "",
  ];
  return lines.join("\n");
}

export function parseBriefData(jsonText: string): BriefData {
  const parsed = safeParse(jsonText);
  const record = isRecord(parsed) ? parsed : {};
  return {
    angle: asString(record.angle),
    audience: asString(record.audience),
    cta: asString(record.cta),
    intent: asString(record.intent),
    keywords: asStringList(record.keywords),
    outline: asStringList(record.outline),
    questions: asStringList(record.questions),
    thesis: asString(record.thesis),
    topic: asString(record.topic),
  };
}

// Split-and-join instead of edge-dash trimming: `/^-+|-+$/` backtracks
// polynomially on long dash runs (CodeQL js/polynomial-redos).
export function slugify(topic: string): string {
  const slug = topic
    .toLowerCase()
    .split(NON_SLUG)
    .filter(Boolean)
    .join("-")
    .slice(0, 60);
  return slug || "brief";
}

function asStringList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
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
