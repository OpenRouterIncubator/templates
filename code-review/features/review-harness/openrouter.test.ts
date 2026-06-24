import { afterEach, describe, expect, it } from "bun:test";

import { requestFindings } from "./openrouter.ts";

describe("requestFindings error path", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws with status and body detail when the response is not ok", async () => {
    // A non-OK response drives the uncovered failure branch: read the body text
    // and surface it in the thrown error.
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response("rate limited", { status: 429 })
      )) as unknown as typeof fetch;

    await expect(
      requestFindings({
        apiKey: "k",
        model: "model-a",
        prompt: "p",
        system: "s",
      })
    ).rejects.toThrow("OpenRouter request failed (HTTP 429): rate limited");
  });
});
