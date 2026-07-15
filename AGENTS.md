# examples — agent guide

This repo holds **persona templates** for
[Ori](https://github.com/OpenRouterIncubator/ori). Each top-level folder (e.g.
`default/`) is a complete, self-contained Ori workspace, later pulled in via
`ori init my-intern --template=<name>`.

## Creating or editing a template

Follow the **create-template** skill:
[`.agents/skills/create-template/SKILL.md`](.agents/skills/create-template/SKILL.md).
It covers the workspace layout, contribution files, validation, and the PR flow.

## Quick rules

- Each template is its own Bun workspace; there is no root workspace, but the
  root `package.json` has `typecheck`/`check` scripts that fan out over every
  template directory (what CI runs).
- Start a new template by copying `default/` (it mirrors `ori init` output).
- Validate locally before pushing: `bun run typecheck && bun run check` from
  the repo root, or per-template with
  `cd <template> && bun install && bun run typecheck && bun run check` (use
  `bun run lint` instead of `check` for the `default` template).
- A template that depends on the `ori` CLI (`"ori": "file:.ori/sdk"` in its
  `package.json`, currently only `default/`) needs the `ori` CLI installed and
  `ori init .` run once in that directory before `typecheck`/`lint` will pass
  — `ori init .` materializes `.ori/sdk` and installs dependencies.
- `main` requires PRs with **signed/Verified commits**, a green `verify` check,
  and **resolved conversations**.
