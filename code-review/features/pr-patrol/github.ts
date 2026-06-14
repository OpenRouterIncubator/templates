// Minimal GitHub REST client for pr-patrol: list open PRs and read each one's
// mergeable_state. Uses the global fetch.
const API_ROOT = "https://api.github.com";
const API_VERSION = "2022-11-28";
const PER_PAGE = 100;
const MAX_PAGES = 5;

export interface OpenPull {
  readonly draft: boolean;
  readonly htmlUrl: string;
  readonly number: number;
  readonly title: string;
  readonly updatedAt: string;
}

interface PullListItem {
  readonly draft?: boolean;
  readonly html_url?: string;
  readonly number?: number;
  readonly title?: string;
  readonly updated_at?: string;
}

interface PullDetail {
  readonly mergeable_state?: string;
}

function headers(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "ori-code-review",
    "X-GitHub-Api-Version": API_VERSION,
  };
}

async function ensureOk(response: Response, action: string): Promise<void> {
  if (!response.ok) {
    throw new Error(
      `${action} failed (HTTP ${response.status}): ${await response.text()}`
    );
  }
}

export async function listOpenPulls(
  owner: string,
  repo: string,
  token: string
): Promise<readonly OpenPull[]> {
  const pulls: OpenPull[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${API_ROOT}/repos/${owner}/${repo}/pulls?state=open&per_page=${PER_PAGE}&page=${page}`;
    const response = await fetch(url, { headers: headers(token) });
    await ensureOk(response, "List open pull requests");
    const batch = (await response.json()) as readonly PullListItem[];
    for (const item of batch) {
      pulls.push({
        draft: item.draft ?? false,
        htmlUrl: item.html_url ?? "",
        number: item.number ?? 0,
        title: item.title ?? "",
        updatedAt: item.updated_at ?? "",
      });
    }
    if (batch.length < PER_PAGE) {
      break;
    }
  }
  return pulls;
}

export async function getMergeableState(
  owner: string,
  repo: string,
  pullNumber: number,
  token: string
): Promise<string> {
  const url = `${API_ROOT}/repos/${owner}/${repo}/pulls/${pullNumber}`;
  const response = await fetch(url, { headers: headers(token) });
  if (!response.ok) {
    return "unknown";
  }
  const data = (await response.json()) as PullDetail;
  return data.mergeable_state ?? "unknown";
}
