import { describe, expect, it } from "bun:test";
import type { AgentRuntimeEvent, ChatRuntime } from "./events.ts";
import { runPiped } from "./piped.ts";

const echoChat = (prompts: string[]): ChatRuntime => ({
  async *sendMessage(input: { readonly prompt: string }) {
    prompts.push(input.prompt);
    const event: AgentRuntimeEvent = {
      payload: { delta: `echo:${input.prompt}` },
      type: "assistant.text.delta",
    };
    yield await Promise.resolve(event);
  },
});

async function* chunks(...parts: readonly string[]): AsyncGenerator<string> {
  for (const part of parts) {
    yield await Promise.resolve(part);
  }
}

const ESC = String.fromCharCode(27);
const COLOR_PREFIX = /^\[\d+m/u;

// Drop the ANSI color prefixes colorize() emits so assertions read plainly.
const stripAnsi = (text: string): string =>
  text
    .split(ESC)
    .map((part) => part.replace(COLOR_PREFIX, ""))
    .join("");

const collectingSink = (written: string[]) => ({
  write: (text: string) => written.push(text),
});

describe("runPiped", () => {
  it("sends each complete line as soon as it arrives, across chunk splits", async () => {
    const prompts: string[] = [];
    const written: string[] = [];
    await runPiped(
      echoChat(prompts),
      chunks("hel", "lo\nwor", "ld\n"),
      collectingSink(written)
    );
    expect(prompts).toEqual(["hello", "world"]);
    const plain = stripAnsi(written.join(""));
    expect(plain).toBe("echo:hello\necho:world\n");
  });

  it("processes a trailing line that has no final newline", async () => {
    const prompts: string[] = [];
    await runPiped(
      echoChat(prompts),
      chunks("first\nlast without newline"),
      collectingSink([])
    );
    expect(prompts).toEqual(["first", "last without newline"]);
  });

  it("stops at /exit instead of skipping it", async () => {
    const prompts: string[] = [];
    await runPiped(
      echoChat(prompts),
      chunks("before\n/exit\nafter\n"),
      collectingSink([])
    );
    expect(prompts).toEqual(["before"]);
  });

  it("skips blank lines without sending empty prompts", async () => {
    const prompts: string[] = [];
    await runPiped(
      echoChat(prompts),
      chunks("\n\n  \nreal\n"),
      collectingSink([])
    );
    expect(prompts).toEqual(["real"]);
  });

  it("writes status events as system-colored lines", async () => {
    const written: string[] = [];
    const statusChat: ChatRuntime = {
      async *sendMessage() {
        yield await Promise.resolve({
          payload: { message: "boom" },
          type: "runtime.error",
        });
      },
    };
    await runPiped(statusChat, chunks("hi\n"), collectingSink(written));
    expect(written.join("")).toContain("[runtime.error] boom");
  });
});
