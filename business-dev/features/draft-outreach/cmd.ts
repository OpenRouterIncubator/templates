// `ori draft-outreach write <card-file> [--mention <token>]... [--out <file>]`
//
// A working Ori command (RFC 0005.3 CommandHook): turn a research card into a
// personalized outreach draft via OpenRouter, then gate it through the spam/
// personalization checks before a human sees it. Writes a draft for approval —
// it never sends anything. Env: OPENROUTER_API_KEY, optional REVIEW_MODEL.
import { readFile, writeFile } from "node:fs/promises";
import { requestDraft } from "./openrouter.ts";
import { cardMentionTokens, checkDraft, renderDraft } from "./outreach.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;
const EXIT_FLAGGED = 1;
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

interface OutreachContext {
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
}

async function run(
  args: readonly string[],
  context: OutreachContext
): Promise<number> {
  const positional: string[] = [];
  const mention: string[] = [];
  let out = "";
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    const value = args[i + 1];
    if (flag === "--mention" && value !== undefined) {
      mention.push(value);
      i += 1;
    } else if (flag === "--out" && value !== undefined) {
      out = value;
      i += 1;
    } else if (flag !== undefined) {
      positional.push(flag);
    }
  }
  const [cardFile] = positional;
  if (cardFile === undefined) {
    process.stderr.write(
      "usage: draft-outreach write <card-file> [--mention <token>]... [--out <file>]\n"
    );
    return EXIT_USAGE;
  }
  const apiKey = context.env.OPENROUTER_API_KEY;
  if (apiKey === undefined) {
    process.stderr.write("OPENROUTER_API_KEY is required\n");
    return EXIT_USAGE;
  }

  const cardPath = cardFile.startsWith("/")
    ? cardFile
    : `${context.cwd}/${cardFile}`;
  const research = await readFile(cardPath, "utf8");

  const draft = await requestDraft({
    apiKey,
    model: context.env.REVIEW_MODEL ?? DEFAULT_MODEL,
    research,
  });
  // The card's own name/company are always required mentions; explicit
  // --mention tokens are additive, so a default run still enforces
  // personalization.
  const issues = checkDraft(draft, [
    ...cardMentionTokens(research),
    ...mention,
  ]);
  const rendered = renderDraft(draft);

  const file = out === "" ? `${cardPath}.outreach.md` : out;
  const target = file.startsWith("/") ? file : `${context.cwd}/${file}`;
  await writeFile(target, rendered);
  process.stdout.write(
    `Draft (for your review — not sent) written to ${target}\n`
  );

  if (issues.length > 0) {
    process.stdout.write("\nFlags to fix before sending:\n");
    for (const issue of issues) {
      process.stdout.write(`  - [${issue.kind}] ${issue.message}\n`);
    }
    return EXIT_FLAGGED;
  }
  process.stdout.write("No quality flags. Review and send manually.\n");
  return EXIT_OK;
}

const command = {
  description:
    "Draft personalized outreach from a research card (for human review).",
  name: "write",
  run,
  type: "commandHook" as const,
};

export default command;
