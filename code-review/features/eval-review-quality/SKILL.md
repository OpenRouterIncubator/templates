---
name: eval-review-quality
description: Measure review quality offline — sample recent merged PRs, score finding coverage and judgment, and report metrics to calibrate the reviewer.
---

# Evaluate Review Quality

Measure how good the reviews are, so the prompt and process can improve instead
of drifting.

## Pipeline

1. **Fetch** — collect the last N merged PRs for a repo and their actual outcomes
   (what broke, what was commented, what was fixed post-merge).
2. **Score coverage** — for each PR, did the reviewer surface the issues that
   mattered? Count real findings vs. misses vs. noise.
3. **Judge** — use an independent grader to rate each finding for correctness and
   usefulness, not just quantity.
4. **Report** — aggregate into metrics: precision (signal vs. nits), recall
   (caught vs. missed), and false-positive rate.

## Calibration

Compare against a held-out gold set or a second reviewer so the scores mean
something. Track the metrics over time; a change to the review prompt should move
them in the right direction.

## Known limits

Offline eval can't see everything a live reviewer would; treat misses as
hypotheses to confirm, and keep the gold set honest and up to date.
