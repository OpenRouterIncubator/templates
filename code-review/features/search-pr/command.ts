// `/search-pr --repo <owner/repo> [--author X] [--reviewer X] [--involves X]
//    [--state open|closed] [--since <days>]`
//
// A working Ori command contribution (feature-root `command.ts`, registered as
// `/search-pr`): runs a scoped, time-windowed GitHub PR search. Requires
// GITHUB_TOKEN (or GH_TOKEN) in the command env.
import { buildSearchQuery, hasScope, type SearchOptions } from "./search.ts";

const API_ROOT = "https://api.github.com";
const API_VERSION = "2022-11-28";
const PER_PAGE = 30;
const DEFAULT_SINCE_DAYS = 30;

// Minimal local mirror of Ori's author command contract. Templates are
// standalone Bun workspaces and do not depend on `@ori-contracts/author`
// (the runtime validates the contribution structurally at load), so we
// redeclare just the shapes this command uses.
type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

interface CommandContext<Args> {
  readonly args: Args;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly log: (line: string) => void;
}

interface CommandResult {
  readonly data?: JsonValue;
  readonly message?: string;
  readonly ok: boolean;
}

interface Args {
  readonly author?: string;
  readonly involves?: string;
  readonly org?: string;
  readonly repo?: string;
  readonly reviewer?: string;
  readonly since: number;
  readonly state?: string;
}

interface SearchItem {
  readonly html_url?: string;
  readonly number?: number;
  readonly title?: string;
}

interface SearchResponse {
  readonly items?: readonly SearchItem[];
}

async function run(ctx: CommandContext<Args>): Promise<CommandResult> {
  const { state } = ctx.args;
  if (state !== undefined && state !== "open" && state !== "closed") {
    return { message: '--state must be "open" or "closed"', ok: false };
  }
  const options: SearchOptions = {
    author: ctx.args.author,
    involves: ctx.args.involves,
    org: ctx.args.org,
    repo: ctx.args.repo,
    reviewer: ctx.args.reviewer,
    sinceDays: ctx.args.since,
    state,
  };
  if (!hasScope(options)) {
    return {
      message: "search-pr requires --org or --repo (always scope)",
      ok: false,
    };
  }
  const token = ctx.env.GITHUB_TOKEN ?? ctx.env.GH_TOKEN;
  if (token === undefined) {
    return { message: "GITHUB_TOKEN (or GH_TOKEN) is required", ok: false };
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
    return {
      message: `Search failed (HTTP ${response.status}): ${detail}`,
      ok: false,
    };
  }

  const data = (await response.json()) as SearchResponse;
  const items = data.items ?? [];
  for (const item of items) {
    ctx.log(`#${item.number ?? "?"}  ${item.title ?? ""}`);
    ctx.log(`  ${item.html_url ?? ""}`);
  }
  return {
    data: items.map((item) => ({
      number: item.number ?? null,
      title: item.title ?? "",
      url: item.html_url ?? "",
    })),
    message: `${items.length} result(s) for: ${query}`,
    ok: true,
  };
}

export const command = {
  arguments: {
    author: {
      description: "Only PRs authored by this user",
      type: "string" as const,
    },
    involves: {
      description: "Only PRs involving this user (author, reviewer, mention)",
      type: "string" as const,
    },
    org: {
      description: "Scope the search to this GitHub organization",
      type: "string" as const,
    },
    repo: {
      description: "Scope the search to this repository (owner/repo)",
      type: "string" as const,
    },
    reviewer: {
      description: "Only PRs reviewed by this user",
      type: "string" as const,
    },
    since: {
      default: DEFAULT_SINCE_DAYS,
      description: "Time window in days (only PRs created since then)",
      type: "number" as const,
    },
    state: {
      description: 'Filter by PR state: "open" or "closed"',
      type: "string" as const,
    },
  },
  description:
    "Search GitHub for pull requests, always org/repo-scoped and time-windowed.",
  run,
};
