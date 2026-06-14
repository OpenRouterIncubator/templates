// `ori code-review search-pr --repo <owner/repo> [--author X] [--reviewer X]
//    [--involves X] [--state open|closed] [--since <days>]`
//
// A working Ori command (RFC 0005.3 CommandHook): runs a scoped, time-windowed
// GitHub PR search. Requires GITHUB_TOKEN (or GH_TOKEN) in the command env.
import { buildSearchQuery, hasScope, parseSearchArgs } from "./search.ts";

const API_ROOT = "https://api.github.com";
const API_VERSION = "2022-11-28";
const PER_PAGE = 30;
const EXIT_OK = 0;
const EXIT_USAGE = 2;

interface SearchContext {
  readonly env: Record<string, string | undefined>;
}

interface SearchItem {
  readonly html_url?: string;
  readonly number?: number;
  readonly title?: string;
}

interface SearchResponse {
  readonly items?: readonly SearchItem[];
}

async function run(
  args: readonly string[],
  context: SearchContext
): Promise<number> {
  const options = parseSearchArgs(args);
  if (!hasScope(options)) {
    process.stderr.write("search-pr requires --org or --repo (always scope)\n");
    return EXIT_USAGE;
  }
  const token = context.env.GITHUB_TOKEN ?? context.env.GH_TOKEN;
  if (token === undefined) {
    process.stderr.write("GITHUB_TOKEN (or GH_TOKEN) is required\n");
    return EXIT_USAGE;
  }

  const query = buildSearchQuery(options, new Date());
  const url = `${API_ROOT}/search/issues?per_page=${PER_PAGE}&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "ori-code-review",
      "X-GitHub-Api-Version": API_VERSION,
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    process.stderr.write(
      `Search failed (HTTP ${response.status}): ${detail}\n`
    );
    return EXIT_USAGE;
  }

  const data = (await response.json()) as SearchResponse;
  const items = data.items ?? [];
  for (const item of items) {
    process.stdout.write(
      `#${item.number ?? "?"}  ${item.title ?? ""}\n  ${item.html_url ?? ""}\n`
    );
  }
  process.stdout.write(`${items.length} result(s) for: ${query}\n`);
  return EXIT_OK;
}

const command = {
  description:
    "Search GitHub for pull requests, always org/repo-scoped and time-windowed.",
  name: "search-pr",
  run,
  type: "commandHook" as const,
};

export default command;
