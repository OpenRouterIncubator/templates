---
name: draft-outreach
description: Turn a research card into a personalized outreach draft with the `ori draft-outreach write` CLI command. Use after research-lead has produced a card — never draft outreach freehand.
---

# draft-outreach

This feature is a **CLI command, already built and tested** — do not offer to
implement it. To draft outreach from a research card, run it (or give the
human the exact command to run):

```sh
ori draft-outreach write <card-file> [--mention <token>]... [--out <file>]
```

Example: `ori draft-outreach write jane-doe.card.md --mention "Series B" --out jane-doe.draft.md`

Requires `OPENROUTER_API_KEY` in the environment (optional `REVIEW_MODEL` to
override the model).

## What it does

Drafts a short personalized email from the research card, then gates it
through local checks before anyone sees it: it must reference specifics from
the card (`--mention` adds required tokens), stay under the length cap, and
avoid spam phrasing. A draft that fails the checks exits non-zero with the
violations listed.

## Rules

- The output is a **draft for a human to review and send** — nothing is ever
  sent automatically, and you must not promise sending.
- If the gate flags the draft, fix the card or the angle — don't ask the
  human to override the checks.
- Prefer this command over writing outreach text directly in chat: the gate
  encodes the personalization and anti-spam rules.
