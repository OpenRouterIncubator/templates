// The review orchestration, as an async generator of pipeline events. Resolve
// the diff (PR or local) -> fan out the review dimensions -> run each across an
// ensemble of models -> vote/rank the merged findings -> stream a verdict, and
// (opt-in) post a GitHub review. Kept free of Ori types; `events.ts` projects
// the emitted pipeline events onto the runtime contract.
import { streamChat } from "./chat.ts";
import type { HarnessInvokeOptions } from "./contract.ts";
import { type ChangedFile, hunkIndex } from "./diff.ts";
import { buildDimensionPrompt, DIMENSIONS, renderDiff } from "./dimensions.ts";
import type { PipelineEvent } from "./events.ts";
import {
  aggregateFindings,
  type Candidate,
  chooseVerdict,
  type Finding,
} from "./findings.ts";
import {
  createReview,
  fetchPullRequest,
  listChangedFiles,
  listReviewComments,
} from "./github.ts";
import { resolveGitHubToken } from "./github-token.ts";
import { collectLocalDiff } from "./local-diff.ts";
import { requestFindings } from "./openrouter.ts";
import {
  getPreferences,
  parsePostingPreference,
  setPreferences,
} from "./preferences.ts";
import { buildReport, buildReviewSubmission, emptyReport } from "./report.ts";
import {
  parseTarget,
  type ReviewTarget,
  resolvePostDecision,
} from "./target.ts";

const DEFAULT_MODELS = [
  "anthropic/claude-sonnet-4.5",
  "openai/gpt-4.1",
] as const;

interface ResolvedDiff {
  readonly files: readonly ChangedFile[];
  readonly title: string;
}

export async function* runReview(
  options: HarnessInvokeOptions
): AsyncGenerator<PipelineEvent> {
  // Ori keeps secrets out of options.env (like the built-in harness), so merge
  // the daemon's process env underneath and let options.env override.
  const env = { ...process.env, ...(options.env ?? {}) };
  const sessionId = options.sessionId;
  const target = parseTarget(options.prompt);

  // Conversational config: set a standing posting preference for the session.
  // Only when the prompt isn't aimed at a PR — there, "don't post" is a one-off.
  if (target.mode !== "pr") {
    const preference = parsePostingPreference(options.prompt);
    if (preference !== null) {
      setPreferences(sessionId, { autopost: preference });
      yield { kind: "chat", text: confirmPosting(preference) };
      yield { kind: "ended", ok: true };
      return;
    }
  }

  const apiKey = read(env, "OPENROUTER_API_KEY");
  if (apiKey === undefined) {
    yield {
      kind: "error",
      message: "OPENROUTER_API_KEY is required to run a review.",
    };
    yield { error: "missing OPENROUTER_API_KEY", kind: "ended", ok: false };
    return;
  }

  if (target.mode === "chat") {
    yield* runChat(options, env, apiKey);
    return;
  }

  // Only resolve a token for PR mode, and try gh/git before giving up, so local
  // review never shells out and PR review works for already-signed-in users.
  const token =
    target.mode === "pr" ? await resolveGitHubToken(env) : undefined;
  const post =
    target.mode === "pr"
      ? resolvePostDecision(options.prompt, getPreferences(sessionId).autopost)
      : false;

  yield {
    input: describeTarget(target),
    kind: "tool-start",
    name: "resolve-diff",
  };
  let resolved: ResolvedDiff;
  try {
    resolved = await resolveDiff(target, token, options.cwd);
  } catch (cause) {
    yield {
      isError: true,
      kind: "tool-done",
      name: "resolve-diff",
      result: { error: messageOf(cause) },
    };
    yield { kind: "error", message: messageOf(cause) };
    yield { error: messageOf(cause), kind: "ended", ok: false };
    return;
  }

  const reviewable = resolved.files.filter((file) => file.patch !== undefined);
  yield {
    isError: false,
    kind: "tool-done",
    name: "resolve-diff",
    result: { files: reviewable.length },
  };

  if (reviewable.length === 0) {
    yield { kind: "status", text: "No changed lines to review." };
    yield { kind: "report", markdown: emptyReport(resolved.title) };
    yield { kind: "ended", ok: true };
    return;
  }

  const models = resolveModels(env, options.model);
  yield {
    kind: "status",
    text: `Reviewing ${reviewable.length} file(s) across ${DIMENSIONS.length} dimensions with ${models.length} model(s)…`,
  };

  const { attempted, candidates, succeeded } = yield* runDimensions(
    apiKey,
    models,
    resolved.title,
    renderDiff(reviewable)
  );

  // Fail closed: when every model call failed we have no signal at all, so an
  // empty candidate list would otherwise vote through an APPROVE (and, in PR
  // mode, post it). Surface the failure instead of producing a report.
  if (attempted > 0 && succeeded === 0) {
    yield {
      kind: "error",
      message: "all model calls failed — cannot review",
    };
    yield {
      error: "all model calls failed",
      kind: "ended",
      ok: false,
    };
    return;
  }

  const { confirmed, demoted } = aggregateFindings(candidates, models.length);
  for (const finding of confirmed) {
    yield { finding, kind: "finding" };
  }

  const verdict = chooseVerdict(confirmed);
  yield {
    kind: "report",
    markdown: buildReport({
      confirmed,
      demotedCount: demoted.length,
      files: reviewable,
      models,
      title: resolved.title,
      verdict,
    }),
  };

  if (target.mode === "pr" && post && token !== undefined) {
    yield* postReview(target, token, confirmed, verdict, reviewable);
  }

  yield { kind: "ended", ok: true };
}

