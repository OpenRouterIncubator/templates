import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { collectLocalDiff } from "./local-diff.ts";

// A throwaway git repo with two commits and a clean working tree, so
// `git diff HEAD` is empty and the local-diff path falls back to the last
// commit (HEAD~1..HEAD) — the uncovered branch.
function makeCleanRepoWithLastCommit(): string {
  const dir = mkdtempSync(join(tmpdir(), "local-diff-"));
  const git = (args: readonly string[]) =>
    execFileSync("git", args, { cwd: dir });
  git(["init", "-q"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  const file = join(dir, "app.ts");
  writeFileSync(file, "export const value = 1;\n");
  git(["add", "."]);
  git(["commit", "-q", "-m", "init"]);
  writeFileSync(file, "export const value = 2;\n");
  git(["add", "."]);
  git(["commit", "-q", "-m", "bump"]);
  return dir;
}

// A clean repo with a single commit, so `git diff HEAD` is empty AND the
// fallback `git diff HEAD~1 HEAD` errors (no HEAD~1) — exercising the `.catch`.
function makeCleanRepoSingleCommit(): string {
  const dir = mkdtempSync(join(tmpdir(), "local-diff-single-"));
  const git = (args: readonly string[]) =>
    execFileSync("git", args, { cwd: dir });
  git(["init", "-q"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  writeFileSync(join(dir, "app.ts"), "export const value = 1;\n");
  git(["add", "."]);
  git(["commit", "-q", "-m", "init"]);
  return dir;
}

describe("collectLocalDiff fallback branch", () => {
  let repo: string;

  beforeEach(() => {
    repo = makeCleanRepoWithLastCommit();
  });

  afterEach(() => {
    rmSync(repo, { force: true, recursive: true });
  });

  it("falls back to the last commit when the working tree is clean", async () => {
    const files = await collectLocalDiff(repo);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((file) => file.filename.endsWith("app.ts"))).toBe(true);
  });
});

describe("collectLocalDiff catch branch", () => {
  let repo: string;

  beforeEach(() => {
    repo = makeCleanRepoSingleCommit();
  });

  afterEach(() => {
    rmSync(repo, { force: true, recursive: true });
  });

  it("returns no findings when the tree is clean and there is no prior commit", async () => {
    const files = await collectLocalDiff(repo);
    expect(files).toEqual([]);
  });
});
