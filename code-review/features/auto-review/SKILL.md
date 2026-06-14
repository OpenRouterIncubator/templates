---
name: auto-review
description: Configuration for automatic PR review — enable or disable per repo, per-user opt-out, and per-user review-style preferences, with an audit trail.
---

# Auto-Review Configuration

Control when reviews run automatically, and how, per repository and per person.

## Controls

- **Per-repo enable/disable** — opt a repository in or out of automatic review.
- **Per-user opt-out** — let an author exclude their own PRs.
- **Review-style preference** — per-user defaults (e.g. terse vs. detailed,
  must-fix-only vs. include-suggestions) that the reviewer honors.

## Behavior

- Only auto-review where the repo is enabled and the author hasn't opted out.
- Apply the author's style preference to the review output.
- Keep an audit trail of config changes (who changed what, when) so behavior is
  explainable.
