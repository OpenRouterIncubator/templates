// `/investigate-bug "<bug report>" [--max-files N]`
//
// A working Ori command contribution (feature-root `command.ts`, registered as
// `/investigate-bug`): pull search terms from the report, scan the local repo
// for candidate code, and ask a model (via OpenRouter) for a static root-cause
// analysis with file:line citations.
// Env: OPENROUTER_API_KEY, optional REVIEW_MODEL. Searches ctx.cwd.
import { collectSnippets } from "./codebase.ts";
import { requestRca } from "./openrouter.ts";
import { buildRcaPrompt, type Rca } from "./rca.ts";
import { extractSearchTerms } from "./search.ts";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";
const DEFAULT_MAX_FILES = 6;

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
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly log: (line: string) => void;
}

interface CommandResult {
  readonly data?: JsonValue;
  readonly message?: string;
  readonly ok: boolean;
}

interface Args {
  readonly "max-files": number;
  readonly report: string;
}

function formatRca(rca: Rca): string {
  const lines = [
    `Summary: ${rca.summary === "" ? "(none)" : rca.summary}`,
    `Root cause (${rca.confidence}): ${rca.rootCause === "" ? "(undetermined)" : rca.rootCause}`,
  ];
  if (rca.citations.length > 0) {
    lines.push("", "Evidence:");
    for (const citation of rca.citations) {
      const note = citation.note === "" ? "" : ` — ${citation.note}`;
      lines.push(`  ${citation.path}:${citation.line}${note}`);
    }
  }
  if (rca.fix !== "") {
    lines.push("", `Suggested fix: ${rca.fix}`);
  }
  if (rca.needsRuntime) {
    lines.push(
      "",
      "Static analysis was inconclusive — add runtime instrumentation to confirm."
    );
  }
  return lines.join("\n");
}

function rcaData(rca: Rca): JsonValue {
  return {
    citations: rca.citations.map((citation) => ({
      line: citation.line,
      note: citation.note,
      path: citation.path,
    })),
    confidence: rca.confidence,
    fix: rca.fix,
    needsRuntime: rca.needsRuntime,
    rootCause: rca.rootCause,
    summary: rca.summary,
  };
}

async function run(ctx: CommandContext<Args>): Promise<CommandResult> {
  const report = ctx.args.report;
  if (report.trim() === "") {
    return {
      message: 'usage: /investigate-bug "<bug report>" [--max-files N]',
      ok: false,
    };
  }
  const apiKey = ctx.env.OPENROUTER_API_KEY;
  if (apiKey === undefined) {
    return { message: "OPENROUTER_API_KEY is required", ok: false };
  }

  const terms = extractSearchTerms(report);
  ctx.log(`Scanning ${ctx.cwd} for ${terms.length} search term(s)…`);
  const snippets = await collectSnippets(ctx.cwd, terms, ctx.args["max-files"]);
  ctx.log(`Analyzing ${snippets.length} candidate snippet(s)…`);
  const prompt = buildRcaPrompt(report, snippets);
  const rca = await requestRca({
    apiKey,
    model: ctx.env.REVIEW_MODEL ?? DEFAULT_MODEL,
    prompt,
  });
  return { data: rcaData(rca), message: formatRca(rca), ok: true };
}

export const command = {
  arguments: {
    "max-files": {
      default: DEFAULT_MAX_FILES,
      description: "Maximum number of candidate files to analyze",
      type: "number" as const,
    },
    report: {
      description: 'The bug report text (quote it: "…")',
      positional: true,
      required: true,
      type: "string" as const,
    },
  },
  description:
    "Investigate a bug report: scan the repo and produce a root-cause analysis.",
  run,
};
