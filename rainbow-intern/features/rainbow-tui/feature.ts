// The discoverable contribution entry: the feature loader only scans
// `feature.ts` for module exports, and the chat UI export must be named
// `chat`. Named "tui" so it shadows Ori's built-in chat contribution and
// becomes the default TUI that `ori tui` attaches to (the built-in stays
// reachable via `ori tui --built-in`). The Ink JSX lives in the sibling
// `app.tsx`; the pure helpers live in `rainbow.ts` and `events.ts`; the
// non-TTY fallback lives in `piped.ts`.
import { stdin } from "node:process";
import { Effect } from "effect";
import { render } from "ink";
import { createElement } from "react";
import { App } from "./app.tsx";
import type { ChatRuntime } from "./events.ts";
import { runPiped } from "./piped.ts";

interface ChatContribution {
  readonly name: string;
  readonly start: (chat: ChatRuntime) => Effect.Effect<void>;
  readonly stop: () => Effect.Effect<void>;
}

let app: ReturnType<typeof render> | undefined;

export const chat = {
  name: "tui",
  start: (chatRuntime: ChatRuntime) =>
    Effect.promise(async () => {
      if (stdin.isTTY) {
        app = render(createElement(App, { chat: chatRuntime }));
        await app.waitUntilExit();
        return;
      }
      await runPiped(chatRuntime);
    }),
  stop: () =>
    Effect.sync(() => {
      app?.unmount();
    }),
} satisfies ChatContribution;
