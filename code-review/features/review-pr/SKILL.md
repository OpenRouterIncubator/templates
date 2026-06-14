---
name: review-pr
description: Review a pull request end to end — diff and blast-radius analysis, tests, CI, security, and spec research — then post precise inline comments and a summary with a verdict.
---

# Review a Pull Request

Do a deep review, not a skim. Always find the root cause, check the actual spec,
and verify before posting.

## Scale the review to the PR

Size the effort to the diff. Tiny PRs get a focused pass; large or risky PRs get
the full method below. On a re-review, skip code you already reviewed unless it
changed, and short-circuit entirely if the head commit is unchanged.

## Set up a clean checkout

Work from a local clone in an isolated worktree for the PR branch, so the review
is reproducible and never disturbs other work.

## Read the diff and its blast radius

Read the full diff first. Then, for every changed symbol, trace impact:

- **Functions / exported symbols** — who calls them; do the callers still hold?
- **Types / interfaces / schemas** — every consumer that must change with them.
- **API routes / handlers / events** — callers, contracts, and backward compat.
- **Tests** — is the new behavior actually covered? Are old tests now wrong?

## Regression checklist

Before writing any finding, answer: does this break an existing caller, change a
public contract, drop test coverage, alter persisted data, or introduce a race,
N+1, or unbounded growth?

## Security pass

Grep the diff for secret patterns. For any security-relevant category touched
(authn/authz, input handling, serialization, file/network access), name the
attacker class and what precondition now holds. Report only substantiated risks.

## CI status

Read CI. For failures, form a hypothesis from the logs and confirm it against the
diff before claiming a cause.

## Deep research, then root-cause

Identify what's uncertain. Check the spec/docs and known issues; find a reference
implementation when it helps. **Root-cause every finding before flagging it** —
no symptom-level guesses. Optionally run a second, independent model pass in
parallel and merge its findings.

## Compile, validate, dedup

Compile findings with precise file+line locations. Drop anything you can't
substantiate. Validate line numbers locally, and don't repeat a comment that
already exists on the thread.

## Post the review

Post line-level inline comments plus a summary, and a clear verdict: approve,
request changes, or comment. Keep must-fix separate from suggestions; if nothing
is wrong, say so and note any residual risk.
