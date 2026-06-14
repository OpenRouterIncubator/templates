// `ori code-review review-pr <owner/repo#N | PR url> [--format json]`
//
// A working Ori command (RFC 0005.3 CommandHook): fetch the PR diff from GitHub,
// ask one or two models (via OpenRouter) for findings, add a local secret-grep
// pass, resolve findings onto valid diff lines, drop ones already raised, and
// post an inline review — or print JSON with --format json.
//
// Env: GITHUB_TOKEN (or GH_TOKEN), OPENROUTER_API_KEY, optional REVIEW_MODEL and
// REVIEW_MODEL_SECONDARY (a second model whose findings are merged in).
import { hunkIndex } from "./diff.ts";
import {
  createReview,
  fetchPullRequest,
  headChecksFailing,
  listChangedFiles,
  listReviewComments,
} from "./github.ts";
import { requestFindings } from "./openrouter.ts";
import { parsePullRequestRef } from "./pr-ref.ts";
import { buildReview, buildReviewPrompt, dedupeFindings } from "./review.ts";
import { scanSecrets } from "./security.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

interface ReviewContext {
  readonly env: Record<string, string | undefined>;
}

interface Args {
  readonly json: boolean;
  readonly ref: string;
}

function parseArgs(args: readonly string[]): Args {
  let json = false;
  let ref = "";
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--format") {
      json = args[i + 1] === "json";
      i += 1;
    } else if (ref === "" && arg !== undefined) {
      ref = arg;
    }
  }
  return { json, ref };
}

async function run(
  args: readonly string[],
  context: ReviewContext
): Promise<number> {
  const parsed = parseArgs(args);
  const ref = parsePullRequestRef(parsed.ref);
  if (ref === null) {
    process.stderr.write(
      "usage: review-pr <owner/repo#N | PR url> [--format json]\n"
    );
    return EXIT_USAGE;
  }

  const githubToken = context.env.GITHUB_TOKEN ?? context.env.GH_TOKEN;
  const openrouterKey = context.env.OPENROUTER_API_KEY;
  if (githubToken === undefined || openrouterKey === undefined) {
    process.stderr.write(
      "GITHUB_TOKEN (or GH_TOKEN) and OPENROUTER_API_KEY are required\n"
    );
    return EXIT_USAGE;
  }

  const pr = await fetchPullRequest(ref, githubToken);
  if (pr.state !== "open") {
    process.stdout.write(`PR is ${pr.state}; skipping review.\n`);
    return EXIT_OK;
  }
  if (await headChecksFailing(ref, pr.headSha, githubToken)) {
    process.stdout.write(
      "CI is already failing; skipping review until it's green.\n"
    );
    return EXIT_OK;
  }

  const files = await listChangedFiles(ref, githubToken);
  const prompt = buildReviewPrompt(pr, files);
  const models = modelList(context.env);

  const [modelResults, existing] = await Promise.all([
    Promise.all(
      models.map((model) =>
        requestFindings({ apiKey: openrouterKey, model, prompt })
      )
    ),
    listReviewComments(ref, githubToken),
  ]);

  const findings = dedupeFindings([
    ...modelResults.flat(),
    ...scanSecrets(files),
  ]);
  const review = buildReview({
    existing,
    findings,
    hunksByPath: hunkIndex(files),
  });

  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(review, null, 2)}\n`);
    return EXIT_OK;
  }

  await createReview(ref, githubToken, review);
  process.stdout.write(
    `Posted ${review.comments.length} comment(s) on ${ref.owner}/${ref.repo}#${ref.number} using ${models.length} model(s); verdict: ${review.event}\n`
  );
  return EXIT_OK;
}

function modelList(env: Record<string, string | undefined>): readonly string[] {
  const primary = env.REVIEW_MODEL ?? DEFAULT_MODEL;
  const secondary = env.REVIEW_MODEL_SECONDARY;
  return secondary === undefined || secondary === primary
    ? [primary]
    : [primary, secondary];
}

const command = {
  description:
    "Review a GitHub pull request and post inline comments with a verdict.",
  name: "review-pr",
  run,
  type: "commandHook" as const,
};

export default command;
