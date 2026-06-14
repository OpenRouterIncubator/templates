// Brief commands (RFC 0005.3 CommandHook; this file default-exports an ARRAY):
//   `ori brief generate "<topic>" [--out <file>]` — produce a draft brief via
//     OpenRouter and write it to disk with status: draft.
//   `ori brief approve <file>` — validate required fields and stamp
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

const EXIT_OK = 0;
const EXIT_USAGE = 2;
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

interface BriefContext {
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
}

function resolvePath(file: string, cwd: string): string {
  return file.startsWith("/") ? file : `${cwd}/${file}`;
}

async function runGenerate(
  args: readonly string[],
  context: BriefContext
): Promise<number> {
  let topic = "";
  let out = "";
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--out" && value !== undefined) {
      out = value;
      i += 1;
    } else if (topic === "" && args[i] !== undefined) {
      topic = args[i] as string;
    }
  }
  if (topic === "") {
    process.stderr.write('usage: brief generate "<topic>" [--out <file>]\n');
    return EXIT_USAGE;
  }
  const apiKey = context.env.OPENROUTER_API_KEY;
  if (apiKey === undefined) {
    process.stderr.write("OPENROUTER_API_KEY is required\n");
    return EXIT_USAGE;
  }

  const data = await requestBrief({
    apiKey,
    model: context.env.REVIEW_MODEL ?? DEFAULT_MODEL,
    topic,
  });
  const target = resolvePath(
    out === "" ? `${slugify(topic)}.brief.md` : out,
    context.cwd
  );
  await writeFile(target, renderBrief({ ...data, topic: data.topic || topic }));
  process.stdout.write(
    `Brief written to ${target} (status: draft). Review, edit, then run: brief approve ${target}\n`
  );
  return EXIT_OK;
}

async function runApprove(
  args: readonly string[],
  context: BriefContext
): Promise<number> {
  const file = args[0];
  if (file === undefined) {
    process.stderr.write("usage: brief approve <brief-file>\n");
    return EXIT_USAGE;
  }
  const path = resolvePath(file, context.cwd);
  const text = await readFile(path, "utf8").catch(() => "");
  if (text === "") {
    process.stderr.write(`Cannot read brief file: ${file}\n`);
    return EXIT_USAGE;
  }
  const problems = validateBrief(parseBrief(text));
  if (problems.length > 0) {
    for (const problem of problems) {
      process.stderr.write(`- ${problem}\n`);
    }
    process.stderr.write("Brief not approved; fix the fields above first.\n");
    return EXIT_USAGE;
  }
  await writeFile(path, stampApproved(text));
  process.stdout.write(`Approved: ${path} (status: approved)\n`);
  return EXIT_OK;
}

const commands = [
  {
    description:
      "Generate a structured content brief for a topic (status: draft).",
    name: "generate",
    run: runGenerate,
    type: "commandHook" as const,
  },
  {
    description:
      "Validate a brief's required fields and stamp status: approved.",
    name: "approve",
    run: runApprove,
    type: "commandHook" as const,
  },
];

export default commands;
