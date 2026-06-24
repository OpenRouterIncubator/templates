# default

The baseline Ori persona template — the same workspace `ori init` produces: an
ordinary Bun/TypeScript project with a `system` feature (always-on base prompt +
a feature-development skill) and a `review` feature (on-demand review skill).

Pulled in via:

```sh
ori init my-intern --template=default
```

`--template=default` is equivalent to a plain `ori init`.

## Fresh clone? Run `ori init .` before `bun install`

This project depends on the Ori SDK via `"ori": "file:.ori/sdk"`, and `.ori/` is
git-ignored — so the SDK cache is **not** committed. A fresh clone therefore has
the dependency declared but not its on-disk target, and a bare `bun install` fails
to resolve it:

```text
error: Could not find package.json for "file:.ori/sdk" dependency "ori"
```

bun resolves `file:` dependencies before any `preinstall`/`postinstall` script
runs, so a lifecycle hook cannot fix this. Materialize the SDK cache first, then
install:

```sh
ori init .      # materializes .ori/sdk (idempotent — safe to re-run)
bun install
```

`ori init .` detects the existing workspace, (re)writes the `.ori/sdk` cache, and
keeps `.gitignore` correct. It does not overwrite your code.
