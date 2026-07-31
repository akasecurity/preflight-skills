# AGENTS.md — preflight-skills

Per-repo conventions for any coding/ops agent. Builds on `~/aka/AGENTS.md` (company layer) and the
global layer — never repeats them.

## What this repo is

The **public, released** multi-model review crew, installed as the `preflight` plugin. Four skills
over one zero-dependency script:

- `crew-review` — blind cross-family review of a git range.
- `crew-consult` — the same pipeline over a design doc.
- `biascheck` — neutral median authenticity score for a writing draft.
- `unbias` — prompt-only de-slop the session model applies in place, outside the engine.

Public and MIT. Everything committed is visible immediately.

## Naming — read this before writing any user-facing string

Renamed from `flightcrew-skills` on 2026-07-20. The repo is `akasecurity/preflight-skills`, the
plugin id is `preflight`, the install handle is `preflight@akasecurity`, and the Homebrew formula is
`preflight`. **`flightcrew` is dead as a public name here.**

`flightcrew` still exists, but it is a different, private, proprietary thing — the engineering
harness. Never reintroduce it into this repo's copy.

The old GitHub URL still resolves through a redirect, so a stale link looks healthy. Verify with
`gh api repos/akasecurity/preflight-skills --jq .full_name` rather than by clicking.

## GEMINI.md is a product file, not agent instructions

`gemini-extension.json` sets `"contextFileName": "GEMINI.md"`, so **`GEMINI.md` ships to end users**
as the Gemini extension's context. It is not the harness-instruction counterpart to this file — read
it as product copy, keep it accurate against the shipped skill set, and don't turn it into a pointer.
It went stale once already, describing two skills after four had shipped.

`CLAUDE.md` does point here, as usual.

## Structure

- `scripts/crew.mjs` — the single engine, importable and executable, **only `node:*` imports**.
  Zero dependencies is a hard constraint, not a preference.
- `skills/*/SKILL.md` — the contracts. These are what the model reads.
- `shared/BIAS.md` — the forgiving self-editing catalog `unbias` applies.
- `shared/TELLS.md` — the detection-oriented reference `biascheck` scores against. Two different
  catalogs on purpose; don't merge them.
- `tests/*.test.mjs` — `node --test`. `tests/stubs/` holds fake `claude`/`codex`/`agy` binaries so
  the suite never dispatches a real model.

## Release surface

A version bump touches more files than it looks: `package.json`, `.claude-plugin/plugin.json`, the
other four harness manifests (`.codex-plugin`, `.cursor-plugin`, `.kimi-plugin`,
`gemini-extension.json`), `CITATION.cff`, and `CHANGELOG.md`. `CITATION.cff` has been forgotten
before. Grep the old version across the tree before tagging.

Downstream copies of the version and name live in `akasecurity/marketplace` (four files),
`akasecurity/homebrew-tap` (formula + README), and `akasecurity/.github` (`profile/README.md`).
None of them update on their own.

## Workflow

No CI or branch protection, so the suite is the only gate. Run it before pushing to `main`:

```bash
bun run test        # 104 tests; wraps node --test 'tests/*.test.mjs'
```

The glob matters — `node --test tests/` alone picks up the stub binaries in `tests/stubs/` and
fails.
