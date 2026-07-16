// `/style <file>`
//
// A working Ori command (RFC 0002 command.md CommandContribution): lint a
// draft for AI-sounding prose. Pure local analysis — no network, no API key.
// Returns ok: false when an error-severity finding is present, so it can
// gate publishing.
import { readFile } from "node:fs/promises";
import { checkStyle, formatReport } from "./style.ts";

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

interface StyleArgs {
  readonly file: string;
}

async function run(ctx: CommandContext<StyleArgs>): Promise<CommandResult> {
  const file = ctx.args.file;
  const path = file.startsWith("/") ? file : `${ctx.cwd}/${file}`;
  const text = await readFile(path, "utf8").catch(() => "");
  if (text === "") {
    return { message: `Cannot read file: ${file}`, ok: false };
  }
  const report = checkStyle(text);
  const lines = formatReport(report).trimEnd().split("\n");
  const verdict = lines.at(-1) ?? "";
  for (const line of lines.slice(0, -1)) {
    if (line !== "") {
      ctx.log(line);
    }
  }
  return {
    data: {
      findings: report.findings.map((finding) => ({
        line: finding.line,
        message: finding.message,
        severity: finding.severity,
      })),
      words: report.words,
    },
    message: verdict,
    ok: report.ok,
  };
}

const command: CommandContribution<StyleArgs> = {
  arguments: {
    file: {
      description: "The draft file to lint.",
      positional: true,
      required: true,
      type: "string",
    },
  },
  description: "Lint a draft for AI-sounding prose (no network needed).",
  run,
};

export default command;
