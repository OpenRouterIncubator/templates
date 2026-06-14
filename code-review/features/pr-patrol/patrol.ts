// Pure pr-patrol logic: parse args, classify a PR's maintenance needs, and
// format the report. No I/O — unit-testable.

const DAY_MS = 86_400_000;
const DEFAULT_STALE_DAYS = 7;

export interface PatrolArgs {
  readonly repo: string;
  readonly staleDays: number;
}

export interface PullSummary {
  readonly draft: boolean;
  readonly htmlUrl: string;
  readonly mergeableState: string;
  readonly number: number;
  readonly title: string;
  readonly updatedAt: string;
}

export interface PatrolItem {
  readonly needs: readonly string[];
  readonly pull: PullSummary;
}

// GitHub mergeable_state values that mean a PR needs attention.
const STATE_NEEDS = new Map<string, string>([
  ["behind", "behind base — needs rebase"],
  ["blocked", "blocked — needs review or required checks"],
  ["dirty", "merge conflicts"],
  ["unstable", "failing checks"],
]);

export function parsePatrolArgs(args: readonly string[]): PatrolArgs {
  let repo = "";
  let staleDays = DEFAULT_STALE_DAYS;
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--repo" && value !== undefined) {
      repo = value;
      i += 1;
    } else if (args[i] === "--stale-days" && value !== undefined) {
      staleDays = Number(value);
      i += 1;
    }
  }
  return { repo, staleDays };
}

export function classify(
  pull: PullSummary,
  staleDays: number,
  now: Date
): readonly string[] {
  const needs: string[] = [];
  if (pull.draft) {
    needs.push("draft");
  }
  const stateNeed = STATE_NEEDS.get(pull.mergeableState);
  if (stateNeed !== undefined) {
    needs.push(stateNeed);
  }
  const ageDays = (now.getTime() - new Date(pull.updatedAt).getTime()) / DAY_MS;
  if (ageDays > staleDays) {
    needs.push(`stale — no update in ${Math.floor(ageDays)}d`);
  }
  return needs;
}

export function formatReport(items: readonly PatrolItem[]): string {
  if (items.length === 0) {
    return "PR patrol: no open PRs need attention.\n";
  }
  const lines = [`PR patrol: ${items.length} PR(s) need attention.`, ""];
  for (const item of items) {
    lines.push(
      `#${item.pull.number} ${item.pull.title}`,
      `  ${item.pull.htmlUrl}`,
      `  needs: ${item.needs.join(", ")}`
    );
  }
  return `${lines.join("\n")}\n`;
}
