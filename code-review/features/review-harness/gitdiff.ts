// Local review source: run `git diff` in the intern's workspace and normalize
// it into the same ChangedFile shape the GitHub client produces, so the rest of
// the pipeline is source-agnostic. The parser is pure and unit-tested; the
// runner is a thin shell-out kept at the edge.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ChangedFile } from "./diff.ts";

const run = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;
const DIFF_HEADER = /^diff --git a\/(.+) b\/(.+)$/;

interface PartialFile {
  additions: number;
  deletions: number;
  filename: string;
  patch: string[];
  sawHunk: boolean;
  status: string;
}

// Parse `git diff` unified output into ChangedFile records.
export function parseGitDiff(text: string): readonly ChangedFile[] {
  const files: ChangedFile[] = [];
  let current: PartialFile | undefined;

  const flush = () => {
    if (current !== undefined && current.filename.length > 0) {
      files.push(finalize(current));
    }
  };

  for (const line of text.split("\n")) {
    const header = DIFF_HEADER.exec(line);
    if (header !== null) {
      flush();
      current = {
        additions: 0,
        deletions: 0,
        filename: header[2] ?? "",
        patch: [],
        sawHunk: false,
        status: "modified",
      };
      continue;
    }
    if (current === undefined) {
      continue;
    }
    applyLine(current, line);
  }
  flush();
  return files;
}

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

function applyLine(current: PartialFile, line: string): void {
  if (line.startsWith("new file mode")) {
    current.status = "added";
  } else if (line.startsWith("deleted file mode")) {
    current.status = "removed";
  } else if (line.startsWith("rename to ")) {
    current.status = "renamed";
  }
  if (line.startsWith("@@")) {
    current.sawHunk = true;
  }
  if (!current.sawHunk) {
    return;
  }
  current.patch.push(line);
  if (line.startsWith("+") && !line.startsWith("+++")) {
    current.additions += 1;
  } else if (line.startsWith("-") && !line.startsWith("---")) {
    current.deletions += 1;
  }
}

function finalize(file: PartialFile): ChangedFile {
  const patch = file.patch.join("\n");
  return {
    additions: file.additions,
    deletions: file.deletions,
    filename: file.filename,
    patch: patch.length > 0 ? patch : undefined,
    status: file.status,
  };
}

async function gitDiff(cwd: string, range: readonly string[]): Promise<string> {
  const { stdout } = await run(
    "git",
    ["--no-pager", "diff", "--unified=3", ...range],
    { cwd, maxBuffer: MAX_BUFFER }
  );
  return stdout;
}
