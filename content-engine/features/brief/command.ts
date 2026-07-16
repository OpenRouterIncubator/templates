// `/brief` command (RFC 0002 command.md CommandContribution):
//   `/brief generate "<topic>" [--out <file>]` — produce a draft brief via
//     OpenRouter and write it to disk with status: draft.
//   `/brief approve <brief-file>` — validate required fields and stamp
//     status: approved (pure file ops; no API).
// Env: OPENROUTER_API_KEY (generate only), optional REVIEW_MODEL.
import { readFile, writeFile } from "node:fs/promises";
import {
  parseBrief,
  renderBrief,
  slugify,
  stampApproved,
  validateBrief,
} from "./brief.ts";
import { requestBrief } from "./openrouter.ts";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";
const USAGE =
  'usage: /brief generate "<topic>" [--out <file>] | /brief approve <brief-file>';

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

interface BriefArgs {
  readonly action: string;
  readonly out?: string;
  readonly subject: string;
}

function resolvePath(file: string, cwd: string): string {
  return file.startsWith("/") ? file : `${cwd}/${file}`;
}

async function runGenerate(
  ctx: CommandContext<BriefArgs>
): Promise<CommandResult> {
  const apiKey = ctx.env.OPENROUTER_API_KEY;
  if (apiKey === undefined) {
    return { message: "OPENROUTER_API_KEY is required", ok: false };
  }
  const topic = ctx.args.subject;
  ctx.log(`Requesting brief for "${topic}"…`);
  const data = await requestBrief({
    apiKey,
    model: ctx.env.REVIEW_MODEL ?? DEFAULT_MODEL,
    topic,
  });
  const target = resolvePath(
    ctx.args.out ?? `${slugify(topic)}.brief.md`,
    ctx.cwd
  );
  await writeFile(target, renderBrief({ ...data, topic: data.topic || topic }));
  return {
    data: { file: target, status: "draft" },
    message: `Brief written to ${target} (status: draft). Review, edit, then run: /brief approve ${target}`,
    ok: true,
  };
}

async function runApprove(
  ctx: CommandContext<BriefArgs>
): Promise<CommandResult> {
  const path = resolvePath(ctx.args.subject, ctx.cwd);
  const text = await readFile(path, "utf8").catch(() => "");
  if (text === "") {
    return {
      message: `Cannot read brief file: ${ctx.args.subject}`,
      ok: false,
    };
  }
  const problems = validateBrief(parseBrief(text));
  if (problems.length > 0) {
    for (const problem of problems) {
      ctx.log(`- ${problem}`);
    }
    return {
      data: { problems },
      message: "Brief not approved; fix the fields above first.",
      ok: false,
    };
  }
  await writeFile(path, stampApproved(text));
  return {
    data: { file: path, status: "approved" },
    message: `Approved: ${path} (status: approved)`,
    ok: true,
  };
}

const command: CommandContribution<BriefArgs> = {
  arguments: {
    action: {
      description:
        'What to do: "generate" a brief for a topic, or "approve" a brief file.',
      positional: true,
      required: true,
      type: "string",
    },
    out: {
      description:
        "Output file for generate (defaults to <topic-slug>.brief.md).",
      type: "string",
    },
    subject: {
      description:
        "The topic to brief (generate) or the brief file to approve.",
      positional: true,
      required: true,
      type: "string",
    },
  },
  description:
    "Generate a structured content brief for a topic (status: draft), or validate and approve a brief file.",
  run: (ctx) => {
    if (ctx.args.action === "generate") {
      return runGenerate(ctx);
    }
    if (ctx.args.action === "approve") {
      return runApprove(ctx);
    }
    return {
      message: `Unknown action "${ctx.args.action}"; ${USAGE}`,
      ok: false,
    };
  },
};

export default command;
