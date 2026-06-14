---
name: questionnaire-types
description: How to handle common security questionnaires and compliance assessments (CAIQ, SOC 2, HIPAA, GDPR, vendor questionnaires) when drafting answers.
---

# Questionnaire Types

Guidance for drafting answers with the `answer-questionnaire` command. Always ground
answers in the past-response archive; never claim a control or certification you
can't evidence.

## Common formats

- **CAIQ / CSA STAR** — yes/no/NA per control domain. Match the control ID; keep
  answers terse and consistent across related controls.
- **SOC 2** — questions map to Trust Services Criteria (security, availability,
  confidentiality, processing integrity, privacy). Reference the relevant report
  and period; don't overstate scope.
- **HIPAA** — focus on PHI safeguards, BAAs, access controls, breach procedures.
- **GDPR / DPA** — lawful basis, data-subject rights, sub-processors, transfer
  mechanism, retention/deletion.
- **Bespoke vendor questionnaires** — map each question to the closest archived
  Q&A; where there's no match, draft carefully and mark it for review.

## Rules

1. Answer from the archive first; stay consistent with prior responses.
2. Never invent a capability, certification, or scope. If it isn't evidenced,
   say so and flag the answer for human review.
3. Keep answers tight and factual; attach evidence references where the archive
   provides them.
4. Surface any answer that needs a policy owner or counsel before it's sent.
