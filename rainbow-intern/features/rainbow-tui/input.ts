// Pure interpretation of a keypress into the next editor command, lifted out of
// the Ink component so the input rules can be unit-tested without a live
// terminal. `App` owns the React state and the effects (exit, submit, edit the
// buffer); this only decides which of those should happen for a given key.
import type { Key } from "ink";

import { EXIT_COMMAND } from "./events.ts";

export type KeyCommand =
  | { readonly kind: "append"; readonly char: string }
  | { readonly kind: "backspace" }
  | { readonly kind: "exit" }
  | { readonly kind: "ignore" }
  | { readonly kind: "submit"; readonly prompt: string };

// Mouse clicks arrive as CSI escape sequences that Ink's keypress parser
// doesn't recognize as named keys, so every key flag is false and the raw
// payload would fall through to the append case. After Ink strips the leading
// ESC, the payload starts with `[<` (SGR mouse mode) or `[M` (X10 mouse mode);
// matching those prefixes lets us discard clicks, drags, and scrolls before
// they garble the prompt line.
const isMouseEvent = (char: string): boolean =>
  char.startsWith("[<") || char.startsWith("[M");

// Pure: map a keypress (plus the current input buffer and busy flag) to a
// command. Ctrl-C is resolved before the busy guard so the user can always bail
// out mid-stream. A return key trims the buffer and either exits (on the
// `/exit` command) or submits; `App` clears the buffer and skips empty prompts.
// Mouse events are ignored so terminal clicks don't pollute the input buffer.
export const interpretKey = (
  char: string,
  key: Key,
  input: string,
  busy: boolean
): KeyCommand => {
  if (key.ctrl && char === "c") {
    return { kind: "exit" };
  }
  if (busy) {
    return { kind: "ignore" };
  }
  if (key.return) {
    const prompt = input.trim();
    if (prompt === EXIT_COMMAND) {
      return { kind: "exit" };
    }
    return { kind: "submit", prompt };
  }
  if (key.backspace || key.delete) {
    return { kind: "backspace" };
  }
  if (isMouseEvent(char)) {
    return { kind: "ignore" };
  }
  return { kind: "append", char };
};
