// `ori style check <file>`
//
// A working Ori command (RFC 0005.3 CommandHook): lint a draft for
// AI-sounding prose. Pure local analysis — no network, no API key.
// Exits non-zero when an error-severity finding is present, so it can
// gate publishing in scripts or CI.
import { readFile } from "node:fs/promises";
import { checkStyle, formatReport } from "./style.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;
const EXIT_FAILED = 1;

interface StyleContext {
  readonly cwd: string;
}

async function run(
  args: readonly string[],
  context: StyleContext
): Promise<number> {
  const file = args[0];
  if (file === undefined) {
    process.stderr.write("usage: style check <file>\n");
    return EXIT_USAGE;
  }
  const path = file.startsWith("/") ? file : `${context.cwd}/${file}`;
  const text = await readFile(path, "utf8").catch(() => "");
  if (text === "") {
    process.stderr.write(`Cannot read file: ${file}\n`);
    return EXIT_USAGE;
  }
  const report = checkStyle(text);
  process.stdout.write(formatReport(report));
  return report.ok ? EXIT_OK : EXIT_FAILED;
}

const command = {
  description: "Lint a draft for AI-sounding prose (no network needed).",
  name: "check",
  run,
  type: "commandHook" as const,
};

export default command;