// Non-review prompts: stream a normal assistant reply, honoring the persona
// system prompt, so the intern stays conversational instead of forcing a review.
async function* runChat(
  options: HarnessInvokeOptions,
  env: Record<string, string | undefined>,
  apiKey: string
): AsyncGenerator<PipelineEvent> {
  const model = resolveModels(env, options.model)[0] ?? DEFAULT_MODELS[0];
  try {
    for await (const delta of streamChat({
      apiKey,
      model,
      prompt: options.prompt,
      system: options.systemPrompt,
      temperature: options.temperature,
    })) {
      yield { kind: "chat", text: delta };
    }
    yield { kind: "ended", ok: true };
  } catch (cause) {
    yield { kind: "error", message: messageOf(cause) };
    yield { error: messageOf(cause), kind: "ended", ok: false };
  }
}

// The flat candidate list for voting, plus how many model calls were attempted
// vs actually succeeded so the caller can fail closed when none came back.
interface DimensionRun {
  readonly attempted: number;
  readonly candidates: Candidate[];
  readonly succeeded: number;
}

// Fan the review dimensions out, each across the model ensemble, streaming
// progress and tool events; returns the candidates plus the success tally.
async function* runDimensions(
  apiKey: string,
  models: readonly string[],
  title: string,
  diffText: string
): AsyncGenerator<PipelineEvent, DimensionRun> {
  const all: Candidate[] = [];
  let attempted = 0;
  let succeeded = 0;
  for (const dimension of DIMENSIONS) {
    yield { kind: "dimension-start", title: dimension.title };
    for (const model of models) {
      yield {
        input: { dimension: dimension.id },
        kind: "tool-start",
        name: `model:${model}`,
      };
    }
    const settled = await Promise.allSettled(
      models.map((model) =>
        requestFindings({
          apiKey,
          model,
          prompt: buildDimensionPrompt(title, diffText),
          system: dimension.system,
        })
      )
    );
    const result = collectDimensionResults(dimension.id, models, settled);
    for (const event of result.events) {
      yield event;
    }
    all.push(...result.candidates);
    attempted += result.attempted;
    succeeded += result.succeeded;
    yield {
      count: result.candidates.length,
      kind: "dimension-done",
      title: dimension.title,
    };
  }
  return { attempted, candidates: all, succeeded };
}

