// `ori contract-review answer-questionnaire <questions-file | "question"> [--archive <dir>]`
//
// A working Ori command (RFC 0005.3 CommandHook): extract questions, search a
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

const EXIT_OK = 0;
const EXIT_USAGE = 2;
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

interface QuestionnaireContext {
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
}

interface Args {
  readonly archive: string;
  readonly source: string;
}

function parseArgs(args: readonly string[], cwd: string): Args {
  let archive = `${cwd}/qa-archive`;
  let source = "";
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--archive") {
      const value = args[i + 1];
      if (value !== undefined) {
        // Resolve against the command cwd, same as the questions file —
        // process.cwd() may differ from it when Ori runs the command.
        archive = value.startsWith("/") ? value : `${cwd}/${value}`;
      }
      i += 1;
    } else if (source === "" && arg !== undefined) {
      source = arg;
    }
  }
  return { archive, source };
}

// Only a missing file (ENOENT) falls back to treating the argument as a
// literal question. An empty file or a read error (e.g. EACCES) is a real
// problem with the file the user pointed at — surface it, don't reinterpret
// the path as a question.
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

async function run(
  args: readonly string[],
  context: QuestionnaireContext
): Promise<number> {
  const { archive, source } = parseArgs(args, context.cwd);
  if (source === "") {
    process.stderr.write(
      'usage: answer-questionnaire <questions-file | "question"> [--archive <dir>]\n'
    );
    return EXIT_USAGE;
  }
  const apiKey = context.env.OPENROUTER_API_KEY;
  if (apiKey === undefined) {
    process.stderr.write("OPENROUTER_API_KEY is required\n");
    return EXIT_USAGE;
  }

  const questions = await resolveQuestions(source, context.cwd);
  if (questions.length === 0) {
    process.stderr.write("No questions found to answer.\n");
    return EXIT_USAGE;
  }

  const pairs = await loadArchive(archive);
  const model = context.env.REVIEW_MODEL ?? DEFAULT_MODEL;
  for (const question of questions) {
    const prompt = buildAnswerPrompt(question, rankPairs(question, pairs));
    const answer = await requestAnswer({ apiKey, model, prompt });
    process.stdout.write(`${formatAnswer(question, answer)}\n`);
  }
  return EXIT_OK;
}

const command = {
  description:
    "Draft answers to questionnaires (security, RFP, due diligence) from a local Q&A archive.",
  name: "answer-questionnaire",
  run,
  type: "commandHook" as const,
};

export default command;
