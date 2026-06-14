// Map a finding's line onto a valid position in a unified diff. GitHub rejects
// inline review comments on lines that aren't part of the PR's diff, so each
// finding's line must resolve into a changed hunk (or be folded into the body).
import type { ChangedFile } from "./github.ts";

export interface Hunk {
  readonly newEnd: number;
  readonly newStart: number;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

// Parse the new-file line ranges from a single file's unified-diff patch.
export function parseHunks(patch: string): readonly Hunk[] {
  const hunks: Hunk[] = [];
  for (const line of patch.split("\n")) {
    const match = HUNK_HEADER.exec(line);
    if (match === null) {
      continue;
    }
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    hunks.push({ newEnd: start + Math.max(count, 1) - 1, newStart: start });
  }
  return hunks;
}

// Build a path -> hunks index from the PR's changed files.
export function hunkIndex(
  files: readonly ChangedFile[]
): ReadonlyMap<string, readonly Hunk[]> {
  const index = new Map<string, readonly Hunk[]>();
  for (const file of files) {
    if (file.patch !== undefined) {
      index.set(file.filename, parseHunks(file.patch));
    }
  }
  return index;
}

// In-hunk -> use as-is; otherwise the nearest hunk boundary; null if no hunks.
export function resolveLine(
  hunks: readonly Hunk[],
  line: number
): number | null {
  if (hunks.length === 0) {
    return null;
  }
  for (const hunk of hunks) {
    if (line >= hunk.newStart && line <= hunk.newEnd) {
      return line;
    }
  }
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const hunk of hunks) {
    for (const boundary of [hunk.newStart, hunk.newEnd]) {
      const distance = Math.abs(boundary - line);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = boundary;
      }
    }
  }
  return best;
}
