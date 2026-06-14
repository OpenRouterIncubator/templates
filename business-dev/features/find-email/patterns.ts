// Pure email-candidate generation: the common corporate address patterns for a
// person's name at a domain, ordered by real-world frequency. No I/O.

export interface NameParts {
  readonly first: string;
  readonly last: string;
}

const NON_ALPHA = /[^a-z]/g;
const WHITESPACE = /\s+/;
const SCHEME = /^https?:\/\//;
const WWW = /^www\./;
const PATH = /\/.*$/;
const MIN_WORDS = 2;

export function parseName(fullName: string): NameParts | null {
  const words = fullName
    .trim()
    .toLowerCase()
    .split(WHITESPACE)
    .map((word) => word.replace(NON_ALPHA, ""))
    .filter((word) => word.length > 0);
  if (words.length < MIN_WORDS) {
    return null;
  }
  const first = words[0];
  const last = words.at(-1);
  if (first === undefined || last === undefined) {
    return null;
  }
  return { first, last };
}

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(SCHEME, "")
    .replace(WWW, "")
    .replace(PATH, "");
}

// Ordered by how common each pattern is in practice.
export function candidateEmails(
  name: NameParts,
  domain: string
): readonly string[] {
  const { first, last } = name;
  const f = first[0] ?? "";
  const l = last[0] ?? "";
  const locals = [
    `${first}.${last}`,
    first,
    `${f}${last}`,
    `${first}${last}`,
    `${first}_${last}`,
    `${first}${l}`,
    `${f}.${last}`,
    last,
    `${last}.${first}`,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const local of locals) {
    if (local.length > 0 && !seen.has(local)) {
      seen.add(local);
      out.push(`${local}@${domain}`);
    }
  }
  return out;
}
