// The subprocess edge for local review: run `git diff` in the workspace and
// hand the output to the pure parser in `gitdiff.ts`. Isolated here (and only
// imported by the pipeline) so the tested parser stays free of process I/O.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ChangedFile } from "./diff.ts";
import { parseGitDiff } from "./gitdiff.ts";

const run = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;

// Run `git diff` against HEAD (staged + unstaged); if the tree is clean, fall
// back to the last commit so "review my changes" still has something to review.
export async function collectLocalDiff(
  cwd: string
): Promise<readonly ChangedFile[]> {
  const working = await gitDiff(cwd, ["HEAD"]);
  if (working.trim().length > 0) {
    return parseGitDiff(working);
  }
  const lastCommit = await gitDiff(cwd, ["HEAD~1", "HEAD"]).catch(() => "");
  return parseGitDiff(lastCommit);
}

async function gitDiff(cwd: string, range: readonly string[]): Promise<string> {
  const { stdout } = await run(
    "git",
    ["--no-pager", "diff", "--unified=3", ...range],
    { cwd, maxBuffer: MAX_BUFFER }
  );
  return stdout;
}
