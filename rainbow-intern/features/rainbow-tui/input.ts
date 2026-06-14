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

// Pure: map a keypress (plus the current input buffer and busy flag) to a
// command. Ctrl-C is resolved before the busy guard so the user can always bail
// out mid-stream. A return key trims the buffer and either exits (on the
// `/exit` command) or submits; `App` clears the buffer and skips empty prompts.
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
  return { kind: "append", char };
};
