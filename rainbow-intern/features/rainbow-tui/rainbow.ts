// Pure rainbow color helpers shared by the Ink renderer (`app.tsx`) and the
// non-TTY piped fallback (`piped.ts`).

export const NEWLINE = "\n";

// Ink color names and raw ANSI codes for the same six-step rainbow.
const RAINBOW_INK = [
  "red",
  "yellow",
  "green",
  "cyan",
  "blue",
  "magenta",
] as const;
const RAINBOW_ANSI = [31, 33, 32, 36, 34, 35] as const;

export interface Run {
  readonly color: string;
  readonly text: string;
}

interface RunResult {
  readonly offset: number;
  readonly runs: readonly Run[];
}

interface AnsiResult {
  readonly offset: number;
  readonly text: string;
}

// Pure: split text into per-character Ink runs, threading the color offset so
// the rainbow keeps cycling across streamed deltas. Newlines pass through with
// an empty color and never advance the cycle.
export const colorRuns = (text: string, offset: number): RunResult => {
  const runs: Run[] = [];
  let next = offset;
  for (const char of text) {
    if (char === NEWLINE) {
      runs.push({ color: "", text: NEWLINE });
      continue;
    }
    runs.push({ color: RAINBOW_INK[next % RAINBOW_INK.length], text: char });
    next += 1;
  }
  return { offset: next, runs };
};

// Pure: the same rainbow as raw ANSI escapes, for the non-TTY piped fallback.
export const colorize = (text: string, offset: number): AnsiResult => {
  let colored = "";
  let next = offset;
  for (const char of text) {
    if (char === NEWLINE) {
      colored += char;
      continue;
    }
    colored += `\u001B[${RAINBOW_ANSI[next % RAINBOW_ANSI.length]}m${char}`;
    next += 1;
  }
  return { offset: next, text: colored };
};
