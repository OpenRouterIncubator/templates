// The review dimensions fanned out in parallel. Each is a focused reviewer with
// its own system prompt; running them separately keeps every pass on-task and
// lets findings be attributed to a concern. Output schema is shared so findings
// from every dimension and model merge cleanly.
import type { ChangedFile } from "./diff.ts";

export interface Dimension {
  readonly id: string;
  readonly system: string;
  readonly title: string;
}

const JSON_SHAPE = [
  'Respond as JSON: {"findings":[{"path","line","severity","body"}]}.',
  'severity is "must-fix" or "suggestion"; line is the new-file line number.',
  "Report only substantiated, high-signal findings; return an empty array when nothing qualifies.",
].join(" ");

export const DIMENSIONS: readonly Dimension[] = [
  {
    id: "correctness",
    system: `You review diffs for correctness bugs only: logic errors, wrong conditions, off-by-one, null/undefined hazards, unhandled errors, race conditions, and broken control flow. Consider the change's blast radius, not just the touched lines. ${JSON_SHAPE}`,
    title: "Correctness",
  },
  {
    id: "security",
    system: `You review diffs for security issues only: injection, broken authn/authz, committed secrets, unsafe input handling, SSRF, path traversal, and unsafe deserialization. ${JSON_SHAPE}`,
    title: "Security",
  },
  {
    id: "performance",
    system: `You review diffs for performance problems only: needless allocations, N+1 queries, quadratic loops, blocking I/O on hot paths, and missing pagination or caching. Flag only changes likely to matter at real scale. ${JSON_SHAPE}`,
    title: "Performance",
  },
  {
    id: "api-contract",
    system: `You review diffs for API and contract risks only: breaking signature or schema changes, backward-incompatible behavior, type mismatches at boundaries, and undocumented contract drift. ${JSON_SHAPE}`,
    title: "API & contracts",
  },
  {
    id: "tests",
    system: `You review diffs for testing gaps only: changed behavior without test coverage, untested edge cases and error paths, and brittle or flaky test patterns. ${JSON_SHAPE}`,
    title: "Tests",
  },
];

const MAX_PATCH_CHARS = 6000;

// Render the changed files into a single diff block for the model prompt.
export function renderDiff(files: readonly ChangedFile[]): string {
  return files
    .filter((file) => file.patch !== undefined)
    .map(
      (file) =>
        `### ${file.filename} (+${file.additions} -${file.deletions})\n\n\`\`\`diff\n${truncate(file.patch ?? "")}\n\`\`\``
    )
    .join("\n\n");
}

export function buildDimensionPrompt(title: string, diffText: string): string {
  return [`# Review target: ${title}`, "## Changed files", diffText].join(
    "\n\n"
  );
}

function truncate(patch: string): string {
  if (patch.length <= MAX_PATCH_CHARS) {
    return patch;
  }
  return `${patch.slice(0, MAX_PATCH_CHARS)}\n… (truncated)`;
}
