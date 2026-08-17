// `/draft-outreach <card-file> [--mention <tokens>] [--out <file>]`
//
// A working Ori command (RFC 0002 command.md, `CommandContribution`): turn a
// research card into a personalized outreach draft via OpenRouter, then gate
// it through the spam/personalization checks before a human sees it. Writes a
// draft for approval — it never sends anything. Env: OPENROUTER_API_KEY,
// optional REVIEW_MODEL.
import { readFile, writeFile } from "node:fs/promises";
import { requestDraft } from "./openrouter.ts";
import { cardMentionTokens, checkDraft, renderDraft } from "./outreach.ts";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

// Minimal structural slice of the Ori author command contract (RFC 0002
// command.md). Templates deliberately do not depend on the `ori` package, so
// the shapes this command needs are declared locally.
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
  readonly run: (
    ctx: CommandContext<Args>
  ) => CommandResult | Promise<CommandResult>;
}

interface DraftOutreachArgs {
  readonly card: string;
  readonly mention?: string;
  readonly out?: string;
}

function splitMentions(mention: string | undefined): readonly string[] {
  if (mention === undefined) {
    return [];
  }
  return mention
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

async function run(
  ctx: CommandContext<DraftOutreachArgs>
): Promise<CommandResult> {
  const { card, mention, out } = ctx.args;
  const apiKey = ctx.env.OPENROUTER_API_KEY;
  if (apiKey === undefined) {
    return { message: "OPENROUTER_API_KEY is required", ok: false };
  }

  const cardPath = card.startsWith("/") ? card : `${ctx.cwd}/${card}`;
  const research = await readFile(cardPath, "utf8");

  const model = ctx.env.REVIEW_MODEL ?? DEFAULT_MODEL;
  ctx.log(`drafting outreach from ${cardPath} via ${model}`);
  const draft = await requestDraft({ apiKey, model, research });
  // The card's own name/company are always required mentions; explicit
  // --mention tokens are additive, so a default run still enforces
  // personalization.
  const issues = checkDraft(draft, [
    ...cardMentionTokens(research),
    ...splitMentions(mention),
  ]);
  const rendered = renderDraft(draft);

  const file =
    out === undefined || out === "" ? `${cardPath}.outreach.md` : out;
  const target = file.startsWith("/") ? file : `${ctx.cwd}/${file}`;
  await writeFile(target, rendered);
  ctx.log(`Draft (for your review — not sent) written to ${target}`);

  if (issues.length > 0) {
    const flags = issues.map((issue) => `  - [${issue.kind}] ${issue.message}`);
    return {
      data: { file: target, issues: issues.map((issue) => ({ ...issue })) },
      message: `Draft written to ${target}, but fix these flags before sending:\n${flags.join("\n")}`,
      ok: false,
    };
  }
  return {
    data: { file: target, issues: [] },
    message: `Draft written to ${target}. No quality flags. Review and send manually.`,
    ok: true,
  };
}

// Feature-root `command.ts`: registers under the feature id, `/draft-outreach`.
export const command: CommandContribution<DraftOutreachArgs> = {
  arguments: {
    card: {
      description: "Path to the research card file",
      positional: true,
      required: true,
      type: "string",
    },
    mention: {
      description:
        "Extra tokens the draft must mention (comma-separated), additive to the card's name/company",
      type: "string",
    },
    out: {
      description:
        "Output file for the draft (default: <card-file>.outreach.md)",
      type: "string",
    },
  },
  description:
    "Draft personalized outreach from a research card (for human review).",
  run,
};
