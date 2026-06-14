---
name: feature-development
description: How an Ori feature is structured and how to add or update one — prompts, skills, harnesses, commands, and other contributions.
---

# Feature Development

An Ori feature is a directory under `features/`. Its **id is the directory name**,
and its behavior comes entirely from conventionally named **contribution files** —
there is no registration step and no central config to edit.

## What a feature looks like

```text
features/
  <feature-id>/
    package.json     # @ori-monorepo/<feature-id> (workspace package)
    prompt.md        # always-on base system-prompt fragment
    SKILL.md         # on-demand skill (frontmatter: name, description)
    generation.ts    # default model / temperature / persona
    harness.ts       # an agent backend
    cmd.ts           # a CLI command, mounted at `ori <feature-id> <cmd>`
    route.ts         # an HTTP route
    feature.json     # optional Ori options (shadows, entry, ...)
```

Every file is optional and independent: a feature contributes to a capability
only when the matching file exists, so a feature may carry any subset of these.

## The contributions you'll use most

- **`prompt.md`** — always-on instructions folded into the base system prompt.
  Plain markdown, no frontmatter required.
- **`SKILL.md`** — on-demand guidance, surfaced only when the skill is engaged.
  Frontmatter must set `name` and `description`; the body is free-form prose. Add
  more skills under `skills/<name>/SKILL.md`.
- **`generation.ts`** — run defaults: `model`, `temperature`, and `persona`.
- **`harness.ts` / `cmd.ts` / `route.ts` / `db.ts` / `vcs.ts` / …** — typed
  contributions; each `default`-exports one value or an array.

## Prompt vs. skill

A `prompt` is **always on** — its text is part of every turn's base instructions.
A `skill` is **on demand** — surfaced only when that skill is engaged. Put
persistent working style in `prompt.md`; put situational, capability-specific
guidance in a `SKILL.md`.

## Adding or updating a feature

1. Create `features/<feature-id>/` and add only the contribution files it needs.
2. Add a `feature.json` only when you need `shadows`, `entry`, or other options —
   most features don't have one.
3. Run `ori features validate` after changing a feature's shape.
