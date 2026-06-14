// Verify candidate emails without sending anything: resolve the domain's MX,
// then run an SMTP RCPT TO probe and read the server's reply code. Many servers
// accept-all or block probes, so results are valid / invalid / unknown. Uses
// node:dns and node:net only.

import { resolveMx } from "node:dns/promises";
import { connect } from "node:net";

export type Verdict = "invalid" | "unknown" | "valid";

const SMTP_PORT = 25;
const TIMEOUT_MS = 7000;
const OK = 250;
const NO_MAILBOX = 550;
const PROBE_FROM = "verify@example.com";

type Step =
  | { readonly next: number; readonly write: string }
  | {
      readonly verdict: Verdict;
    };

// The SMTP probe state machine as a pure step function: given the current stage
// and the server's reply code, decide the next command to send or the verdict.
function step(stage: number, code: number, email: string): Step {
  if (stage === 0) {
    return { next: 1, write: "HELO example.com\r\n" };
  }
  if (stage === 1) {
    return { next: 2, write: `MAIL FROM:<${PROBE_FROM}>\r\n` };
  }
  if (stage === 2) {
    return { next: 3, write: `RCPT TO:<${email}>\r\n` };
  }
  if (code === OK) {
    return { verdict: "valid" };
  }
  if (code === NO_MAILBOX) {
    return { verdict: "invalid" };
  }
  return { verdict: "unknown" };
}

export async function lookupMx(domain: string): Promise<string | null> {
  try {
    const records = await resolveMx(domain);
    if (records.length === 0) {
      return null;
    }
    return (
      records.toSorted((a, b) => a.priority - b.priority)[0]?.exchange ?? null
    );
  } catch {
    return null;
  }
}

// Probe a single address against its MX host. Never sends mail (no DATA).
export function probe(email: string, mxHost: string): Promise<Verdict> {
  return new Promise((resolve) => {
    const socket = connect({ host: mxHost, port: SMTP_PORT });
    let stage = 0;
    let settled = false;

    const finish = (verdict: Verdict) => {
      if (!settled) {
        settled = true;
        socket.write("QUIT\r\n");
        socket.destroy();
        resolve(verdict);
      }
    };

    socket.setTimeout(TIMEOUT_MS, () => finish("unknown"));
    socket.on("error", () => finish("unknown"));
    // SMTP is line-oriented over a byte stream: buffer until CRLF so a reply
    // code split across TCP chunks is never misread, and skip multi-line
    // continuation lines (4th char "-") so only the final reply line steps
    // the state machine.
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\r\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.length < 3 || line[3] === "-") {
          continue;
        }
        const code = Number.parseInt(line.slice(0, 3), 10);
        const result = step(stage, code, email);
        if ("verdict" in result) {
          finish(result.verdict);
          return;
        }
        socket.write(result.write);
        stage = result.next;
      }
    });
  });
}
