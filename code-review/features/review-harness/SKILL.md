---
name: review-harness
description: The intern's agent runtime — a multi-stage code reviewer that streams findings live. Reference for how it decides what to review and how to configure it.
---

# Review Harness

This feature replaces the intern's generic agent runtime with a purpose-built
code reviewer. Whatever you type in `ori dev` becomes a review request; the
harness fans the diff out across review dimensions, runs each across an ensemble
of models, votes to keep only corroborated findings, and streams a verdict.

## What it reviews (the prompt decides)

- A pull-request reference anywhere in the prompt (`owner/repo#123` or a PR URL)
  → reviews that PR's diff (needs `GITHUB_TOKEN`).
- Anything else → reviews the **local working diff** (`git diff` in the
  workspace; falls back to the last commit when the tree is clean). No token
  needed.

## Posting is opt-in

In PR mode the review is **only** posted to GitHub when the prompt also says
`post` (e.g. `review owner/repo#123 and post`). Otherwise it is report-only, so
a stray prompt never writes to a PR.

## How findings are confirmed

Each dimension (correctness, security, performance, API & contracts, tests) is
reviewed by every configured model. Findings are merged by location and text;
a finding's **confidence** is the share of models that raised it. A `must-fix`
surfaces on a single vote; a `suggestion` must be corroborated by a majority,
otherwise it is demoted as low-confidence. Voting is the false-positive filter.

## Configuration (environment)

- `OPENROUTER_API_KEY` — required.
- `GITHUB_TOKEN` / `GH_TOKEN` — required only for PR mode.
- `REVIEW_MODELS` — comma-separated model list (overrides the default ensemble).
- `REVIEW_MODEL` / `REVIEW_MODEL_SECONDARY` — set the primary / secondary model.

Dial the ensemble down to one model to skip voting (every finding is then taken
at face value), or up to three-plus for stricter corroboration. More models and
dimensions mean more API calls per review.
