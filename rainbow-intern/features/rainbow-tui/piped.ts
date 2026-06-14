// Non-TTY fallback: stream piped stdin incrementally — each complete line is
// sent as a prompt as soon as it arrives (a partial-line tail is carried
// across chunks), so a long-lived pipe streams instead of waiting for EOF and
// memory stays bounded. `/exit` stops processing entirely, matching the
// interactive path. The source and sink are injectable for tests and default
// to the real stdin/stdout.
import { stdin, stdout } from "node:process";

import type { ChatRuntime } from "./events.ts";

import { EXIT_COMMAND, isAssistantDelta, statusText } from "./events.ts";
import { colorize } from "./rainbow.ts";

const ANSI_RESET = "\u001B[0m";
const SYSTEM_COLOR = "\u001B[33m";
const LINE_BREAK = /\r?\n/u;

interface Sink {
  readonly write: (text: string) => unknown;
}

const sendPrompt = async (
  chat: ChatRuntime,
  prompt: string,
  offset: number,
  sink: Sink
): Promise<number> => {
  let next = offset;
  for await (const event of chat.sendMessage({ prompt })) {
    if (isAssistantDelta(event)) {
      const result = colorize(event.payload?.delta ?? "", next);
      sink.write(result.text);
      next = result.offset;
      continue;
    }
    const status = statusText(event);
    if (status !== undefined) {
      sink.write(`${SYSTEM_COLOR}${status}${ANSI_RESET}\n`);
    }
  }
  sink.write(`${ANSI_RESET}\n`);
  return next;
};

export const runPiped = async (
  chat: ChatRuntime,
  source: AsyncIterable<string> = stdin,
  sink: Sink = stdout
): Promise<void> => {
  if (source === stdin) {
    stdin.setEncoding("utf-8");
  }
  let tail = "";
  let offset = 0;
  for await (const chunk of source) {
    tail += chunk;
    const lines = tail.split(LINE_BREAK);
    tail = lines.pop() ?? "";
    for (const line of lines) {
      const prompt = line.trim();
      if (prompt === EXIT_COMMAND) {
        return;
      }
      if (prompt.length > 0) {
        offset = await sendPrompt(chat, prompt, offset, sink);
      }
    }
  }
  const last = tail.trim();
  if (last.length > 0 && last !== EXIT_COMMAND) {
    await sendPrompt(chat, last, offset, sink);
  }
};
