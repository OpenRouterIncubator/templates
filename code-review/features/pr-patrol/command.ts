// `/pr-patrol --repo <owner/name> [--stale-days N]`
//
// A working Ori command contribution (feature-root `command.ts`, registered as
// `/pr-patrol`): sweep a repo's open PRs and report which need maintenance
// (conflicts, rebase, blocked, failing checks, draft, stale). Read-only.
// Env: GITHUB_TOKEN (or GH_TOKEN).
//
// Also runnable directly (`bun command.ts --repo owner/name`) so an external
// trigger — e.g. a GitHub Actions workflow on pull_request events — can drive it
// without the ori CLI. See ../../.github/workflows/pr-patrol.yml. Only that
// script entry writes to stdio; the contribution itself streams via `ctx.log`.
import { getMergeableState, listOpenPulls } from "./github.ts";
import {
  classify,
  formatReport,
  type PatrolItem,
  parsePatrolArgs,
} from "./patrol.ts";

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
  readonly repo: string;
  readonly "stale-days": number;
}

function patrolData(items: readonly PatrolItem[]): JsonValue {
  return items.map((item) => ({
    needs: item.needs,
    pull: {
      draft: item.pull.draft,
      htmlUrl: item.pull.htmlUrl,
      mergeableState: item.pull.mergeableState,
      number: item.pull.number,
      title: item.pull.title,
      updatedAt: item.pull.updatedAt,
    },
  }));
}

async function patrol(
  repo: string,
  staleDays: number,
  env: Readonly<Record<string, string | undefined>>,
  log: (line: string) => void
): Promise<CommandResult> {
  const [owner, name] = repo.split("/");
  if (
    owner === undefined ||
    owner === "" ||
    name === undefined ||
    name === ""
  ) {
    return {
      message: "usage: /pr-patrol --repo <owner/name> [--stale-days N]",
      ok: false,
    };
  }
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN;
  if (token === undefined) {
    return { message: "GITHUB_TOKEN (or GH_TOKEN) is required", ok: false };
  }

  const pulls = await listOpenPulls(owner, name, token);
  log(`Sweeping ${pulls.length} open PR(s) in ${owner}/${name}…`);
  const now = new Date();
  const items: PatrolItem[] = [];
  for (const pull of pulls) {
    const mergeableState = await getMergeableState(
      owner,
      name,
      pull.number,
      token
    );
    const summary = { ...pull, mergeableState };
    const needs = classify(summary, staleDays, now);
    if (needs.length > 0) {
      items.push({ needs, pull: summary });
    }
  }

  return {
    data: patrolData(items),
    message: formatReport(items).trimEnd(),
    ok: true,
  };
}

export const command = {
  arguments: {
    repo: {
      description: "The repository to patrol (owner/name)",
      required: true,
      type: "string" as const,
    },
    "stale-days": {
      default: 7,
      description: "Days without an update before a PR counts as stale",
      type: "number" as const,
    },
  },
  description: "Sweep a repo's open PRs and report which need maintenance.",
  run: (ctx: CommandContext<Args>) =>
    patrol(ctx.args.repo, ctx.args["stale-days"], ctx.env, ctx.log),
};

// Direct script entry for external triggers (GitHub Actions); not part of the
// contribution, so writing to stdio here is fine.
if (import.meta.main) {
  const { repo, staleDays } = parsePatrolArgs(process.argv.slice(2));
  const result = await patrol(repo, staleDays, process.env, (line) => {
    process.stdout.write(`${line}\n`);
  });
  const stream = result.ok ? process.stdout : process.stderr;
  stream.write(`${result.message ?? ""}\n`);
  process.exit(result.ok ? 0 : 1);
}
