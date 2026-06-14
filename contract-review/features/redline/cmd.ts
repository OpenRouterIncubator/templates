// `ori contract-review redline <file> [--for "<party>"] [--out <file>]`
//
// A working Ori command (RFC 0005.3 CommandHook): ask a model (via OpenRouter)
// for specific contract edits in favor of the party you represent, anchor each
// edit to its exact text, and write a track-changes-style markup
// (~~delete~~ / **replacement**) with per-edit rationale. Output is a proposal
// for counsel to review — it never modifies the original file.
// Env: OPENROUTER_API_KEY, optional REVIEW_MODEL.
import { readFile, writeFile } from "node:fs/promises";
import { truncationWarning } from "../review-contract/contract.ts";
import { requestEdits } from "./openrouter.ts";
import { applyEdits, renderRedline } from "./redline.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";
const DEFAULT_PARTY = "the customer (the party receiving this contract)";

interface RedlineContext {
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
}

interface Args {
  readonly file: string;
  readonly out: string;
  readonly party: string;
}

function parseArgs(args: readonly string[]): Args {
  let file = "";
  let out = "";
  let party = DEFAULT_PARTY;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const value = args[i + 1];
    if (arg === "--for" && value !== undefined) {
      party = value;
      i += 1;
    } else if (arg === "--out" && value !== undefined) {
      out = value;
      i += 1;
    } else if (file === "" && arg !== undefined) {
      file = arg;
    }
  }
  return { file, out, party };
}

// Same failure-mode discrimination as review-contract: missing file,
// unreadable file, and empty file each get their own message.
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
  context: RedlineContext
): Promise<number> {
  const { file, out, party } = parseArgs(args);
  if (file === "") {
    process.stderr.write(
      'usage: redline <file> [--for "<party>"] [--out <file>]\n'
    );
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

  const edits = await requestEdits({
    apiKey,
    filename: file,
    model: context.env.REVIEW_MODEL ?? DEFAULT_MODEL,
    party,
    text,
  });
  const result = applyEdits(text, edits);

  const target = out === "" ? `${path}.redline.md` : resolveOut(out, context);
  await writeFile(target, renderRedline(file, result));
  process.stdout.write(
    `Redline written to ${target} (${result.applied.length} edits anchored, ${result.unanchored.length} need manual placement).\n`
  );
  return EXIT_OK;
}

function resolveOut(out: string, context: RedlineContext): string {
  return out.startsWith("/") ? out : `${context.cwd}/${out}`;
}

const command = {
  description:
    "Propose track-changes-style edits to a contract, in your party's favor.",
  name: "redline",
  run,
  type: "commandHook" as const,
};

export default command;
