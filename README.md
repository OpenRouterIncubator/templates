# templates

Persona templates for [Ori](https://github.com/OpenRouterIncubator/ori).

Each top-level folder is a **persona template**: a complete, self-contained Ori
project (an ordinary Bun/TypeScript workspace) whose `features/` define an
agent's behavior.

```text
templates/
  default/
    package.json      # workspace root (workspaces: features/*)
    tsconfig.json
    biome.json
    bunfig.toml
    .gitignore
    features/
      system/   # always-on base prompt + feature-development skill
      review/   # on-demand code/plan review skill
```

Down the line these are consumed by:

```sh
ori init my-intern --template=default
```

`--template=default` is equivalent to a plain `ori init`: it produces the same
workspace the `default` template contains.

## Templates

| Template      | Persona                                                                      |
| ------------- | --------------------------------------------------------------------------- |
| `default`     | The baseline intern: makes small reviewable changes and reviews code.       |
| `code-review` | A PR reviewer: deep diff/blast-radius review, root-cause bug RCA, PR patrol. |
| `content-engine` | A content creator: brief → approve → draft pipeline + anti-AI style linter. |
| `contract-review` | A legal reviewer: analyzes contracts for risk and drafts RFP/questionnaire answers.  |
| `rainbow-intern`  | A custom default TUI built with Ink: a chat runtime that streams rainbow replies.    |
| `business-dev`    | A BD agent: finds/verifies emails, researches leads, drafts outreach for review.     |
