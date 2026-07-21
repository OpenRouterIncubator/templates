# content-engine

A content-creation persona template: an agent that researches a topic, produces
a structured content brief, gates drafting behind human approval of the brief,
writes the draft, and lints everything for AI-sounding prose before it ships.

Pulled in via (planned):

```sh
ori init my-writer --template=content-engine
```

## The workflow

```text
/brief generate  →  human edits/approves  →  /brief approve  →  /draft  →  /style
```

A draft can only be written from a brief whose frontmatter says
`status: approved` — the same draft-for-approval gate used across these
templates.

## Features

Working commands (real `command.ts`):

- `brief` — `/brief generate "<topic>" [--out <file>]` produces a structured
  markdown brief (audience, intent, angle, thesis, outline, keywords,
  questions, CTA) via OpenRouter, saved with `status: draft`.
  `/brief approve <file>` validates the required fields and stamps
  `status: approved` (pure file ops, no API).
- `draft` — `/draft <brief-file> [--out <file>]` writes a full draft from an
  **approved** brief via OpenRouter; refuses unapproved briefs.
- `style` — `/style <file>` is a **zero-dependency** anti-AI-prose linter:
  banned-phrase list, em-dash density, hedging density, and exclamation
  density, with line numbers and a verdict. No network, no API.

Guidance skills:

- `system` — always-on content persona (research first, one human voice,
  brief-gated drafting).
- `ideas` — how to generate content ideas worth writing.

Commands read `OPENROUTER_API_KEY` (and optional `REVIEW_MODEL`) from the
command environment; `/style` needs nothing.
