// `ori draft write <brief-file> [--out <file>]`
//
// A working Ori command (RFC 0005.3 CommandHook): write a full draft from an
// APPROVED brief via OpenRouter. Refuses briefs whose frontmatter is not
// status: approved — the human-approval gate. Env: OPENROUTER_API_KEY,
// optional REVIEW_MODEL.
import { readFile, writeFile } from "node:fs/promises";
import { approvalGate, buildDraftPrompt } from "./draft.ts";
import { requestDraft } from "./openrouter.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";
const BRIEF_SUFFIX = /\.brief\.md$/;

interface DraftContext {
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
}

async function run(
  args: readonly string[],
  context: DraftContext
): Promise<number> {
  let brief = "";
  let out = "";
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--out" && value !== undefined) {
      out = value;
      i += 1;
    } else if (brief === "" && args[i] !== undefined) {
      brief = args[i] as string;
    }
  }
  if (brief === "") {
    process.stderr.write("usage: draft write <brief-file> [--out <file>]\n");
    return EXIT_USAGE;
  }
  const apiKey = context.env.OPENROUTER_API_KEY;
  if (apiKey === undefined) {
    process.stderr.write("OPENROUTER_API_KEY is required\n");
    return EXIT_USAGE;
  }

  const briefPath = brief.startsWith("/") ? brief : `${context.cwd}/${brief}`;
  const briefText = await readFile(briefPath, "utf8").catch(() => "");
  if (briefText === "") {
    process.stderr.write(`Cannot read brief file: ${brief}\n`);
    return EXIT_USAGE;
  }

  const gate = approvalGate(briefText);
  if (!gate.ok) {
    process.stderr.write(`Refusing to draft: ${gate.reason}\n`);
    return EXIT_USAGE;
  }

  const draft = await requestDraft({
    apiKey,
    model: context.env.REVIEW_MODEL ?? DEFAULT_MODEL,
    prompt: buildDraftPrompt(briefText),
  });
  let target = briefPath.replace(BRIEF_SUFFIX, ".draft.md");
  if (out !== "") {
    target = out.startsWith("/") ? out : `${context.cwd}/${out}`;
  }
  await writeFile(
    target === briefPath ? `${briefPath}.draft.md` : target,
    draft
  );
  process.stdout.write(
    "Draft written. Run the style check before shipping: ori style check <draft-file>\n"
  );
  return EXIT_OK;
}

const command = {
  description: "Write a full content draft from an approved brief.",
  name: "write",
  run,
  type: "commandHook" as const,
};

export default command;
