// Build a scoped, time-windowed GitHub PR search query. Pure / testable.
// Scope (org or repo) plus a time window keep results relevant and stop
// unscoped author:/reviewed-by:/involves: queries from leaking unrelated PRs.

const DAY_MS = 86_400_000;
const DATE_LEN = 10;

export interface SearchOptions {
  readonly author?: string;
  readonly involves?: string;
  readonly org?: string;
  readonly repo?: string;
  readonly reviewer?: string;
  readonly sinceDays: number;
  readonly state?: "closed" | "open";
}

export function hasScope(options: SearchOptions): boolean {
  return options.org !== undefined || options.repo !== undefined;
}

export function buildSearchQuery(options: SearchOptions, now: Date): string {
  const parts: string[] = ["is:pr"];
  if (options.repo !== undefined) {
    parts.push(`repo:${options.repo}`);
  } else if (options.org !== undefined) {
    parts.push(`org:${options.org}`);
  }
  if (options.state !== undefined) {
    parts.push(`is:${options.state}`);
  }
  if (options.author !== undefined) {
    parts.push(`author:${options.author}`);
  }
  if (options.reviewer !== undefined) {
    parts.push(`reviewed-by:${options.reviewer}`);
  }
  if (options.involves !== undefined) {
    parts.push(`involves:${options.involves}`);
  }
  parts.push(`created:>=${cutoffDate(options.sinceDays, now)}`);
  return parts.join(" ");
}

function cutoffDate(sinceDays: number, now: Date): string {
  return new Date(now.getTime() - sinceDays * DAY_MS)
    .toISOString()
    .slice(0, DATE_LEN);
}
