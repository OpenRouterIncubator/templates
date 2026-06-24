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

// One OpenRouter chat-completion response carrying the given findings JSON, in
// the {choices:[{message:{content}}]} envelope requestFindings decodes.
function openRouterResponse(findings: readonly unknown[]): Response {
  const content = JSON.stringify({ findings });
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

// A fetch stub that decides by URL: OpenRouter calls return the supplied
// findings; everything else routes through `github` so the PR path can be
// exercised without touching the network. Tracks GitHub POST /reviews bodies so
// tests can assert the review was "posted" in-process.
function stubFetch(options: {
  findings: readonly unknown[];
  github?: (url: string, init?: RequestInit) => Response;
}): { fetch: typeof fetch; postedReviews: unknown[] } {
  const postedReviews: unknown[] = [];
  const fetchImpl = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("openrouter.ai")) {
      return Promise.resolve(openRouterResponse(options.findings));
    }
    if (url.endsWith("/reviews") && init?.method === "POST") {
      postedReviews.push(JSON.parse(String(init.body)));
      return Promise.resolve(jsonResponse({ id: 1 }));
    }
    if (options.github !== undefined) {
      return Promise.resolve(options.github(url, init));
    }
    return Promise.resolve(jsonResponse({}));
  };
  return { fetch: fetchImpl as unknown as typeof fetch, postedReviews };
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

describe("runReview local success path", () => {
  const originalFetch = globalThis.fetch;
  let repo: string;

  beforeEach(() => {
    repo = makeRepoWithDiff();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    rmSync(repo, { force: true, recursive: true });
  });

  it("emits confirmed findings and a report for a successful local review", async () => {
    // A single model means every well-formed finding is confirmed at face value
    // (no voting), so the model output flows straight through to findings + report.
    const { fetch } = stubFetch({
      findings: [
        {
          body: "value should stay 1",
          line: 1,
          path: "app.ts",
          severity: "must-fix",
          suggestion: "export const value = 1;",
        },
      ],
    });
    globalThis.fetch = fetch;

    const events = await collect(
      runReview({
        cwd: repo,
        env: { OPENROUTER_API_KEY: "k", REVIEW_MODELS: "model-a" },
        prompt: "review my changes",
        sessionId: "local-success",
      })
    );

    // No error/fail-closed: there was real signal.
    expect(events.some((event) => event.kind === "error")).toBe(false);

    const findings = events.filter((event) => event.kind === "finding");
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]).toMatchObject({
      finding: { line: 1, path: "app.ts", severity: "must-fix" },
      kind: "finding",
    });

    const report = events.find((event) => event.kind === "report");
    expect(report).toBeDefined();
    if (report?.kind === "report") {
      // A must-fix drives a REQUEST_CHANGES verdict in the rendered report.
      expect(report.markdown).toContain("changes requested");
      expect(report.markdown).toContain("app.ts:1");
    }

    // A successful tool-done for the model call (the candidate-producing branch).
    expect(
      events.some(
        (event) =>
          event.kind === "tool-done" &&
          event.name === "model:model-a" &&
          event.isError === false
      )
    ).toBe(true);

    expect(events.at(-1)).toEqual({ kind: "ended", ok: true });
  });

  it("approves when a successful review surfaces no findings", async () => {
    // Well-formed but empty findings: signal succeeded, nothing to flag → APPROVE.
    const { fetch } = stubFetch({ findings: [] });
    globalThis.fetch = fetch;

    const events = await collect(
      runReview({
        cwd: repo,
        env: { OPENROUTER_API_KEY: "k", REVIEW_MODELS: "model-a" },
        prompt: "review my changes",
        sessionId: "local-approve",
      })
    );

    expect(events.some((event) => event.kind === "error")).toBe(false);
    expect(events.some((event) => event.kind === "finding")).toBe(false);

    const report = events.find((event) => event.kind === "report");
    expect(report).toBeDefined();
    if (report?.kind === "report") {
      expect(report.markdown).toContain("approved");
      expect(report.markdown).toContain("No blocking issues found");
    }
    expect(events.at(-1)).toEqual({ kind: "ended", ok: true });
  });
});

