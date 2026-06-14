---
name: feature-development
description: Create or update Ori feature contributions.
---

# Feature Development

When developing Ori features:

1. Identify the active feature root before writing files.
2. Create or edit feature contributions only under the active feature root.
3. Use root skills at `<active-feature-root>/<feature-id>/SKILL.md`.
4. Use nested skills at
   `<active-feature-root>/<feature-id>/skills/<skill-name>/SKILL.md` when a
   feature owns several related skills.
5. Do not create project skills outside the active feature root unless
   explicitly asked.
6. Run `ori features validate` when the feature shape changes.
