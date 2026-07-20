---
name: investigate-bug
description: Systematic root-cause analysis from a bug report — locate the code, form hypotheses, gather static evidence, and output an RCA with file and line citations.
---

# Investigate a Bug

Bridge "I have a bug report" and "I know the root cause" with static analysis and
hypothesis-driven reasoning.

When invoking the `/investigate-bug` command, pass the report as a single
quoted argument (`/investigate-bug "crash on login when 2FA is on"`) —
unquoted multi-word input keeps only the first word.

## Phases

1. **Parse the report** — extract the symptom, the trigger, the expected vs.
   actual behavior, and any error text or stack.
2. **Locate the code** — search the codebase for the symbols, messages, and paths
   named in the report; map the relevant call paths.
3. **Generate hypotheses** — list concrete, falsifiable causes, ordered by
   likelihood. Don't anchor on the first one.
4. **Gather static evidence** — for each hypothesis, find code that confirms or
   refutes it. Follow the data, not your assumption.
5. **Decide and output** — either a full RCA (root cause + file:line citations +
   the fix) or, if static analysis can't settle it, targeted instrumentation to
   capture the missing runtime evidence.

## Discipline

- Find the **root cause**, not the symptom. "Add a null check" is rarely the RCA.
- Cite specific `file:line` for every claim.
- Distinguish what you proved from what you suspect.
- State confidence, and what would raise it.

## Before posting

Re-read your conclusion: is it supported by the evidence you cited, or did you
fill a gap with a guess? If the latter, say so or keep digging.
