# preflight-skills

Four skills, one script, report-only:

- `skills/crew-review/SKILL.md` — independent multi-model review of a git diff.
- `skills/crew-consult/SKILL.md` — independent multi-model consult on a design doc.
- `skills/biascheck/SKILL.md` — neutral median authenticity score for a writing draft.
- `skills/unbias/SKILL.md` — prompt-only de-slop pass applied in place.

The first three run `node scripts/crew.mjs <review|consult|biascheck> …` from the repo being
reviewed and print a report. They never act on the verdict. `unbias` is the odd one out: no engine
call and no model dispatch, since the session model applies `shared/BIAS.md` to the draft itself.

`crew-review` and `crew-consult` use the blind cross-family pipeline, two reads plus an independent
judge. `biascheck` does not: it takes several independent reads from one model and reports the
median score with its spread, scored against `shared/TELLS.md`.

Read the SKILL.md files for the full contract.
