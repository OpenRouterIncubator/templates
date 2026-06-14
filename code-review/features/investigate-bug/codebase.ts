// Locate candidate code for a bug report by scanning the local repo for the
// search terms. Uses node:fs; isolated from the pure RCA logic.
import { readdir, readFile } from "node:fs/promises";
import type { Snippet } from "./rca.ts";

const SOURCE_EXT =
  /\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|c|h|cpp|cs)$/;
const SKIP =
  /(?:^|[/\\])(?:node_modules|\.git|dist|build|coverage|vendor)[/\\]/;
const MAX_SCANNED = 4000;
const CONTEXT = 4;
const MAX_SNIPPETS_PER_FILE = 3;

interface Scored {
  readonly path: string;
  readonly score: number;
}

export async function collectSnippets(
  cwd: string,
  terms: readonly string[],
  maxFiles: number
): Promise<readonly Snippet[]> {
  if (terms.length === 0) {
    return [];
  }
  const needles = terms.map((term) => term.toLowerCase());
  const ranked = await rankFiles(cwd, needles);
  const snippets: Snippet[] = [];
  for (const entry of ranked.slice(0, maxFiles)) {
    const text = await readText(`${cwd}/${entry.path}`);
    snippets.push(...extractSnippets(entry.path, text, needles));
  }
  return snippets;
}

async function listSourceFiles(cwd: string): Promise<readonly string[]> {
  const entries = await readdir(cwd, { recursive: true }).catch(
    () => [] as string[]
  );
  return entries
    .filter((rel) => SOURCE_EXT.test(rel) && !SKIP.test(`/${rel}`))
    .slice(0, MAX_SCANNED);
}

async function rankFiles(
  cwd: string,
  needles: readonly string[]
): Promise<readonly Scored[]> {
  const scored: Scored[] = [];
  for (const rel of await listSourceFiles(cwd)) {
    const score = countHits(
      (await readText(`${cwd}/${rel}`)).toLowerCase(),
      needles
    );
    if (score > 0) {
      scored.push({ path: rel, score });
    }
  }
  return scored.sort((a, b) => b.score - a.score);
}

function countHits(haystack: string, needles: readonly string[]): number {
  let total = 0;
  for (const needle of needles) {
    let from = haystack.indexOf(needle);
    while (from !== -1) {
      total += 1;
      from = haystack.indexOf(needle, from + needle.length);
    }
  }
  return total;
}

function extractSnippets(
  path: string,
  text: string,
  needles: readonly string[]
): readonly Snippet[] {
  const lines = text.split("\n");
  const snippets: Snippet[] = [];
  for (
    let i = 0;
    i < lines.length && snippets.length < MAX_SNIPPETS_PER_FILE;
    i += 1
  ) {
    const lower = (lines[i] ?? "").toLowerCase();
    if (needles.some((needle) => lower.includes(needle))) {
      const start = Math.max(0, i - CONTEXT);
      const end = Math.min(lines.length, i + CONTEXT + 1);
      snippets.push({
        path,
        startLine: start + 1,
        text: lines.slice(start, end).join("\n"),
      });
      i = end;
    }
  }
  return snippets;
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}
