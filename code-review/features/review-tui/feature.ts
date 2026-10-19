// The discoverable contribution entry: the feature loader only scans
// `feature.ts` for module exports, and the chat UI export must be named `chat`.
// Named "tui" so it shadows Ori's built-in chat contribution and becomes the
// default surface `ori dev` / `ori tui` attaches to (the built-in stays
// reachable via `ori tui --chat built-in-tui`). The Ink JSX lives in `app.tsx`.
import { stdin } from "node:process";
import { Effect } from "effect";
import { render } from "ink";
import { createElement } from "react";
import { App, runPiped } from "./app.tsx";
import type { ChatRuntime } from "./view.ts";

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
