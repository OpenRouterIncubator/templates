# code-review

A code-review persona template: an agent that reviews pull requests rigorously —
diff and blast-radius analysis, tests, CI, security, spec research — then posts
precise inline comments and a summary verdict. Also investigates bugs to root
cause, patrols open PRs, and measures its own review quality.

Pulled in via:

```sh
ori init my-reviewer --template=code-review
```

## Features

Working commands (real `cmd.ts`, GitHub + OpenRouter integration):

- `review-pr` — fetch the PR diff, analyze via OpenRouter (optionally a second
  model), run a local **secret-grep** pass, resolve findings onto valid diff
  lines, **dedup against existing review threads**, skip when CI is already
  failing, and post an inline review with a verdict. `--format json` prints the
  review instead of posting. Run: `ori code-review review-pr <owner/repo#N>`.
- `investigate-bug` — scan the local repo for the report's terms and produce a
  root-cause analysis with `file:line` citations via OpenRouter.
  Run: `ori code-review investigate-bug "<bug report>" [--max-files N]`.
- `search-pr` — scoped, time-windowed GitHub PR search (`--org`/`--repo`
  required). Run: `ori code-review search-pr --repo acme/x --author kit`.
- `pr-patrol` — sweep a repo's open PRs and report which need maintenance
  (conflicts, rebase, blocked, failing checks, draft, stale). Read-only.
  Run: `ori pr-patrol run --repo acme/x`. Also runnable directly with Bun
  (`bun features/pr-patrol/cmd.ts --repo acme/x`); the included
  `.github/workflows/pr-patrol.yml` drives it on `pull_request` events.

Guidance skills (methodology the agent applies):

- `system` — always-on reviewer persona (find root cause, never skim).
- `eval-review-quality` — measure and calibrate review quality offline.
- `auto-review` — configuration for automatic review per repo/user.

The commands read `GITHUB_TOKEN` (or `GH_TOKEN`) and `OPENROUTER_API_KEY` from
the command environment; `review-pr` accepts optional `REVIEW_MODEL` and
`REVIEW_MODEL_SECONDARY` (a second model whose findings are merged in).
