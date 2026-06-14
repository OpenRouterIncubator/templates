// Scan a PR's *added* diff lines for committed secrets. Pure / testable.
// Each hit becomes a must-fix finding at the correct new-file line number.
import type { ChangedFile } from "./github.ts";
import type { Finding } from "./review.ts";

interface SecretRule {
  readonly label: string;
  readonly pattern: RegExp;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)/;

const RULES: readonly SecretRule[] = [
  { label: "AWS access key id", pattern: /AKIA[0-9A-Z]{16}/ },
  {
    label: "private key block",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  },
  { label: "GitHub token", pattern: /\bghp_[0-9A-Za-z]{36}\b/ },
  { label: "Slack token", pattern: /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/ },
  {
    label: "hardcoded credential",
    pattern:
      /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]{12,}['"]/i,
  },
];

export function scanSecrets(files: readonly ChangedFile[]): readonly Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    if (file.patch !== undefined) {
      scanPatch(file.filename, file.patch, findings);
    }
  }
  return findings;
}

function scanPatch(filename: string, patch: string, findings: Finding[]): void {
  let newLine = 0;
  for (const raw of patch.split("\n")) {
    const header = HUNK_HEADER.exec(raw);
    if (header !== null) {
      newLine = Number(header[1]);
      continue;
    }
    if (raw.startsWith("+++") || raw.startsWith("---")) {
      continue;
    }
    if (raw.startsWith("-")) {
      continue;
    }
    if (raw.startsWith("+")) {
      pushHits(filename, raw.slice(1), newLine, findings);
    }
    newLine += 1;
  }
}

function pushHits(
  filename: string,
  content: string,
  line: number,
  findings: Finding[]
): void {
  for (const rule of RULES) {
    if (rule.pattern.test(content)) {
      findings.push({
        body: `Possible secret committed (${rule.label}). Remove it from the diff and rotate the credential.`,
        line,
        path: filename,
        severity: "must-fix",
      });
    }
  }
}
