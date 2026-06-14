// `ori contract-review review-contract <file> [--format json]`
//
// A working Ori command (RFC 0005.3 CommandHook): read a contract file, ask a
// model (via OpenRouter) for a structured analysis, and print a risk-ordered
// report (or JSON). Env: OPENROUTER_API_KEY, optional REVIEW_MODEL.
import { readFile } from "node:fs/promises";
import {
  buildAnalysisPrompt,
  formatReport,
  truncationWarning,
} from "./contract.ts";
import { requestAnalysis } from "./openrouter.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

interface ContractContext {
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
}

interface Args {
  readonly file: string;
  readonly json: boolean;
}

function parseArgs(args: readonly string[]): Args {
  let file = "";
  let json = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--format") {
      json = args[i + 1] === "json";
      i += 1;
    } else if (file === "" && arg !== undefined) {
      file = arg;
    }
  }
  return { file, json };
}

// Distinguish failure modes instead of collapsing them all to "": a missing
// file, a permission error, and an empty file each get their own message.
async function readText(path: string): Promise<string> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "unknown error";
    throw new Error(`Cannot read contract file ${path} (${code})`);
  }
  if (text.trim() === "") {
    throw new Error(`Contract file ${path} is empty`);
  }
  return text;
}

async function run(
  args: readonly string[],
  context: ContractContext
): Promise<number> {
  const { file, json } = parseArgs(args);
  if (file === "") {
    process.stderr.write("usage: review-contract <file> [--format json]\n");
    return EXIT_USAGE;
  }
  const apiKey = context.env.OPENROUTER_API_KEY;
  if (apiKey === undefined) {
    process.stderr.write("OPENROUTER_API_KEY is required\n");
    return EXIT_USAGE;
  }

  const path = file.startsWith("/") ? file : `${context.cwd}/${file}`;
  const text = await readText(path);
  const warning = truncationWarning(text);
  if (warning !== null) {
    process.stderr.write(`${warning}\n`);
  }

  const analysis = await requestAnalysis({
    apiKey,
    model: context.env.REVIEW_MODEL ?? DEFAULT_MODEL,
    prompt: buildAnalysisPrompt(file, text),
  });

  process.stdout.write(
    json ? `${JSON.stringify(analysis, null, 2)}\n` : formatReport(analysis)
  );
  return EXIT_OK;
}

const command = {
  description:
    "Analyze a contract file and report key terms, obligations, and risks.",
  name: "review-contract",
  run,
  type: "commandHook" as const,
};

export default command;
