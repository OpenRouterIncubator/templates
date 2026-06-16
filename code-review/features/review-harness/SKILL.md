---
name: review-harness
description: The intern's adaptive agent runtime — chats by default and runs a multi-stage code review on request. Reference for how it routes prompts and how to configure it.
---

# Review Harness

This feature is the intern's agent runtime. It is **adaptive**: it chats
normally by default, and switches into a purpose-built code reviewer when you
ask for a review. Reviews fan the diff out across dimensions, run each across an
ensemble of models, vote to keep only corroborated findings, and stream a
verdict.

## What it does (the prompt decides)

- A **pull-request reference** (`owner/repo#123` or a PR URL) → reviews that PR's
  diff and (by default) posts the review. Needs a GitHub token.
- A prompt that **opens with a review verb** — `review`, `audit`, `critique`,
  `code review` (e.g. `review my changes`) → reviews the **local working diff**
  (`git diff`; falls back to the last commit when the tree is clean). No token.
- **Anything else** → a normal **chat** turn: a streamed assistant reply that
  honors the persona system prompt (so `system/prompt.md` and skills apply).

So `review my staged changes` runs a review, while `how should I structure this
module?` just answers.

## PR mode posts automatically

In PR mode the harness **posts the review to GitHub by default** — a single
review with inline comments on the changed lines, a summary body, and a verdict
(`APPROVE` / `COMMENT` / `REQUEST_CHANGES`). When the model proposes a concrete
fix, the inline comment includes a committable GitHub **suggestion** block.
Findings already raised on the PR are skipped, so re-running doesn't duplicate.

To preview a single review without writing, add an opt-out cue to the prompt:
`dry run`, `no post`, `don't post`, or `preview` (e.g. `review owner/repo#123
dry run`).

You can also change the **default** conversationally: tell the intern
"don't post comments by default" (or "report only") and it keeps reviews
report-only for the rest of the session; "post by default" turns auto-posting
back on. A per-review cue still overrides the standing default. (Preferences are
per session and reset when `ori dev` restarts.)

## How findings are confirmed

Each dimension (correctness, security, performance, API & contracts, tests) is
reviewed by every configured model. Findings are merged by location and text;
a finding's **confidence** is the share of models that raised it. A `must-fix`
surfaces on a single vote; a `suggestion` must be corroborated by a majority,
otherwise it is demoted as low-confidence. Voting is the false-positive filter.

## Configuration (environment)

- `OPENROUTER_API_KEY` — required (chat and review).
- `GITHUB_TOKEN` / `GH_TOKEN` — for PR mode; falls back to `gh auth token` then
  the git credential helper, so signed-in users need not set it.
- `REVIEW_MODELS` — comma-separated model list (overrides the default ensemble).
- `REVIEW_MODEL` / `REVIEW_MODEL_SECONDARY` — set the primary / secondary model.

Dial the ensemble down to one model to skip voting (every finding is then taken
at face value), or up to three-plus for stricter corroboration. More models and
dimensions mean more API calls per review.
