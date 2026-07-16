// `/find-email "<First Last>" <domain>`
//
// A working Ori command (RFC 0002 command.md, `CommandContribution`): generate
// the common corporate address patterns for a name, then verify them via DNS
// MX + an SMTP RCPT probe (no mail is ever sent). Pure node — needs no API
// key. Reports the first address that verifies, or the ranked candidate list
// if none can be confirmed.
import { candidateEmails, normalizeDomain, parseName } from "./patterns.ts";
import { lookupMx, probe } from "./smtp.ts";

const MAX_PROBES = 8;

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

interface FindEmailArgs {
  readonly domain: string;
  readonly name: string;
}

async function run(ctx: CommandContext<FindEmailArgs>): Promise<CommandResult> {
  const name = parseName(ctx.args.name);
  const domain = normalizeDomain(ctx.args.domain);
  if (name === null || domain === "") {
    return {
      message:
        'expected a full name ("First Last") and a domain (e.g. acme.com)',
      ok: false,
    };
  }

  const candidates = candidateEmails(name, domain);
  const mx = await lookupMx(domain);
  if (mx === null) {
    return {
      data: { candidates, verified: null },
      message: `No MX record for ${domain}; can't verify. Ranked guesses:\n${candidates.join("\n")}`,
      ok: true,
    };
  }

  for (const email of candidates.slice(0, MAX_PROBES)) {
    ctx.log(`probing ${email}`);
    const verdict = await probe(email, mx);
    if (verdict === "valid") {
      return {
        data: { candidates, verified: email },
        message: `Verified: ${email}`,
        ok: true,
      };
    }
  }

  return {
    data: { candidates, verified: null },
    message: `Could not confirm an address (server may accept-all or block probes). Ranked guesses:\n${candidates.join("\n")}`,
    ok: true,
  };
}

// Feature-root `command.ts`: registers under the feature id, `/find-email`.
const command: CommandContribution<FindEmailArgs> = {
  arguments: {
    // Positional arguments are consumed in declaration order: name, domain.
    name: {
      description: 'The prospect\'s full name ("First Last")',
      positional: true,
      required: true,
      type: "string",
    },
    domain: {
      description: "The company domain (e.g. acme.com)",
      positional: true,
      required: true,
      type: "string",
    },
  },
  description:
    "Find and verify a work email from a name + domain (DNS MX + SMTP probe).",
  run,
};

export default command;
