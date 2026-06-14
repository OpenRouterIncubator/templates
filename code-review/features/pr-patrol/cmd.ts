// `ori pr-patrol run --repo <owner/name> [--stale-days N]`
//
// A working Ori command (RFC 0005.3 CommandHook): sweep a repo's open PRs and
// report which need maintenance (conflicts, rebase, blocked, failing checks,
// draft, stale). Read-only. Env: GITHUB_TOKEN (or GH_TOKEN).
//
// Also runnable directly (`bun cmd.ts --repo owner/name`) so an external trigger
// — e.g. a GitHub Actions workflow on pull_request events — can drive it without
// the ori CLI. See ../../.github/workflows/pr-patrol.yml.
import { getMergeableState, listOpenPulls } from "./github.ts";
import {
  classify,
  formatReport,
  type PatrolItem,
  parsePatrolArgs,
} from "./patrol.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;

interface PatrolContext {
  readonly env: Record<string, string | undefined>;
}

async function run(
  args: readonly string[],
  context: PatrolContext
): Promise<number> {
  const { repo, staleDays } = parsePatrolArgs(args);
  const [owner, name] = repo.split("/");
  if (owner === undefined || name === undefined || name === "") {
    process.stderr.write(
      "usage: pr-patrol run --repo <owner/name> [--stale-days N]\n"
    );
    return EXIT_USAGE;
  }
  const token = context.env.GITHUB_TOKEN ?? context.env.GH_TOKEN;
  if (token === undefined) {
    process.stderr.write("GITHUB_TOKEN (or GH_TOKEN) is required\n");
    return EXIT_USAGE;
  }

  const pulls = await listOpenPulls(owner, name, token);
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

  process.stdout.write(formatReport(items));
  return EXIT_OK;
}

const command = {
  description: "Sweep a repo's open PRs and report which need maintenance.",
  name: "run",
  run,
  type: "commandHook" as const,
};

export default command;

if (import.meta.main) {
  process.exit(await run(process.argv.slice(2), { env: process.env }));
}
