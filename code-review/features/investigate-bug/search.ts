// Extract search terms from a free-text bug report. Pure / testable.
// Keeps quoted phrases and code-like identifiers; drops generic words.

const MIN_LEN = 3;
const MAX_TERMS = 12;
const QUOTED = /[`'"]([^`'"]{3,60})[`'"]/g;
const IDENT = /[A-Za-z_][A-Za-z0-9_.$]{2,}/g;

const STOPWORDS = new Set([
  "and",
  "are",
  "bug",
  "but",
  "code",
  "error",
  "exception",
  "expected",
  "fail",
  "failed",
  "failure",
  "for",
  "from",
  "happens",
  "issue",
  "not",
  "the",
  "then",
  "this",
  "throws",
  "unexpected",
  "when",
  "where",
  "with",
]);

export function extractSearchTerms(text: string): readonly string[] {
  const candidates: string[] = [];
  for (const match of text.matchAll(QUOTED)) {
    if (match[1] !== undefined) {
      candidates.push(match[1]);
    }
  }
  for (const match of text.matchAll(IDENT)) {
    candidates.push(match[0]);
  }

  const seen = new Set<string>();
  const terms: string[] = [];
  for (const candidate of candidates) {
    const term = candidate.trim();
    const key = term.toLowerCase();
    if (term.length < MIN_LEN || STOPWORDS.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    terms.push(term);
    if (terms.length >= MAX_TERMS) {
      break;
    }
  }
  return terms;
}
