// `/draft <brief-file> [--out <file>]`
//
// A working Ori command (RFC 0002 command.md CommandContribution): write a
// full draft from an APPROVED brief via OpenRouter. Refuses briefs whose
// frontmatter is not status: approved — the human-approval gate.
// Env: OPENROUTER_API_KEY, optional REVIEW_MODEL.
import { readFile, writeFile } from "node:fs/promises";
import { approvalGate, buildDraftPrompt } from "./draft.ts";
import { requestDraft } from "./openrouter.ts";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";
const BRIEF_SUFFIX = /\.brief\.md$/;

// Local structural copies of the ori author command contract (RFC 0002
// command.md) — templates deliberately do not depend on the `ori` package.
type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

interface CommandResult {
  readonly data?: JsonValue;
  readonly message?: string;
  readonly ok: boolean;
}

interface CommandContext<Args> {
  readonly args: Args;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly log: (line: string) => void;
}

interface CommandArgumentSpec {
  readonly default?: string | number | boolean;
  readonly description: string;
  readonly positional?: boolean;
  readonly required?: boolean;
  readonly type: "string" | "boolean" | "number";
}

interface CommandContribution<Args> {
  readonly arguments?: Readonly<Record<string, CommandArgumentSpec>>;
  readonly description: string;
  readonly name?: string;
  readonly run: (
    ctx: CommandContext<Args>
  ) => CommandResult | Promise<CommandResult>;
}

interface DraftArgs {
  readonly brief: string;
  readonly out?: string;
}

function resolvePath(file: string, cwd: string): string {
  return file.startsWith("/") ? file : `${cwd}/${file}`;
}

async function run(ctx: CommandContext<DraftArgs>): Promise<CommandResult> {
  const apiKey = ctx.env.OPENROUTER_API_KEY;
  if (apiKey === undefined) {
    return { message: "OPENROUTER_API_KEY is required", ok: false };
  }

  const briefPath = resolvePath(ctx.args.brief, ctx.cwd);
  const briefText = await readFile(briefPath, "utf8").catch(() => "");
  if (briefText === "") {
    return { message: `Cannot read brief file: ${ctx.args.brief}`, ok: false };
  }

  const gate = approvalGate(briefText);
  if (!gate.ok) {
    return { message: `Refusing to draft: ${gate.reason}`, ok: false };
  }

  ctx.log(`Writing draft from ${briefPath}…`);
  const draft = await requestDraft({
    apiKey,
    model: ctx.env.REVIEW_MODEL ?? DEFAULT_MODEL,
    prompt: buildDraftPrompt(briefText),
  });
  let target = briefPath.replace(BRIEF_SUFFIX, ".draft.md");
  if (ctx.args.out !== undefined) {
    target = resolvePath(ctx.args.out, ctx.cwd);
  }
  if (target === briefPath) {
    target = `${briefPath}.draft.md`;
  }
  await writeFile(target, draft);
  return {
    data: { file: target },
    message: `Draft written to ${target}. Run the style check before shipping: /style ${target}`,
    ok: true,
  };
}

const command: CommandContribution<DraftArgs> = {
  arguments: {
    brief: {
      description: "The approved brief file to draft from.",
      positional: true,
      required: true,
      type: "string",
    },
    out: {
      description:
        "Output file for the draft (defaults to <brief>.draft.md next to the brief).",
      type: "string",
    },
  },
  description: "Write a full content draft from an approved brief.",
  run,
};

export default command;
