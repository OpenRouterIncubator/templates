// `/review-contract <file> [--format json]`
//
// A working Ori command (RFC 0002 command.md): read a contract file, ask a
// model (via OpenRouter) for a structured analysis, and return a risk-ordered
// report (or JSON). Env: OPENROUTER_API_KEY, optional REVIEW_MODEL.
import { readFile } from "node:fs/promises";
import {
  buildAnalysisPrompt,
  formatReport,
  truncationWarning,
} from "./contract.ts";
import { requestAnalysis } from "./openrouter.ts";

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
  readonly file: string;
  readonly format: string;
}

// Distinguish failure modes instead of collapsing them all to "": a missing
// file, a permission error, and an empty file each get their own message.
// Thrown errors are caught by the runtime and reported as `ok: false`.
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

  const { file, format } = ctx.args;
  const path = file.startsWith("/") ? file : `${ctx.cwd}/${file}`;
  const text = await readText(path);
  const warning = truncationWarning(text);
  if (warning !== null) {
    ctx.log(warning);
  }

  const analysis = await requestAnalysis({
    apiKey,
    model: ctx.env.REVIEW_MODEL ?? DEFAULT_MODEL,
    prompt: buildAnalysisPrompt(file, text),
  });

  return {
    message:
      format === "json"
        ? JSON.stringify(analysis, null, 2)
        : formatReport(analysis).trimEnd(),
    ok: true,
  };
}

// `name` is omitted: a feature-root command.ts defaults to the feature id,
// which is already `review-contract`.
const command: CommandContribution<Args> = {
  arguments: {
    file: {
      description: "Path to the contract file to analyze",
      positional: true,
      required: true,
      type: "string",
    },
    format: {
      default: "text",
      description:
        "Output format: 'text' (risk-ordered report) or 'json' (structured analysis)",
      type: "string",
    },
  },
  description:
    "Analyze a contract file and report key terms, obligations, and risks.",
  run,
};

export default command;
