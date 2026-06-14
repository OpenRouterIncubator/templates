// Minimal GitHub REST client for pull-request review, using the global fetch.
// Implements only what review-pr needs: read the PR, read its changed files,
// and submit a review with inline comments.
import type { PullRequestRef } from "./pr-ref.ts";

const API_ROOT = "https://api.github.com";
const API_VERSION = "2022-11-28";
const PER_PAGE = 100;
const MAX_PAGES = 10;

export interface ChangedFile {
  readonly additions: number;
  readonly deletions: number;
  readonly filename: string;
  readonly patch?: string;
  readonly status: string;
}

export interface PullRequest {
  readonly body: string;
  readonly headSha: string;
  readonly state: string;
  readonly title: string;
}

export type ReviewEvent = "APPROVE" | "COMMENT" | "REQUEST_CHANGES";

export interface ReviewComment {
  readonly body: string;
  readonly line: number;
  readonly path: string;
  readonly side: "LEFT" | "RIGHT";
}

export interface ReviewSubmission {
  readonly body: string;
  readonly comments: readonly ReviewComment[];
  readonly event: ReviewEvent;
}

interface PrResponse {
  readonly body?: string | null;
  readonly head?: { readonly sha?: string };
  readonly state?: string;
  readonly title?: string;
}

interface FileResponse {
  readonly additions?: number;
  readonly deletions?: number;
  readonly filename?: string;
  readonly patch?: string;
  readonly status?: string;
}

function headers(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "ori-code-review",
    "X-GitHub-Api-Version": API_VERSION,
  };
}

function pullPath(ref: PullRequestRef): string {
  return `${API_ROOT}/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`;
}

async function ensureOk(response: Response, action: string): Promise<void> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${action} failed (HTTP ${response.status}): ${detail}`);
  }
}

export async function fetchPullRequest(
  ref: PullRequestRef,
  token: string
): Promise<PullRequest> {
  const response = await fetch(pullPath(ref), { headers: headers(token) });
  await ensureOk(response, "Fetch pull request");
  const data = (await response.json()) as PrResponse;
  return {
    body: data.body ?? "",
    headSha: data.head?.sha ?? "",
    state: data.state ?? "unknown",
    title: data.title ?? "",
  };
}

export async function listChangedFiles(
  ref: PullRequestRef,
  token: string
): Promise<readonly ChangedFile[]> {
  const files: ChangedFile[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${pullPath(ref)}/files?per_page=${PER_PAGE}&page=${page}`;
    const response = await fetch(url, { headers: headers(token) });
    await ensureOk(response, "List changed files");
    const batch = (await response.json()) as readonly FileResponse[];
    for (const file of batch) {
      files.push({
        additions: file.additions ?? 0,
        deletions: file.deletions ?? 0,
        filename: file.filename ?? "",
        patch: file.patch,
        status: file.status ?? "",
      });
    }
    if (batch.length < PER_PAGE) {
      break;
    }
  }
  return files;
}

export async function createReview(
  ref: PullRequestRef,
  token: string,
  review: ReviewSubmission
): Promise<void> {
  const response = await fetch(`${pullPath(ref)}/reviews`, {
    body: JSON.stringify(review),
    headers: { ...headers(token), "Content-Type": "application/json" },
    method: "POST",
  });
  await ensureOk(response, "Create review");
}

interface CommentResponse {
  readonly body?: string;
  readonly line?: number | null;
  readonly path?: string;
}

export interface ExistingComment {
  readonly body: string;
  readonly line: number | null;
  readonly path: string;
}

export async function listReviewComments(
  ref: PullRequestRef,
  token: string
): Promise<readonly ExistingComment[]> {
  const comments: ExistingComment[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${pullPath(ref)}/comments?per_page=${PER_PAGE}&page=${page}`;
    const response = await fetch(url, { headers: headers(token) });
    await ensureOk(response, "List review comments");
    const batch = (await response.json()) as readonly CommentResponse[];
    for (const comment of batch) {
      comments.push({
        body: comment.body ?? "",
        line: comment.line ?? null,
        path: comment.path ?? "",
      });
    }
    if (batch.length < PER_PAGE) {
      break;
    }
  }
  return comments;
}

interface CheckRunsResponse {
  readonly check_runs?: readonly { readonly conclusion?: string | null }[];
}

const FAILING_CONCLUSIONS = new Set([
  "action_required",
  "cancelled",
  "failure",
  "timed_out",
]);

// True if any check run on the head commit has a failing conclusion. Returns
// false when checks can't be read, so a missing checks API never blocks review.
export async function headChecksFailing(
  ref: PullRequestRef,
  sha: string,
  token: string
): Promise<boolean> {
  const url = `${API_ROOT}/repos/${ref.owner}/${ref.repo}/commits/${sha}/check-runs?per_page=${PER_PAGE}`;
  const response = await fetch(url, { headers: headers(token) });
  if (!response.ok) {
    return false;
  }
  const data = (await response.json()) as CheckRunsResponse;
  const runs = data.check_runs ?? [];
  return runs.some(
    (run) =>
      run.conclusion !== null &&
      run.conclusion !== undefined &&
      FAILING_CONCLUSIONS.has(run.conclusion)
  );
}
