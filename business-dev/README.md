# business-dev

A business-development persona template: an agent that researches a lead,
finds a verified work email, drafts personalized outreach for human approval,
and follows a disciplined qualification + sequencing playbook.

Pulled in via (planned):

```sh
ori init my-bd-agent --template=business-dev
```

## Features

Working commands (real `cmd.ts`):

- `find-email` — `ori find-email run "<First Last>" <domain>`: generates the
  common corporate address patterns, then verifies candidates with a DNS MX
  lookup and an SMTP RCPT probe (**no email is ever sent**). Pure node — no
  API keys.
- `research-lead` — `ori research-lead run "<name>" "<company>"`: produces a
  structured research card (role, company facts, signals, talking points,
  unknowns) via OpenRouter, clearly separating verified facts from inferences.
- `draft-outreach` — `ori draft-outreach write <card-file>`: drafts a short
  personalized email from a research card via OpenRouter, then runs local
  personalization checks (must reference card specifics, length cap, no spam
  phrasing). Output is a draft for a human to send — never sent automatically.

Guidance skills:

- `system` — always-on BD persona (research first, personalize, draft for
  approval, never spam, honor opt-outs).
- `qualification` — qualify a lead before investing outreach effort.
- `sequencing` — multi-touch cadence rules and when to stop.

`research-lead` and `draft-outreach` read `OPENROUTER_API_KEY` (and optional
`REVIEW_MODEL`) from the command environment; `find-email` needs nothing.
