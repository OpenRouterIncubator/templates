// `ori review <file> [<file>...]`
//
// A deterministic Ori command (RFC 0005.3 CommandHook): read each file and run
// the local review checks in `checks.ts` — no model and no network. Prints one
// finding per line and exits non-zero when any file has findings, so it can gate
// a workflow. Replace or extend with a model-backed review when you need one.
import { file } from "bun";

import { formatFindings, reviewText } from "./checks.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;
const EXIT_FINDINGS = 1;

interface CommandContext {
  readonly env: Record<string, string | undefined>;
}

async function run(
  args: readonly string[],
  _context: CommandContext
): Promise<number> {
  if (args.length === 0) {
    process.stderr.write("usage: review <file> [<file>...]\n");
    return EXIT_USAGE;
  }

  let total = 0;
  for (const path of args) {
    const text = await file(path).text();
    const findings = reviewText(text);
    if (findings.length > 0) {
      total += findings.length;
      process.stdout.write(`${path}\n${formatFindings(findings)}\n`);
    }
  }

  if (total === 0) {
    process.stdout.write("No findings.\n");
    return EXIT_OK;
  }

  process.stdout.write(`\n${total} finding(s).\n`);
  return EXIT_FINDINGS;
}

const command = {
  description: "Run local deterministic review checks over one or more files.",
  name: "review",
  run,
  type: "commandHook" as const,
};

export default command;
