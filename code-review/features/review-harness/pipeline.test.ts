import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PipelineEvent } from "./events.ts";
import { runReview } from "./pipeline.ts";

// A throwaway git repo with one tracked file and an uncommitted edit, so
// `git diff HEAD` (the local-review path) yields a real patch to review.
function makeRepoWithDiff(): string {
  const dir = mkdtempSync(join(tmpdir(), "review-pipeline-"));
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
  return dir;
}

async function collect(
  generator: AsyncGenerator<PipelineEvent>
): Promise<PipelineEvent[]> {
  const events: PipelineEvent[] = [];
  for await (const event of generator) {
    events.push(event);
  }
  return events;
}

describe("runReview fail-closed behavior", () => {
  const originalFetch = globalThis.fetch;
  let repo: string;

  beforeEach(() => {
    repo = makeRepoWithDiff();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    rmSync(repo, { force: true, recursive: true });
  });

  it("yields an error and ends not-ok when every model call fails, never an APPROVE report", async () => {
    // Every OpenRouter call rejects, so all settled results are rejected and the
    // candidate list is empty — the path that used to vote through an APPROVE.
    globalThis.fetch = (() =>
      Promise.reject(new Error("network down"))) as unknown as typeof fetch;

    const events = await collect(
      runReview({
        cwd: repo,
        env: { OPENROUTER_API_KEY: "k", REVIEW_MODELS: "model-a,model-b" },
        prompt: "review my changes",
        sessionId: "s1",
      })
    );

    const errors = events.filter((event) => event.kind === "error");
    expect(errors).toEqual([
      { kind: "error", message: "all model calls failed — cannot review" },
    ]);

    const ended = events.filter((event) => event.kind === "ended");
    expect(ended).toEqual([
      { error: "all model calls failed", kind: "ended", ok: false },
    ]);

    // The whole point: no report (which would carry an APPROVE verdict) and no
    // confirmed findings are emitted when there was no successful signal.
    expect(events.some((event) => event.kind === "report")).toBe(false);
    expect(events.some((event) => event.kind === "finding")).toBe(false);
  });
});