describe("runReview non-review and guard branches", () => {
  const originalFetch = globalThis.fetch;
  let repo: string;

  beforeEach(() => {
    repo = makeRepoWithDiff();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    rmSync(repo, { force: true, recursive: true });
  });

  it("errors and ends not-ok when OPENROUTER_API_KEY is missing", async () => {
    const events = await collect(
      runReview({
        cwd: repo,
        env: {},
        prompt: "review my changes",
        sessionId: "no-key",
      })
    );

    expect(events).toContainEqual({
      kind: "error",
      message: "OPENROUTER_API_KEY is required to run a review.",
    });
    expect(events.at(-1)).toEqual({
      error: "missing OPENROUTER_API_KEY",
      kind: "ended",
      ok: false,
    });
  });

  it("streams a chat reply for a non-review prompt", async () => {
    // Serve a tiny SSE stream so streamChat yields two deltas then [DONE].
    const sse =
      'data: {"choices":[{"delta":{"content":"Hi "}}]}\n' +
      'data: {"choices":[{"delta":{"content":"there"}}]}\n' +
      "data: [DONE]\n";
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(sse, {
          headers: { "Content-Type": "text/event-stream" },
          status: 200,
        })
      )) as unknown as typeof fetch;

    const events = await collect(
      runReview({
        cwd: repo,
        env: { OPENROUTER_API_KEY: "k", REVIEW_MODEL: "model-a" },
        prompt: "hello, how are you?",
        sessionId: "chat",
      })
    );

    const chat = events
      .filter((event) => event.kind === "chat")
      .map((event) => (event.kind === "chat" ? event.text : ""))
      .join("");
    expect(chat).toBe("Hi there");
    expect(events.at(-1)).toEqual({ kind: "ended", ok: true });
  });

  it("sets a session posting preference for a non-PR configuration prompt", async () => {
    // No fetch should be needed: the preference branch returns before any call.
    globalThis.fetch = (() => {
      throw new Error("should not fetch for a config prompt");
    }) as unknown as typeof fetch;

    const events = await collect(
      runReview({
        cwd: repo,
        env: { OPENROUTER_API_KEY: "k" },
        prompt: "don't post reviews by default",
        sessionId: "config",
      })
    );

    expect(events.some((event) => event.kind === "chat")).toBe(true);
    expect(events.at(-1)).toEqual({ kind: "ended", ok: true });
  });
});

describe("runReview PR post path", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts a GitHub review for a PR target when asked to post", async () => {
    // Drive resolveDiff's PR branch and postReview end to end, with both the
    // OpenRouter and GitHub edges served in-process by the fetch stub.
    const patch = "@@ -0,0 +1,1 @@\n+export const value = 2;";
    const github = (url: string): Response => {
      if (url.includes("/pulls/7/files")) {
        return jsonResponse([
          {
            additions: 1,
            deletions: 0,
            filename: "app.ts",
            patch,
            status: "modified",
          },
        ]);
      }
      if (url.includes("/pulls/7/comments")) {
        return jsonResponse([]);
      }
      if (url.includes("/pulls/7")) {
        return jsonResponse({
          body: "",
          head: { sha: "abc" },
          state: "open",
          title: "Bump value",
        });
      }
      return jsonResponse({});
    };
    const { fetch, postedReviews } = stubFetch({
      findings: [
        {
          body: "value should stay 1",
          line: 1,
          path: "app.ts",
          severity: "must-fix",
        },
      ],
      github,
    });
    globalThis.fetch = fetch;

    const events = await collect(
      runReview({
        env: {
          GITHUB_TOKEN: "ght",
          OPENROUTER_API_KEY: "k",
          REVIEW_MODELS: "model-a",
        },
        prompt: "review acme/widgets#7 and post",
        sessionId: "pr-post",
      })
    );

    expect(events.some((event) => event.kind === "error")).toBe(false);

    // The post-review tool ran and reported success.
    const postDone = events.find(
      (event) => event.kind === "tool-done" && event.name === "post-review"
    );
    expect(postDone).toBeDefined();
    if (postDone?.kind === "tool-done") {
      expect(postDone.isError).toBe(false);
    }

    // Exactly one review submission left the process (to the in-memory stub).
    expect(postedReviews).toHaveLength(1);
    expect(postedReviews[0]).toMatchObject({ event: "REQUEST_CHANGES" });

    expect(events.at(-1)).toEqual({ kind: "ended", ok: true });
  });
});
