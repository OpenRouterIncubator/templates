---
name: search-pr
description: Find pull requests by author, reviewer, or involvement — always scoped and time-windowed so unrelated PRs don't leak into results.
---

# Search PRs

Find the right PR by who authored, reviewed, or is involved in it.

## Always scope the search

Unscoped `author:` / `reviewed-by:` / `involves:` queries pull in PRs from the
whole of GitHub. Always constrain to:

- an **org or repo** scope, and
- a **time window** (e.g. the last N days),

so results stay relevant and you don't leak unrelated activity into output.

## Scope flags vs. content flags

Keep "where to look" (org, repo, since) separate from "what to match" (author,
reviewer, state, query text). Apply the scope first, then the content filter.

## When not to use

If you already have the PR number and repo, fetch it directly — don't search.
