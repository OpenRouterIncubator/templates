// The discoverable contribution entry: the feature loader only scans
// `feature.ts` for module exports, and the chat UI export must be named `chat`.
// Named "tui" so it shadows Ori's built-in chat contribution and becomes the
// default surface `ori dev` / `ori tui` attaches to (the built-in stays
// reachable via `ori tui --chat built-in-tui`). The Ink JSX lives in `app.tsx`.
import { stdin } from "node:process";
import { render } from "ink";
import { createElement } from "react";

import type { ChatRuntime } from "./app.tsx";

import { App, runPiped } from "./app.tsx";

interface ChatContribution {
  readonly name: string;
  readonly start: (chat: ChatRuntime) => Promise<void>;
  readonly stop: () => Promise<void>;
}

let app: ReturnType<typeof render> | undefined;

export const chat = {
  name: "tui",
  async start(chatRuntime: ChatRuntime) {
    if (stdin.isTTY) {
      app = render(createElement(App, { chat: chatRuntime }));
      await app.waitUntilExit();
      return;
    }
    await runPiped(chatRuntime);
  },
  stop: () => {
    app?.unmount();
    return Promise.resolve();
  },
} satisfies ChatContribution;
