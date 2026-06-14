// `ori research-lead run "<name>" "<company>" [--out <file>]`
//
// A working Ori command (RFC 0005.3 CommandHook): build a structured research
// card on a prospect via OpenRouter, separating verified facts from inferences,
// and write it to disk. Env: OPENROUTER_API_KEY, optional REVIEW_MODEL.
import { writeFile } from "node:fs/promises";
import { requestResearch } from "./openrouter.ts";
import { renderCard, slug } from "./research.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

interface ResearchContext {
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
}

async function run(
  args: readonly string[],
  context: ResearchContext
): Promise<number> {
  const positional: string[] = [];
  let out = "";
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--out" && value !== undefined) {
      out = value;
      i += 1;
    } else if (args[i] !== undefined) {
      positional.push(args[i] as string);
    }
  }
  const [name, company] = positional;
  if (name === undefined || company === undefined) {
    process.stderr.write(
      'usage: research-lead run "<name>" "<company>" [--out <file>]\n'
    );
    return EXIT_USAGE;
  }
  const apiKey = context.env.OPENROUTER_API_KEY;
  if (apiKey === undefined) {
    process.stderr.write("OPENROUTER_API_KEY is required\n");
    return EXIT_USAGE;
  }

  const card = await requestResearch({
    apiKey,
    company,
    model: context.env.REVIEW_MODEL ?? DEFAULT_MODEL,
    name,
  });
  const file = out === "" ? `${slug(name, company)}.card.md` : out;
  const target = file.startsWith("/") ? file : `${context.cwd}/${file}`;
  await writeFile(target, renderCard({ ...card, company, name }));
  process.stdout.write(
    `Research card written to ${target}. Next: draft-outreach write ${target}\n`
  );
  return EXIT_OK;
}

const command = {
  description: "Research a prospect and write a structured research card.",
  name: "run",
  run,
  type: "commandHook" as const,
};

export default command;
