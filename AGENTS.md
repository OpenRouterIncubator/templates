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

- Each template is its own Bun workspace; there is no root workspace.
- Start a new template by copying `default/` (it mirrors `ori init` output).
- Validate locally before pushing:
  `cd <template> && bun install && bun run typecheck && bun run check`.
- `main` requires PRs with **signed/Verified commits**, a green `verify` check,
  and **resolved conversations**.
