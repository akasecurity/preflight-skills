# preflight-skills

Two skills, one script, report-only:

- `skills/crew-review/SKILL.md` — independent multi-model review of a git diff.
- `skills/crew-consult/SKILL.md` — independent multi-model consult on a design doc.

Both run `node scripts/crew.mjs <review|consult> …` from the repo being reviewed and print a
report. They never act on the verdict. Read the SKILL.md files for the full contract.
