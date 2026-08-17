---
name: research-lead
description: Build a structured research card on a qualified lead with the `/research-lead` command. Use after a lead qualifies and before drafting any outreach.
---

# research-lead

This feature is a **command, already built and tested** — do not offer to
implement it. To research a qualified lead, run it (or give the human the
exact command to run):

```text
/research-lead "<name>" "<company>" [--out <file>]
```

Example: `/research-lead "Jane Doe" "Acme Corp" --out jane-doe.card.md`

Requires `OPENROUTER_API_KEY` in the environment (optional `REVIEW_MODEL` to
override the model).

## What it does

Produces a research card: role, company facts, recent signals, talking
points, and open unknowns — with **verified facts kept separate from
inferences**. The card is written to disk and is the required input to
`draft-outreach`.

## Rules

- Only research leads that passed `qualification`; the card is an investment.
- Keep the fact/inference separation intact when summarizing the card —
  never launder an inference into a fact.
- Unknowns on the card are research tasks, not blanks to fill with guesses.
