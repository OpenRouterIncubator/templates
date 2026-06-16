// Pure finding model: parse/validate model output, then aggregate candidate
// findings from many (dimension, model) passes into ranked, vote-weighted
// findings. Voting across models is this harness's false-positive filter — a
// plain suggestion needs corroboration; a must-fix surfaces on a single vote.

export type Severity = "must-fix" | "suggestion";

export interface Finding {
  readonly body: string;
  readonly line: number;
  readonly path: string;
  readonly severity: Severity;
}

// One model's take on a finding, tagged with where it came from.
export interface Candidate {
  readonly dimension: string;
  readonly finding: Finding;
  readonly model: string;
}

export interface RankedFinding extends Finding {
  readonly confidence: number;
  readonly dimensions: readonly string[];
  readonly models: readonly string[];
  readonly votes: number;
}

export interface AggregateResult {
  readonly confirmed: readonly RankedFinding[];
  readonly demoted: readonly RankedFinding[];
}

export type Verdict = "APPROVE" | "COMMENT" | "REQUEST_CHANGES";

// Parse `{"findings":[...]}` (or a bare array) and keep only well-formed items.
export function parseFindings(jsonText: string): readonly Finding[] {
  const list = extractList(safeParse(jsonText));
  const findings: Finding[] = [];
  for (const item of list) {
    const finding = toFinding(item);
    if (finding !== null) {
      findings.push(finding);
    }
  }
  return findings;
}

// Group candidates by location+text, count distinct voting models, and split
// into confirmed vs demoted (low-confidence) sets, each ranked high-signal first.
export function aggregateFindings(
  candidates: readonly Candidate[],
  modelCount: number
): AggregateResult {
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = findingKey(candidate.finding);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [candidate]);
    } else {
      group.push(candidate);
    }
  }

  const ranked = [...groups.values()]
    .map((group) => toRanked(group, modelCount))
    .sort(byRank);
  return {
    confirmed: ranked.filter((finding) => isConfirmed(finding, modelCount)),
    demoted: ranked.filter((finding) => !isConfirmed(finding, modelCount)),
  };
}

export function chooseVerdict(confirmed: readonly RankedFinding[]): Verdict {
  if (confirmed.some((finding) => finding.severity === "must-fix")) {
    return "REQUEST_CHANGES";
  }
  return confirmed.length === 0 ? "APPROVE" : "COMMENT";
}

export function findingKey(finding: Finding): string {
  return `${finding.path}:${finding.line}:${normalize(finding.body)}`;
}

// A must-fix needs a single vote; a suggestion needs a majority. With a single
// model there is nothing to vote on, so everything is taken at face value.
function isConfirmed(finding: RankedFinding, modelCount: number): boolean {
  if (modelCount <= 1) {
    return true;
  }
  if (finding.severity === "must-fix") {
    return finding.votes >= 1;
  }
  // A suggestion must clear a majority and never pass on a lone vote.
  return finding.votes >= 2 && finding.votes >= Math.ceil(modelCount / 2);
}

function toRanked(
  group: readonly Candidate[],
  modelCount: number
): RankedFinding {
  const models = unique(group.map((candidate) => candidate.model));
  const dimensions = unique(group.map((candidate) => candidate.dimension));
  const severity: Severity = group.some(
    (candidate) => candidate.finding.severity === "must-fix"
  )
    ? "must-fix"
    : "suggestion";
  const first = group[0]?.finding;
  return {
    body: first?.body ?? "",
    confidence: modelCount === 0 ? 0 : models.length / modelCount,
    dimensions,
    line: first?.line ?? 0,
    models,
    path: first?.path ?? "",
    severity,
    votes: models.length,
  };
}

function byRank(left: RankedFinding, right: RankedFinding): number {
  if (left.severity !== right.severity) {
    return left.severity === "must-fix" ? -1 : 1;
  }
  if (left.confidence !== right.confidence) {
    return right.confidence - left.confidence;
  }
  return left.path.localeCompare(right.path);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
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

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
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
