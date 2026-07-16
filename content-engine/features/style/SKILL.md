---
name: human-voice
description: Write with a concrete human voice and strip AI-sounding prose; run the style check on every draft before it ships.
---

# Human Voice

Every piece must read like a specific person wrote it on purpose.

## Rules

1. Concrete beats abstract. Numbers, names, and examples — not "powerful
   capabilities" or "robust solutions."
2. Kill the filler. Never: "delve", "tapestry", "in today's fast-paced world",
   "it's important to note", "game-changer", "seamlessly", "in conclusion",
   "moreover/furthermore" chains.
3. Commit to claims. Hedging ("might", "perhaps", "arguably") in more than a
   couple of places per piece means you haven't done the research.
4. Vary the rhythm. Em-dashes, rule-of-three lists, and "Not only X but Y"
   become tells when they repeat.
5. One exclamation mark per piece, at most. Usually zero.
6. Read it aloud. If a sentence is hard to say, rewrite it.

## Mechanical gate

Run `/style <file>` on every draft. Error-severity findings block
shipping; warnings deserve a pass of judgment, not auto-acceptance.
