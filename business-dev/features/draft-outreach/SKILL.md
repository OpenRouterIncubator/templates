---
name: draft-outreach
description: Turn a research card into a personalized outreach draft with the `/draft-outreach` command. Use after research-lead has produced a card — never draft outreach freehand.
---

# draft-outreach

This feature is a **command, already built and tested** — do not offer to
implement it. To draft outreach from a research card, run it (or give the
human the exact command to run):

```text
/draft-outreach <card-file> [--mention <tokens>] [--out <file>]
```

Example: `/draft-outreach jane-doe.card.md --mention "Series B" --out jane-doe.draft.md`

Requires `OPENROUTER_API_KEY` in the environment (optional `REVIEW_MODEL` to
override the model).

## What it does

Drafts a short personalized email from the research card, then gates it
through local checks before anyone sees it: it must reference specifics from
the card (`--mention` adds required tokens, comma-separated), stay under the
length cap, and avoid spam phrasing. A draft that fails the checks reports a
failed result with the violations listed.

## Rules

- The output is a **draft for a human to review and send** — nothing is ever
  sent automatically, and you must not promise sending.
- If the gate flags the draft, fix the card or the angle — don't ask the
  human to override the checks.
- Prefer this command over writing outreach text directly in chat: the gate
  encodes the personalization and anti-spam rules.
