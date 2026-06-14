// `ori find-email run "<First Last>" <domain>`
//
// A working Ori command (RFC 0005.3 CommandHook): generate the common corporate
// address patterns for a name, then verify them via DNS MX + an SMTP RCPT probe
// (no mail is ever sent). Pure node — needs no API key. Prints the first
// address that verifies, or the ranked candidate list if none can be confirmed.
import { candidateEmails, normalizeDomain, parseName } from "./patterns.ts";
import { lookupMx, probe } from "./smtp.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;
const MAX_PROBES = 8;

interface FindEmailContext {
  readonly env: Record<string, string | undefined>;
}

async function run(args: readonly string[]): Promise<number> {
  const name = parseName(args[0] ?? "");
  const domain = normalizeDomain(args[1] ?? "");
  if (name === null || domain === "") {
    process.stderr.write('usage: find-email run "<First Last>" <domain>\n');
    return EXIT_USAGE;
  }

  const candidates = candidateEmails(name, domain);
  const mx = await lookupMx(domain);
  if (mx === null) {
    process.stdout.write(
      `No MX record for ${domain}; can't verify. Ranked guesses:\n${candidates.join("\n")}\n`
    );
    return EXIT_OK;
  }

  for (const email of candidates.slice(0, MAX_PROBES)) {
    const verdict = await probe(email, mx);
    if (verdict === "valid") {
      process.stdout.write(`Verified: ${email}\n`);
      return EXIT_OK;
    }
  }

  process.stdout.write(
    `Could not confirm an address (server may accept-all or block probes). Ranked guesses:\n${candidates.join("\n")}\n`
  );
  return EXIT_OK;
}

const command = {
  description:
    "Find and verify a work email from a name + domain (DNS MX + SMTP probe).",
  name: "run",
  run: (args: readonly string[], _context: FindEmailContext) => run(args),
  type: "commandHook" as const,
};

export default command;
