// `/redline <file> [--for "<party>"] [--out <file>]`
//
// A working Ori command (RFC 0002 command.md): ask a model (via OpenRouter)
// for specific contract edits in favor of the party you represent, anchor each
// edit to its exact text, and write a track-changes-style markup
// (~~delete~~ / **replacement**) with per-edit rationale. Output is a proposal
// for counsel to review — it never modifies the original file.
// Env: OPENROUTER_API_KEY, optional REVIEW_MODEL.
import { readFile, writeFile } from "node:fs/promises";
import { truncationWarning } from "../review-contract/contract.ts";
import { requestEdits } from "./openrouter.ts";
import { applyEdits, renderRedline } from "./redline.ts";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";
const DEFAULT_PARTY = "the customer (the party receiving this contract)";

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
  readonly file: string;
  readonly for: string;
  readonly out?: string;
}

// Same failure-mode discrimination as review-contract: missing file,
// unreadable file, and empty file each get their own message. Thrown errors
// are caught by the runtime and reported as `ok: false`.
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

async function run(ctx: CommandContext<Args>): Promise<CommandResult> {
  const apiKey = ctx.env.OPENROUTER_API_KEY;
  if (apiKey === undefined) {
    return { message: "OPENROUTER_API_KEY is required", ok: false };
  }

  const { file, for: party, out } = ctx.args;
  const path = file.startsWith("/") ? file : `${ctx.cwd}/${file}`;
  const text = await readText(path);
  const warning = truncationWarning(text);
  if (warning !== null) {
    ctx.log(warning);
  }

  const edits = await requestEdits({
    apiKey,
    filename: file,
    model: ctx.env.REVIEW_MODEL ?? DEFAULT_MODEL,
    party,
    text,
  });
  const result = applyEdits(text, edits);

  const target =
    out === undefined ? `${path}.redline.md` : resolveOut(out, ctx.cwd);
  await writeFile(target, renderRedline(file, result));
  return {
    message: `Redline written to ${target} (${result.applied.length} edits anchored, ${result.unanchored.length} need manual placement).`,
    ok: true,
  };
}

function resolveOut(out: string, cwd: string): string {
  return out.startsWith("/") ? out : `${cwd}/${out}`;
}

// `name` is omitted: a feature-root command.ts defaults to the feature id,
// which is already `redline`.
const command: CommandContribution<Args> = {
  arguments: {
    file: {
      description: "Path to the contract file to redline",
      positional: true,
      required: true,
      type: "string",
    },
    for: {
      default: DEFAULT_PARTY,
      description: "The party the proposed edits should favor",
      type: "string",
    },
    out: {
      description:
        "Output path for the redline markup (defaults to <file>.redline.md)",
      type: "string",
    },
  },
  description:
    "Propose track-changes-style edits to a contract, in your party's favor.",
  run,
};

export default command;
