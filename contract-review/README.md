# contract-review

A contract-review persona template: an agent that reads legal documents
(MSAs, NDAs, DPAs, SOWs, SLAs, BAAs), extracts the key terms, flags risks,
proposes track-changes-style redlines in your party's favor — and drafts
answers to vendor questionnaires (security reviews, RFPs, due-diligence
forms) from a local archive of past responses.

Pulled in via:

```sh
ori init my-legal-agent --template=contract-review
```

## Features

Working commands (real `command.ts`, file + OpenRouter), invocable as `/name`
by a human or as a tool by the agent:

- `review-contract` — analyze a contract file: document type, parties, key terms,
  obligations, and risks (severity + recommended redline). `--format json`
  returns the structured analysis. Run: `/review-contract <file> [--format json]`.
- `redline` — propose specific edits to a contract in your party's favor,
  anchored to the exact text and rendered as track-changes markup
  (~~delete~~ / **replacement**) with per-edit rationale and severity. Never
  modifies the original file. Run:
  `/redline <file> [--for "<party>"] [--out <file>]`.
- `answer-questionnaire` — draft answers to vendor questionnaires (security
  reviews, RFPs, due-diligence forms), grounded in a local archive of past
  Q&A. Run:
  `/answer-questionnaire <questions-file | "question"> [--archive <dir>]`.

Guidance skills (the playbook the agent applies):

- `system` — legal-analyst persona (precise, cite clauses, flag risk, not legal advice).
- `clause-playbook` — standard positions and red flags per document type.
- `questionnaire-types` — how to handle CAIQ / SOC 2 / HIPAA / GDPR questionnaires.

Commands read `OPENROUTER_API_KEY` (and optional `REVIEW_MODEL`) from the command
environment. This template assists review; it is not a substitute for counsel.
