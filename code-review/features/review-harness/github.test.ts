import { afterEach, describe, expect, it } from "bun:test";

import {
  createReview,
  fetchPullRequest,
  listChangedFiles,
  listReviewComments,
} from "./github.ts";
import type { PullRequestRef } from "./pr-ref.ts";

const REF: PullRequestRef = { number: 7, owner: "acme", repo: "widgets" };
const FIRST_PAGE = /[?&]page=1(?:&|$)/;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("github REST client", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws via ensureOk with status and detail on a non-2xx response", async () => {
    // Drives the ensureOk failure branch (read body, throw with status).
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response("not found", { status: 404 })
      )) as unknown as typeof fetch;

    await expect(fetchPullRequest(REF, "t")).rejects.toThrow(
      "Fetch pull request failed (HTTP 404): not found"
    );
  });

  it("pages changed files: a full page continues, a short page breaks", async () => {
    // A first full page (PER_PAGE items) keeps the loop going (the `if` is
    // false), then a short second page triggers the break — covering both the
    // continue and break edges.
    const fullPage = Array.from({ length: 100 }, (_unused, index) => ({
      additions: 1,
      deletions: 0,
      filename: `f${index}.ts`,
      patch: "@@ -1 +1 @@",
      status: "modified",
    }));
    globalThis.fetch = ((url: string) =>
      Promise.resolve(
        FIRST_PAGE.test(url) ? jsonResponse(fullPage) : jsonResponse([{}])
      )) as unknown as typeof fetch;

    const files = await listChangedFiles(REF, "t");
    expect(files).toHaveLength(101);
    expect(files.at(-1)).toEqual({
      additions: 0,
      deletions: 0,
      filename: "",
      patch: undefined,
      status: "",
    });
  });

  it("pages review comments: a full page continues, a short page breaks", async () => {
    // Same paging shape for the comments endpoint: full page then short page.
    const fullPage = Array.from({ length: 100 }, (_unused, index) => ({
      body: `c${index}`,
      line: index,
      path: "app.ts",
    }));
    globalThis.fetch = ((url: string) =>
      Promise.resolve(
        FIRST_PAGE.test(url) ? jsonResponse(fullPage) : jsonResponse([{}])
      )) as unknown as typeof fetch;

    const comments = await listReviewComments(REF, "t");
    expect(comments).toHaveLength(101);
    expect(comments.at(-1)).toEqual({ body: "", line: null, path: "" });
  });

  it("posts a review without throwing on a 2xx response", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(jsonResponse({ id: 1 }))) as unknown as typeof fetch;

    await expect(
      createReview(REF, "t", { body: "ok", comments: [], event: "COMMENT" })
    ).resolves.toBeUndefined();
  });
});
