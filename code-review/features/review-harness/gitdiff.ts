// Pure parser: normalize `git diff` unified output into the same ChangedFile
// shape the GitHub client produces, so the rest of the pipeline is source-
// agnostic. The subprocess that produces the text lives in `local-diff.ts`.
import type { ChangedFile } from "./diff.ts";

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
