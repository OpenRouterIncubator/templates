---
name: find-email
description: Find and verify a prospect's work email with the `/find-email` command. Use when reachability is unknown during qualification or when outreach needs a verified address — do not guess addresses by hand.
---

# find-email

This feature is a **command, already built and tested** — do not offer to
implement it. When an email is needed, run it (or give the human the exact
command to run):

```text
/find-email "<First Last>" <domain>
```

Example: `/find-email "Jane Doe" acme.com`

## What it does

1. Generates the common corporate address patterns for the name
   (`jane.doe@`, `jdoe@`, `jane@`, …), ranked by prevalence.
2. Looks up the domain's MX records.
3. Probes the top candidates with an SMTP RCPT check. **No email is ever
   sent** — the probe only asks the server whether it would accept the
   address.

It needs no API key and uses the network only for DNS and the SMTP probe.

## Reading the result

- `Verified: <address>` — the server confirmed the mailbox. Treat as a
  verified fact in research cards.
- `Could not confirm an address … Ranked guesses:` — the server is
  accept-all, blocks probes, or the local network blocks outbound port 25.
  The guesses are **inferences, not facts**: label them as unverified in any
  research card or draft, and prefer another reachability path before
  starting a sequence.
- `No MX record for <domain>` — the domain doesn't receive mail; the domain
  itself is probably wrong.

## Rules

- Never present an unverified pattern guess as a verified address.
- Verification tells you the mailbox exists — it is not consent to contact;
  qualification and the sequencing rules still apply.
