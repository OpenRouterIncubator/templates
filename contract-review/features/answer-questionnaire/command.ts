// `/answer-questionnaire <questions-file | "question"> [--archive <dir>]`
//
// A working Ori command (RFC 0002 command.md): extract questions, search a
// local archive of past Q&A for grounding, and draft answers via OpenRouter.
// Env: OPENROUTER_API_KEY, optional REVIEW_MODEL. Archive defaults to
// <cwd>/qa-archive.
import { readFile } from "node:fs/promises";
import { loadArchive } from "./archive.ts";
import { requestAnswer } from "./openrouter.ts";
import {
  buildAnswerPrompt,
  extractQuestions,
  formatAnswer,
  rankPairs,
} from "./questionnaire.ts";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

// Local structural mirror of the parts of the Ori author command contract
// (`CommandContribution` et al.) this command uses — templates deliberately
// do not depend on the `ori` package, and the runtime matches structurally.
interface CommandArgumentSpec {
  readonly default?: boolean | number | string;
  readonly description: string;
  readonly positional?: boolean;
  readonly required?: boolean;
  readonly type: "boolean" | "number" | "string";
}

interface CommandContext<Args> {
  readonly args: Args;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly log: (line: string) => void;
}

interface CommandResult {
  readonly message?: string;
  readonly ok: boolean;
}

interface CommandContribution<Args> {
  readonly arguments?: Readonly<Record<string, CommandArgumentSpec>>;
  readonly description: string;
  readonly run: (ctx: CommandContext<Args>) => Promise<CommandResult>;
}

interface Args {
  readonly archive: string;
  readonly source: string;
}

// Only a missing file (ENOENT) falls back to treating the argument as a
// literal question. An empty file or a read error (e.g. EACCES) is a real
// problem with the file the user pointed at — surface it, don't reinterpret
// the path as a question. Thrown errors are caught by the runtime and
// reported as `ok: false`.
async function resolveQuestions(
  source: string,
  cwd: string
): Promise<readonly string[]> {
  const path = source.startsWith("/") ? source : `${cwd}/${source}`;
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return source.trim() === "" ? [] : [source.trim()];
    }
    throw new Error(
      `Cannot read questions file ${path} (${code ?? "unknown error"})`
    );
  }
  if (text.trim() === "") {
    throw new Error(`Questions file ${path} is empty`);
  }
  const extracted = extractQuestions(text);
  return extracted.length === 0 ? [text.trim()] : extracted;
}

async function run(ctx: CommandContext<Args>): Promise<CommandResult> {
  const apiKey = ctx.env.OPENROUTER_API_KEY;
  if (apiKey === undefined) {
    return { message: "OPENROUTER_API_KEY is required", ok: false };
  }

  const { archive, source } = ctx.args;
  const questions = await resolveQuestions(source, ctx.cwd);
  if (questions.length === 0) {
    return { message: "No questions found to answer.", ok: false };
  }

  // Resolve against the command cwd, same as the questions file —
  // process.cwd() may differ from it when Ori runs the command.
  const archiveDir = archive.startsWith("/")
    ? archive
    : `${ctx.cwd}/${archive}`;
  const pairs = await loadArchive(archiveDir);
  const model = ctx.env.REVIEW_MODEL ?? DEFAULT_MODEL;
  const drafted: string[] = [];
  for (const [index, question] of questions.entries()) {
    ctx.log(`Answering question ${index + 1} of ${questions.length}`);
    const prompt = buildAnswerPrompt(question, rankPairs(question, pairs));
    const answer = await requestAnswer({ apiKey, model, prompt });
    drafted.push(formatAnswer(question, answer));
  }
  return { message: drafted.join("\n").trimEnd(), ok: true };
}

// `name` is omitted: a feature-root command.ts defaults to the feature id,
// which is already `answer-questionnaire`.
const command: CommandContribution<Args> = {
  arguments: {
    archive: {
      default: "qa-archive",
      description:
        "Directory of past Q&A markdown files, resolved against the workspace root",
      type: "string",
    },
    source: {
      description:
        "Path to a questions file, or a literal question when no such file exists",
      positional: true,
      required: true,
      type: "string",
    },
  },
  description:
    "Draft answers to questionnaires (security, RFP, due diligence) from a local Q&A archive.",
  run,
};

export default command;
