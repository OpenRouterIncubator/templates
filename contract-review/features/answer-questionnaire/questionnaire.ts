// Pure questionnaire logic (security reviews, RFPs, due-diligence forms):
// extract questions, parse a Q&A archive, rank
// past answers by overlap, build the prompt, and validate the drafted answer.
// No I/O — unit-testable.

import { wrapUntrusted } from "../review-contract/contract.ts";

export interface QaPair {
  readonly answer: string;
  readonly question: string;
}

export type Confidence = "high" | "low" | "medium";

export interface Answer {
  readonly answer: string;
  readonly confidence: Confidence;
  readonly needsReview: boolean;
}

const MAX_MATCHES = 5;
const MIN_QUESTION_LEN = 8;
const Q_LINE = /^Q:\s*(.*)$/i;
const A_LINE = /^A:\s*(.*)$/i;
const BULLET = /^\s*(?:[-*]|\d+[.)])\s*/;
const WORD = /[a-z0-9]{3,}/g;

export function extractQuestions(text: string): readonly string[] {
  const questions: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(BULLET, "").trim();
    if (line.endsWith("?") && line.length >= MIN_QUESTION_LEN) {
      questions.push(line);
    }
  }
  return questions;
}

export function parseQaPairs(markdown: string): readonly QaPair[] {
  const pairs: QaPair[] = [];
  let question = "";
  let answerLines: string[] = [];
  for (const raw of markdown.split("\n")) {
    const qMatch = Q_LINE.exec(raw);
    if (qMatch !== null) {
      pushPair(pairs, question, answerLines);
      question = (qMatch[1] ?? "").trim();
      answerLines = [];
      continue;
    }
    const aMatch = A_LINE.exec(raw);
    if (aMatch !== null) {
      answerLines.push(aMatch[1] ?? "");
    } else if (question !== "" && answerLines.length > 0) {
      answerLines.push(raw);
    }
  }
  pushPair(pairs, question, answerLines);
  return pairs;
}

function pushPair(
  pairs: QaPair[],
  question: string,
  answerLines: readonly string[]
): void {
  const answer = answerLines.join("\n").trim();
  if (question !== "" && answer !== "") {
    pairs.push({ answer, question });
  }
}

export function rankPairs(
  question: string,
  pairs: readonly QaPair[]
): readonly QaPair[] {
  const needles = terms(question);
  return pairs
    .map((pair) => ({ pair, score: overlap(needles, terms(pair.question)) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHES)
    .map((entry) => entry.pair);
}

// Vendor questionnaires are as adversarial as counterparty contracts, so the
// question and the archive grounding get the same untrusted-content wrapping
// as the contract path (XML delimiters, preamble, closing-tag neutralization).
export function buildAnswerPrompt(
  question: string,
  matches: readonly QaPair[]
): string {
  const grounding =
    matches.length === 0
      ? "(no close past answers found — answer carefully and flag for review)"
      : matches
          .map((m, i) => `${i + 1}. Q: ${m.question}\n   A: ${m.answer}`)
          .join("\n\n");
  return [
    "Answer the question inside the <question> tags, grounded in the past",
    "answers inside the <past-answers> tags.",
    "",
    wrapUntrusted("question", question),
    "",
    wrapUntrusted("past-answers", grounding),
  ].join("\n");
}

// Fail toward review: malformed model output or an empty draft must carry the
// [NEEDS REVIEW] flag rather than print as a quietly clean non-answer.
export function parseAnswer(jsonText: string): Answer {
  const parsed = safeParse(jsonText);
  if (!isRecord(parsed)) {
    return { answer: "", confidence: "medium", needsReview: true };
  }
  const answer = asString(parsed.answer);
  return {
    answer,
    confidence: toConfidence(parsed.confidence),
    needsReview: parsed.needsReview === true || answer === "",
  };
}

export function formatAnswer(question: string, answer: Answer): string {
  const flag = answer.needsReview ? " [NEEDS REVIEW]" : "";
  const body = answer.answer === "" ? "(no answer drafted)" : answer.answer;
  return `Q: ${question}\nA (${answer.confidence})${flag}: ${body}\n`;
}

function terms(text: string): ReadonlySet<string> {
  return new Set(text.toLowerCase().match(WORD) ?? []);
}

function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let count = 0;
  for (const term of a) {
    if (b.has(term)) {
      count += 1;
    }
  }
  return count;
}

function toConfidence(value: unknown): Confidence {
  if (value === "high" || value === "low") {
    return value;
  }
  return "medium";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
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
