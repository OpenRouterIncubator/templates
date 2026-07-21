// `/review-pr <owner/repo#N | PR url> [--format json]`
//
// A working Ori command contribution (feature-root `command.ts`, registered as
// `/review-pr`): fetch the PR diff from GitHub, ask one or two models (via
// OpenRouter) for findings, add a local secret-grep pass, resolve findings onto
// valid diff lines, drop ones already raised, and post an inline review — or
// return the review as structured data with `--format json`.
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
  type ReviewSubmission,
} from "./github.ts";
import { requestFindings } from "./openrouter.ts";
import { parsePullRequestRef } from "./pr-ref.ts";
import { buildReview, buildReviewPrompt, dedupeFindings } from "./review.ts";
import { scanSecrets } from "./security.ts";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

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
  readonly format: string;
  readonly ref: string;
}

function modelList(
  env: Readonly<Record<string, string | undefined>>
): readonly string[] {
  const primary = env.REVIEW_MODEL ?? DEFAULT_MODEL;
  const secondary = env.REVIEW_MODEL_SECONDARY;
  return secondary === undefined || secondary === primary
    ? [primary]
    : [primary, secondary];
}

function reviewData(review: ReviewSubmission): JsonValue {
  return {
    body: review.body,
    comments: review.comments.map((comment) => ({
      body: comment.body,
      line: comment.line,
      path: comment.path,
      side: comment.side,
    })),
    event: review.event,
  };
}

async function run(ctx: CommandContext<Args>): Promise<CommandResult> {
  const ref = parsePullRequestRef(ctx.args.ref);
  if (ref === null) {
    return {
      message: "expected a PR reference: owner/repo#N or a pull request URL",
      ok: false,
    };
  }

  const githubToken = ctx.env.GITHUB_TOKEN ?? ctx.env.GH_TOKEN;
  const openrouterKey = ctx.env.OPENROUTER_API_KEY;
  if (githubToken === undefined || openrouterKey === undefined) {
    return {
      message: "GITHUB_TOKEN (or GH_TOKEN) and OPENROUTER_API_KEY are required",
      ok: false,
    };
  }

  const pr = await fetchPullRequest(ref, githubToken);
  if (pr.state !== "open") {
    return { message: `PR is ${pr.state}; skipping review.`, ok: true };
  }
  if (await headChecksFailing(ref, pr.headSha, githubToken)) {
    return {
      message: "CI is already failing; skipping review until it's green.",
      ok: true,
    };
  }

  const files = await listChangedFiles(ref, githubToken);
  const prompt = buildReviewPrompt(pr, files);
  const models = modelList(ctx.env);
  ctx.log(
    `Reviewing ${ref.owner}/${ref.repo}#${ref.number} (${files.length} changed file(s)) with ${models.length} model(s)…`
  );

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

  if (ctx.args.format === "json") {
    return {
      data: reviewData(review),
      message: `Prepared ${review.comments.length} comment(s) for ${ref.owner}/${ref.repo}#${ref.number}; verdict: ${review.event} (not posted)`,
      ok: true,
    };
  }

  await createReview(ref, githubToken, review);
  return {
    message: `Posted ${review.comments.length} comment(s) on ${ref.owner}/${ref.repo}#${ref.number} using ${models.length} model(s); verdict: ${review.event}`,
    ok: true,
  };
}

export const command = {
  arguments: {
    format: {
      default: "text",
      description:
        'Output format: "json" returns the review as structured data instead of posting it',
      type: "string" as const,
    },
    ref: {
      description: "The pull request to review: owner/repo#N or a PR URL",
      positional: true,
      required: true,
      type: "string" as const,
    },
  },
  description:
    "Review a GitHub pull request and post inline comments with a verdict.",
  run,
};