// Turn one dimension's settled model calls into candidates plus the tool-done
// events that report each model's outcome, and tally attempts vs successes.
function collectDimensionResults(
  dimensionId: string,
  models: readonly string[],
  settled: readonly PromiseSettledResult<readonly Finding[]>[]
): {
  attempted: number;
  candidates: Candidate[];
  events: PipelineEvent[];
  succeeded: number;
} {
  const candidates: Candidate[] = [];
  const events: PipelineEvent[] = [];
  let attempted = 0;
  let succeeded = 0;
  for (let index = 0; index < settled.length; index += 1) {
    const model = models[index];
    const result = settled[index];
    if (model === undefined || result === undefined) {
      continue;
    }
    attempted += 1;
    if (result.status === "fulfilled") {
      succeeded += 1;
      for (const finding of result.value) {
        candidates.push({ dimension: dimensionId, finding, model });
      }
      events.push({
        isError: false,
        kind: "tool-done",
        name: `model:${model}`,
        result: { findings: result.value.length },
      });
    } else {
      events.push({
        isError: true,
        kind: "tool-done",
        name: `model:${model}`,
        result: { error: messageOf(result.reason) },
      });
    }
  }
  return { attempted, candidates, events, succeeded };
}

async function resolveDiff(
  target: ReviewTarget,
  token: string | undefined,
  cwd: string | undefined
): Promise<ResolvedDiff> {
  if (target.mode === "pr") {
    if (token === undefined) {
      throw new Error(
        "No GitHub token found. Set GITHUB_TOKEN/GH_TOKEN, run `gh auth login`, or configure a git credential helper, then retry."
      );
    }
    const [pr, files] = await Promise.all([
      fetchPullRequest(target.ref, token),
      listChangedFiles(target.ref, token),
    ]);
    return {
      files,
      title: `${target.ref.owner}/${target.ref.repo}#${target.ref.number} — ${pr.title}`,
    };
  }
  const files = await collectLocalDiff(cwd ?? process.cwd());
  return { files, title: "local working changes" };
}

async function* postReview(
  target: Extract<ReviewTarget, { mode: "pr" }>,
  token: string,
  confirmed: Parameters<typeof buildReviewSubmission>[0],
  verdict: Parameters<typeof buildReviewSubmission>[1],
  files: readonly ChangedFile[]
): AsyncGenerator<PipelineEvent> {
  yield {
    input: {
      ref: `${target.ref.owner}/${target.ref.repo}#${target.ref.number}`,
    },
    kind: "tool-start",
    name: "post-review",
  };
  try {
    const existing = await listReviewComments(target.ref, token).catch(
      () => []
    );
    const submission = buildReviewSubmission(
      confirmed,
      verdict,
      hunkIndex(files),
      existing
    );
    await createReview(target.ref, token, submission);
    yield {
      isError: false,
      kind: "tool-done",
      name: "post-review",
      result: { comments: submission.comments.length },
    };
  } catch (cause) {
    yield {
      isError: true,
      kind: "tool-done",
      name: "post-review",
      result: { error: messageOf(cause) },
    };
    yield {
      kind: "status",
      text: `Could not post review: ${messageOf(cause)}`,
    };
  }
}

function resolveModels(
  env: Record<string, string | undefined>,
  optionModel: string | null | undefined
): readonly string[] {
  const explicit = parseList(read(env, "REVIEW_MODELS"));
  if (explicit.length > 0) {
    return explicit;
  }
  const primary = optionModel ?? read(env, "REVIEW_MODEL") ?? DEFAULT_MODELS[0];
  const secondary = read(env, "REVIEW_MODEL_SECONDARY") ?? DEFAULT_MODELS[1];
  return secondary === primary ? [primary] : [primary, secondary];
}

function describeTarget(target: ReviewTarget): unknown {
  if (target.mode === "pr") {
    return {
      mode: "pr",
      ref: `${target.ref.owner}/${target.ref.repo}#${target.ref.number}`,
    };
  }
  return { mode: target.mode };
}

function confirmPosting(autopost: boolean): string {
  return autopost
    ? 'Got it — I\'ll post PR reviews to GitHub automatically again. Add "no post" to a review to skip a one-off.'
    : 'Got it — PR reviews are report-only now; I won\'t post comments unless you say "post" on a review (or "post by default").';
}

function parseList(value: string | undefined): readonly string[] {
  if (value === undefined) {
    return [];
  }
  return [
    ...new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    ),
  ];
}

function read(
  env: Record<string, string | undefined>,
  key: string
): string | undefined {
  const value = env[key];
  return value !== undefined && value.trim().length > 0 ? value : undefined;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
