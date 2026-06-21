# default

The baseline Ori persona template — the same workspace `ori init` produces: an
ordinary Bun/TypeScript project whose persona lives in a root `ori.md` (the
default `model` plus the always-on base prompt) and a `review` feature with a
small deterministic review command.

Pulled in via:

```sh
ori init my-intern --template=default
```

`--template=default` is equivalent to a plain `ori init`.

## Layout

- `ori.md` — the persona: frontmatter sets the default `model`; the body is the
  base system prompt (RFC 0002.14).
- `features/review/` — an on-demand `review` skill plus a deterministic
  `ori review <file>` command (`cmd.ts` + `checks.ts`, with tests). No model and
  no network — extend it, or swap in a model-backed review.
