// `ori code-review investigate-bug "<bug report>" [--max-files N]`
//
// A working Ori command (RFC 0005.3 CommandHook): pull search terms from the
// report, scan the local repo for candidate code, and ask a model (via
// OpenRouter) for a static root-cause analysis with file:line citations.
// Env: OPENROUTER_API_KEY, optional REVIEW_MODEL. Searches context.cwd.
import { collectSnippets } from "./codebase.ts";
import { requestRca } from "./openrouter.ts";
import { buildRcaPrompt, type Rca } from "./rca.ts";
import { extractSearchTerms } from "./search.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";
const DEFAULT_MAX_FILES = 6;

interface BugContext {
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
}

interface Args {
  readonly maxFiles: number;
  readonly report: string;
}

function parseArgs(args: readonly string[]): Args {
  const positional: string[] = [];
  let maxFiles = DEFAULT_MAX_FILES;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--max-files") {
      const value = args[i + 1];
      if (value !== undefined) {
        maxFiles = Number(value);
      }
      i += 1;
    } else if (arg !== undefined) {
      positional.push(arg);
    }
  }
  return { maxFiles, report: positional.join(" ") };
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
  return `${lines.join("\n")}\n`;
}

async function run(
  args: readonly string[],
  context: BugContext
): Promise<number> {
  const { maxFiles, report } = parseArgs(args);
  if (report.trim() === "") {
    process.stderr.write(
      'usage: investigate-bug "<bug report>" [--max-files N]\n'
    );
    return EXIT_USAGE;
  }
  const apiKey = context.env.OPENROUTER_API_KEY;
  if (apiKey === undefined) {
    process.stderr.write("OPENROUTER_API_KEY is required\n");
    return EXIT_USAGE;
  }

  const terms = extractSearchTerms(report);
  const snippets = await collectSnippets(context.cwd, terms, maxFiles);
  const prompt = buildRcaPrompt(report, snippets);
  const rca = await requestRca({
    apiKey,
    model: context.env.REVIEW_MODEL ?? DEFAULT_MODEL,
    prompt,
  });
  process.stdout.write(formatRca(rca));
  return EXIT_OK;
}

const command = {
  description:
    "Investigate a bug report: scan the repo and produce a root-cause analysis.",
  name: "investigate-bug",
  run,
  type: "commandHook" as const,
};

export default command;
