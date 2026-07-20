---
name: create-template
description: Create or update a persona template in the examples repo — scaffold the workspace, author features, run the checks, and open a PR. Use when adding a new template folder (e.g. customer-support) or editing an existing one.
---

# Create a Persona Template

This repo is a collection of **persona templates** for
[Ori](https://github.com/OpenRouterIncubator/ori). Each top-level folder
(`default/`, …) is a complete, self-contained Ori project.

> `ori init my-intern --template=<name>` scaffolds from this repo: it fetches
> the `main` tarball and copies the template folder verbatim, then rewrites
> the root `package.json` (workspace `name` + an injected `ori` dependency),
> appends `.gitignore` entries, stamps a `version` into `ori.md`, and
> materializes `.ori/sdk` + `.ori/docs/`. Everything else a template commits
> is exactly what users receive.

## Mental model

- A template is a full Bun/TypeScript Ori **workspace**, not just loose files.
- `default/` is the baseline and matches what `ori init` produces. Start every
  new template by copying it.
- An Ori **feature** is a directory under `features/`; its id is the directory
  name. Behavior comes from conventionally named contribution files — there is
  no registration step.

## Contract sources — use Ori's, don't copy them here

Contribution shapes are **Ori's contract, maintained in Ori** — hand-copied
specs in this file have rotted before (the pre-2026-07 revision documented a
command mechanism Ori had deleted). Treat everything below as orientation and
these as the authorities:

- **`.ori/docs/` mirror** — the full framework docs, embedded in the CLI
  binary, so always version-matched and offline. Written by `ori init .` and
  `ori dev`. Start at `.ori/docs/llms.txt`; the complete command contract is
  `reference/capabilities/command.mdx`.
- **`ori features new <id> --kind <kind>`** (kinds: `harness`, `chat`,
  `schedule`, `api`, `prompt`, `skill`, `command`) — scaffolds a
  current-shape feature. It emits `defineCommand(...)` with type imports from
  `"ori"`; apply the no-`ori`-imports idiom below before committing.
- **`feature-development` skill** — materialized at
  `.agents/skills/feature-development/` by `ori dev`/`ori code` (NOT by
  `ori init .`). A materialized copy refreshes only when those commands run —
  it can be silently stale or a dangling symlink with no warning at read
  time. When in doubt, trust the `.ori/docs/` mirror.
- **`ori features validate`** — checks discovery, that each `feature.ts`
  bundles, and that export names are recognized (with did-you-mean hints). It
  does **not** shape-check contribution values — a stale or malformed command
  object passes — and dependency-free templates also lose the `satisfies`
  compile check, so verify shapes by reading the docs mirror. Works offline
  in a dependency-free template.

## Template layout

```text
<template>/
  package.json      # "name": "<template>", "workspaces": ["features/*"]
  tsconfig.json
  biome.json        # non-default templates; default lints via `ori lint`
  bunfig.toml
  .gitignore
  README.md
  features/
    system/
      prompt.md     # always-on base system prompt (the persona)
    <skill-feature>/
      SKILL.md      # on-demand guidance (frontmatter: name, description)
    <command-feature>/
      package.json  # @ori-monorepo/<id> — only code-bearing features need one
      command.ts    # default-exports the command contribution
```

## Contribution files you'll use

- `prompt.md` — always-on instructions folded into the base system prompt.
  Plain markdown; frontmatter is optional (`name`, `order`, `section`). This
  is where the persona lives.
- `SKILL.md` — on-demand guidance, surfaced only when the skill is engaged.
  Frontmatter MUST set `name` and `description`; the body is free-form prose. Add
  more skills under `skills/<name>/SKILL.md`.
- `command.ts` — a deterministic command, invocable as `/name` by a human and
  as a tool by the agent (same `run` either way). A standalone file MUST
  `export default` the contribution: `features/<id>/command.ts` (name defaults
  to the feature id) or `commands/<name>/command.ts` (name defaults to
  `<name>`). Alternatively export `command` (single) or `commands` (array of
  named entries) from `feature.ts`.
- `feature.ts` — the feature module entry. Only needed for `harness`, `chat`,
  `schedule`, `api`, or `prompt` contributions, or a multi-command `commands`
  array — those are its named exports (the closed set: `harness`, `chat`,
  `schedule`, `api`, `prompt`, `command`, `commands`). A plain command needs
  just `command.ts`.

> **Templates author plain TS that doesn't import Ori's types.** This is the
> one idiom Ori's own docs do NOT cover (they say `import type ... from "ori"`;
> templates ship dependency-free, so they can't). Scaffold with
> `ori features new`, then replace the `ori` type imports with a local
> structural interface matching `references/contract-intern.md` so `run` stays
> typed. Discovery is by file/export name alone — there are no `type`
> discriminants. Declare arguments in the spec and let the runtime parse and
> validate them — never hand-roll parsing from raw argv:
>
> ```ts
> // features/changelog/command.ts — registers /changelog
> type Args = { readonly days: number };
>
> interface CommandContext {
>   readonly args: Args; // parsed + typed from `arguments` by the runtime
>   readonly argv: string; // raw text after /name
>   readonly exec: (
>     bin: string,
>     args?: readonly string[]
>   ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
>   readonly log: (line: string) => void;
>   readonly invoker: { readonly via: "slash" | "tool" };
>   readonly cwd: string;
> }
>
> interface CommandResult {
>   readonly ok: boolean;
>   readonly message?: string;
> }
>
> const command = {
>   description: "Summarize recent commits as a changelog",
>   arguments: {
>     days: {
>       type: "number",
>       description: "How many days back to look",
>       default: 7,
>       positional: true,
>     },
>   },
>   run: async (ctx: CommandContext): Promise<CommandResult> => {
>     const out = await ctx.exec("git", [
>       "log",
>       `--since=${ctx.args.days} days ago`,
>       "--oneline",
>     ]);
>     if (out.exitCode !== 0) {
>       return { ok: false, message: out.stderr.trim() };
>     }
>     ctx.log("scanned git history"); // progress; never console.log
>     return { ok: true, message: out.stdout.trim() || "No commits." };
>   },
> };
>
> export default command;
> ```

The example is the idiom, not the spec — it omits `emit`, `env`, `logger`,
`invoker.scopes`, and the optional `data` result field. The complete, current
command shape lives in the docs mirror:
`.ori/docs/` → `reference/capabilities/command.mdx`.

Conventions:

- Feature id = directory name. Code-bearing features carry a `package.json`
  (`@ori-monorepo/<id>`); skill-only features need just their `SKILL.md`.
- Keep template skills **guidance-only**. Do not wire external infrastructure
  (HubSpot, Gmail, Slack, …) into a template — capture the playbook, not the
  integration.

## Steps to add a template

1. Copy the baseline: `cp -r default <template>`.
2. Set the workspace name in `<template>/package.json` (`"name": "<template>"`)
   and rewrite `<template>/README.md`.
3. Create `<template>/features/system/prompt.md` with the persona —
   `default/` ships without a `system/` feature (its persona lives in the
   root `ori.md`), so this folder is yours to add.
4. Add capability skills as `<template>/features/<id>/` folders, each with a
   `SKILL.md` (a `package.json` only when the feature ships code). Remove
   `default`'s `dashboard` feature if it doesn't fit the persona.
5. Add a row for the template to the root `README.md` table.

## Validate before pushing

```sh
cd <template>
bun install
bun run typecheck        # tsc --noEmit
bun run check            # ultracite (lint + format)
bun test                 # if the template ships tests
ori features validate    # discovery + feature.ts bundling (not value shapes)
```

`default/` is the exception: it has no `check` script — use `bun run lint`
(`ori lint`) instead.

CI runs these per template (`lint` / `typecheck` / `test`).

A command is invoked as `/name` on the chat surface (or by the agent as a tool
call) — there is no feature-id or project-name prefix. To exercise a full boot,
run `ori dev` in the template, since `ori build`/`run` are not built-ins yet.

## CI and merge rules (the repo precedent)

- CI (`.github/workflows/ci.yml`) auto-discovers every top-level directory
  with a `package.json` and runs, per template, `lint` (the template's
  `check`/`lint` script — ultracite, or `ori lint` for `default` — plus a
  commitlint PR-title check), `typecheck`, and `test`. New templates are
  picked up automatically.
- `main` is protected by a ruleset: changes land via **PR**, the `lint`,
  `typecheck`, and `test` checks must pass, **1 approval**, **signed/Verified
  commits**, and **all conversations resolved**. Force-pushing and deleting
  `main` are blocked.
- Flow: branch → commit (signed) → push → open PR → squash-merge once green.

## Don'ts

- Don't place a template's skills outside its own folder or at the repo root.
- Don't make the repo *root* a workspace that pulls in the templates — each
  template is its own independent workspace. (A root `package.json` for repo
  dev-tooling like commitlint, with no `workspaces` field, is fine — that's what
  the repo uses.)
- Don't reference infrastructure or secrets in template content.
