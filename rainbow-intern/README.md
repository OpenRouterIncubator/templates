# rainbow-intern

A persona template that ships a **custom default TUI** built with
[Ink](https://github.com/vadimdemedes/ink) (React for terminals): a `chat`
contribution that reads your prompts, streams the harness's replies, and renders
the assistant's text in rainbow colors. It's an example of replacing Ori's
built-in TUI with your own, using the same Ink + React stack as ori's built-in
`chat-tui`.

Pulled in via (planned):

```sh
ori init my-intern --template=rainbow-intern
```

## Features

- `rainbow-tui` — a `chat` contribution (`feature.ts`) named `tui` so it
  shadows the built-in and becomes the default TUI. In an interactive terminal
  it renders the conversation as an Ink component (`app.tsx`, a thin container
  over the `MessageView` components in `message.tsx`), coloring each character
  of the streamed `assistant.text.delta` events across a six-step rainbow; runtime
  errors and failed turns show as status lines. Under a non-TTY harness (piped
  stdin) it falls back to plain ANSI line streaming (`piped.ts`). The pure
  helpers — `colorRuns`/`colorize` in `rainbow.ts`,
  `statusText`/`isAssistantDelta` in `events.ts`, and `interpretKey` in
  `input.ts` — are unit-tested.
- `system` — always-on intern persona (small reviewable changes, follow
  conventions, strict TypeScript) plus a `feature-development` skill.
- `review` — on-demand code/plan review guidance.

## The Ink / `.tsx` setup

This template enables JSX so the TUI can be written as React/Ink components:

- `tsconfig.json` sets `"jsx": "react-jsx"` (React 19's automatic runtime — no
  `import React` needed). The `**/*.tsx` include glob alone is not enough; the
  `jsx` compiler option is what actually parses JSX.
- `package.json` depends on `ink` + `react` (and `@types/react` for types) —
  the same stack as ori's built-in TUI.

## Running it

Once consumed into an Ori workspace, the custom runtime is the default: the
contribution is named `tui`, which shadows Ori's built-in chat contribution, so
a plain attach launches the rainbow Ink TUI:

```sh
ori dev          # terminal 1: dev server
ori tui          # terminal 2: attaches to the rainbow runtime
```

To fall back to the stock TUI (for example while hacking on the rainbow one),
attach with the built-in flag:

```sh
ori tui --built-in
```

Ink needs a real terminal; under a non-TTY harness the runtime uses its piped
line-mode fallback instead.

## Notes

- The contribution is exported as `chat` from `features/rainbow-tui/feature.ts`
  (the only filename the feature loader scans for module exports); the
  `colorRuns`/`colorize` (`rainbow.ts`), `statusText`/`isAssistantDelta`
  (`events.ts`), and `interpretKey` (`input.ts`) helpers are kept pure so they
  can be tested without a live runtime. The presentational `message.tsx`
  components and the `app.tsx` container are exercised by typecheck and by hand
  in a terminal.
- No API key is required by the template itself; the harness behind the runtime
  may need its own (e.g. `OPENROUTER_API_KEY`).
