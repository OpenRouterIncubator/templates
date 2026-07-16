---
name: create-template
description: Create or update a persona template in the examples repo — scaffold the workspace, author features, run the checks, and open a PR. Use when adding a new template folder (e.g. customer-support) or editing an existing one.
---

# Create a Persona Template

This repo is a collection of **persona templates** for
[Ori](https://github.com/OpenRouterIncubator/ori). Each top-level folder
(`default/`, …) is a complete, self-contained Ori project.

> **`ori init --template=<name>` is planned, not shipped yet.** Today, use a
> template by copying its `features/` into a project, or run it in place from the
> template directory.

## Mental model

- A template is a full Bun/TypeScript Ori **workspace**, not just loose files.
- `default/` is the baseline and matches what `ori init` produces. Start every
  new template by copying it.
- An Ori **feature** is a directory under `features/`; its id is the directory
  name. Behavior comes from conventionally named contribution files — there is
  no registration step.

## Template layout

```text
<template>/
  package.json      # "name": "<template>", "workspaces": ["features/*"]
  tsconfig.json
  biome.json
  bunfig.toml
  .gitignore
  README.md
  features/
    system/
      package.json  # @ori-monorepo/system
      prompt.md     # always-on base system prompt (the persona)
      index.ts      # export {};  — gives tsc an input so typecheck passes
    <skill-feature>/
      package.json  # @ori-monorepo/<id>
      SKILL.md      # on-demand guidance (frontmatter: name, description)
```

## Contribution files you'll use

- `prompt.md` — always-on instructions folded into the base system prompt. Plain
  markdown, no frontmatter. This is where the persona lives.
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

The `generation` kind (`model`/`temperature`/`persona`) is **deferred** in the
current Ori spec (RFC 0003.2 — defaults come from the harness), so don't add a
`generation.ts`; put persona/working-style in `system/prompt.md` instead.

> **Templates author plain TS that doesn't import Ori's types.** Discovery is
> by file/export name alone — there are no `type` discriminants. Define a local
> structural interface matching the contract so `run` stays typed. Declare
> arguments in the spec and let the runtime parse and validate them — never
> hand-roll parsing from raw argv:
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

Command rules:

- `name` is optional (slug `[a-z][a-z0-9-]*`); it defaults from the file or
  feature path and is only required for entries in a `feature.ts` `commands`
  array. `scopes` optionally lists capability scopes the invoker must hold.
- The same `run` serves a human typing `/name` and the agent calling the
  command as a tool — branch on `ctx.invoker.via` only when output should
  differ.
- No `console.*` or `process.stdout`/`stderr` in contributions (RFC 0011):
  stream progress via `ctx.log`/`ctx.emit` and put the outcome in the returned
  `message` (plus optional structured `data`).
- Return `{ ok: false, message }` for expected failures; a thrown error is
  caught and reported as `ok: false`.
- The full `CommandContext` also carries `emit(event)`, `env`, and a `logger`
  scoped to the feature.

Conventions:

- Feature id = directory name. Each feature has its own `package.json` named
  `@ori-monorepo/<id>`.
- No `feature.json` unless you need `shadows` (override a same-named entry) or
  `entry` (point a contribution at a non-canonical filename).
- Prompt vs skill: persistent working style → `prompt.md`; situational,
  capability-specific guidance → `SKILL.md`.
- Keep template skills **guidance-only**. Do not wire external infrastructure
  (HubSpot, Gmail, Slack, …) into a template — capture the playbook, not the
  integration.

## Steps to add a template

1. Copy the baseline: `cp -r default <template>`.
2. Set the workspace name in `<template>/package.json` (`"name": "<template>"`)
   and rewrite `<template>/README.md`.
3. Author the persona in `<template>/features/system/prompt.md`.
4. Add capability skills as `<template>/features/<id>/` folders, each with a
   `package.json` (`@ori-monorepo/<id>`) and a `SKILL.md`. Remove `default`'s
   `dashboard` feature if it doesn't fit the persona.
5. Add a row for the template to the root `README.md` table.

## Validate before pushing

```sh
cd <template>
bun install
bun run typecheck   # tsc --noEmit
bun run check       # ultracite (lint + format)
bun test            # if the template ships tests
```

CI runs these per template (`lint` / `typecheck` / `test`).

A command is invoked as `/name` on the chat surface (or by the agent as a tool
call) — there is no feature-id or project-name prefix. To exercise a full boot,
run `ori dev` in the template, since `ori build`/`run` are not built-ins yet.

## CI and merge rules (the repo precedent)

- CI (`.github/workflows/ci.yml`) auto-discovers every top-level directory with a
  `package.json` and runs, per template, `lint` (ultracite + a commitlint PR-title
  check), `typecheck`, and `test`. New templates are picked up automatically.
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
