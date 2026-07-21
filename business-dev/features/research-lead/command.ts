// `/research-lead "<name>" "<company>" [--out <file>]`
//
// A working Ori command (RFC 0002 command.md, `CommandContribution`): build a
// structured research card on a prospect via OpenRouter, separating verified
// facts from inferences, and write it to disk. Env: OPENROUTER_API_KEY,
// optional REVIEW_MODEL.
import { writeFile } from "node:fs/promises";
import { requestResearch } from "./openrouter.ts";
import { renderCard, slug } from "./research.ts";

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

interface ResearchLeadArgs {
  readonly company: string;
  readonly name: string;
  readonly out?: string;
}

async function run(
  ctx: CommandContext<ResearchLeadArgs>
): Promise<CommandResult> {
  const { company, name, out } = ctx.args;
  const apiKey = ctx.env.OPENROUTER_API_KEY;
  if (apiKey === undefined) {
    return { message: "OPENROUTER_API_KEY is required", ok: false };
  }

  const model = ctx.env.REVIEW_MODEL ?? DEFAULT_MODEL;
  ctx.log(`researching ${name} at ${company} via ${model}`);
  const card = await requestResearch({ apiKey, company, model, name });
  const file =
    out === undefined || out === "" ? `${slug(name, company)}.card.md` : out;
  const target = file.startsWith("/") ? file : `${ctx.cwd}/${file}`;
  await writeFile(target, renderCard({ ...card, company, name }));
  return {
    data: { file: target },
    message: `Research card written to ${target}. Next: /draft-outreach ${target}`,
    ok: true,
  };
}

// Feature-root `command.ts`: registers under the feature id, `/research-lead`.
export const command: CommandContribution<ResearchLeadArgs> = {
  arguments: {
    // Positional arguments are consumed in declaration order: name, company.
    name: {
      description: "The prospect's full name",
      positional: true,
      required: true,
      type: "string",
    },
    company: {
      description: "The prospect's company",
      positional: true,
      required: true,
      type: "string",
    },
    out: {
      description: "Output file for the card (default: <name-company>.card.md)",
      type: "string",
    },
  },
  description: "Research a prospect and write a structured research card.",
  run,
};
