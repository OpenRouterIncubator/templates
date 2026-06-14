// Pure cold-outreach logic: validate a draft against the rules that separate a
// personalized note from spam. No I/O. Used by cmd.ts to gate model output
// before a human ever sees it.

export interface Draft {
  readonly body: string;
  readonly subject: string;
}

export interface Issue {
  readonly kind: "cliche" | "length" | "no-cta" | "not-personalized";
  readonly message: string;
}

// Cold-email tells that read as a template blast.
const CLICHES = [
  "i hope this email finds you well",
  "i hope this finds you well",
  "just circling back",
  "just following up",
  "touch base",
  "pick your brain",
  "quick question",
  "synergy",
  "game changer",
  "revolutionary",
  "to whom it may concern",
  "dear sir or madam",
];

const MAX_WORDS = 150;
const WHITESPACE = /\s+/;
const CTA_SIGNALS = ["?", "would you", "open to", "worth a", "interested in"];
const CARD_FRONTMATTER = /^---\n([\s\S]*?)\n---/;
const CARD_MENTION_FIELD = /^(?:company|name):(.*)$/;

// Default personalization tokens from the research card's frontmatter (its
// name and company), so the not-personalized check has teeth even when the
// caller passes no --mention flags.
export function cardMentionTokens(cardMarkdown: string): readonly string[] {
  const match = CARD_FRONTMATTER.exec(cardMarkdown);
  if (match === null) {
    return [];
  }
  const tokens: string[] = [];
  for (const raw of (match[1] ?? "").split("\n")) {
    const value = CARD_MENTION_FIELD.exec(raw.trim())?.[1]?.trim() ?? "";
    if (value !== "") {
      tokens.push(value);
    }
  }
  return tokens;
}

export function checkDraft(
  draft: Draft,
  mustMention: readonly string[]
): readonly Issue[] {
  const haystack = `${draft.subject}\n${draft.body}`.toLowerCase();
  const issues: Issue[] = [];

  for (const phrase of CLICHES) {
    if (haystack.includes(phrase)) {
      issues.push({
        kind: "cliche",
        message: `cold-email cliché: "${phrase}"`,
      });
    }
  }

  const words = countWords(draft.body);
  if (words > MAX_WORDS) {
    issues.push({
      kind: "length",
      message: `body is ${words} words; keep cold outreach under ${MAX_WORDS}`,
    });
  }

  const mentioned = mustMention.filter(
    (token) => token.length > 0 && haystack.includes(token.toLowerCase())
  );
  if (mustMention.length > 0 && mentioned.length === 0) {
    issues.push({
      kind: "not-personalized",
      message: `mentions nothing specific (expected one of: ${mustMention.join(", ")})`,
    });
  }

  if (!CTA_SIGNALS.some((signal) => haystack.includes(signal))) {
    issues.push({
      kind: "no-cta",
      message: "no clear, low-friction call to action",
    });
  }

  return issues;
}

export function renderDraft(draft: Draft): string {
  return [`Subject: ${draft.subject}`, "", draft.body, ""].join("\n");
}

export function parseDraftData(jsonText: string): Draft {
  const parsed = safeParse(jsonText);
  const record = isRecord(parsed) ? parsed : {};
  return {
    body: typeof record.body === "string" ? record.body : "",
    subject: typeof record.subject === "string" ? record.subject : "",
  };
}

export function countWords(text: string): number {
  return text.trim().split(WHITESPACE).filter(Boolean).length;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
