// Parse a pull-request reference from "owner/repo#123" or a GitHub PR URL.
// Ported from the review-pr command so this harness stays self-contained.

export interface PullRequestRef {
  readonly number: number;
  readonly owner: string;
  readonly repo: string;
}

const SHORT = /^([\w.-]+)\/([\w.-]+)#(\d+)$/;
const URL = /github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/;

export function parsePullRequestRef(input: string): PullRequestRef | null {
  const match = SHORT.exec(input.trim()) ?? URL.exec(input.trim());
  if (match === null) {
    return null;
  }
  const [, owner, repo, number] = match;
  if (owner === undefined || repo === undefined || number === undefined) {
    return null;
  }
  return { number: Number(number), owner, repo };
}
