import { afterEach, describe, expect, it } from "bun:test";

import { parseSseLine, streamChat } from "./chat.ts";

describe("parseSseLine", () => {
  it("extracts a content delta", () => {
    expect(
      parseSseLine('data: {"choices":[{"delta":{"content":"hi"}}]}')
    ).toEqual({ kind: "delta", text: "hi" });
  });

  it("recognizes the done sentinel", () => {
    expect(parseSseLine("data: [DONE]")).toEqual({ kind: "done" });
  });

  it("skips keepalives, empty deltas, and malformed JSON", () => {
    expect(parseSseLine(": keepalive")).toEqual({ kind: "skip" });
    expect(parseSseLine('data: {"choices":[{"delta":{}}]}')).toEqual({
      kind: "skip",
    });
    expect(parseSseLine("data: not json")).toEqual({ kind: "skip" });
  });
});

const encoder = new TextEncoder();

function sseResponse(chunks: readonly string[], status = 200): Response {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status });
}

describe("streamChat", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("yields content deltas across chunk boundaries and honors a system prompt", async () => {
    let sentBody = "";
    globalThis.fetch = ((_url: string, init?: { body?: string }) => {
      sentBody = init?.body ?? "";
      return Promise.resolve(
        sseResponse([
          'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
          'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
          "data: [DONE]\n",
        ])
      );
    }) as unknown as typeof fetch;

    const out: string[] = [];
    for await (const delta of streamChat({
      apiKey: "k",
      model: "m",
      prompt: "hi",
      system: "be terse",
    })) {
      out.push(delta);
    }
    expect(out.join("")).toBe("Hello");
    expect(sentBody).toContain("be terse");
  });

  it("throws on a non-ok response", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(sseResponse(["nope"], 500))) as unknown as typeof fetch;
    const stream = streamChat({ apiKey: "k", model: "m", prompt: "hi" });
    await expect(stream.next()).rejects.toThrow("OpenRouter chat failed");
  });
});
