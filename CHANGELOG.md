# Changelog

Notable changes to preflight-skills. Format loosely follows Keep a Changelog;
versions follow semver.

## [Unreleased]

### Added
- `secure-research`: cited web research spread across search engines (`claude`, `codex`, `agy`,
  `grok`, and a self-hosted SearXNG). `scripts/research.mjs` fans researchers out, per angle,
  round-robin or on every engine. The session model scopes the question, runs one bounded gap-check
  wave, and writes a report grounded in quoted sources. Sensitive topics are gated, redacted and kept
  on SearXNG, and the engine refuses other engines for them. Claude Code runs it as the
  `preflight:secure-research-workflow` Workflow, where each researcher shows as its own agent.
  Engines take a model tune (`claude:sonnet`, `codex:gpt-6-luna@low`) so one run can compare models,
  and briefs report cost or tokens when the CLI does. `all` leaves out `grok`, whose headless tool
  policy is unverified.
  The default engine, `auto`, is `codex:gpt-6-luna@low` when codex is installed and `claude:haiku`
  otherwise. It measured best on quote fidelity, speed and cost. The searxng engine fetches the top
  result pages itself and returns verbatim excerpts.
  Every workflow subagent prompt starts with a task-isolation guard, because a live run showed
  subagents picking up the parent session's latest chat message and answering that instead.

### Fixed
- agy (google) seats no longer come back `skipped` on every run. Headless `agy -p` auto-denies any
  tool that needs a permission prompt and exits 0 with empty output, which caught both the temp
  packet file (outside the workspace) and the shell commands agy used to explore the repo. The
  packet now goes inline as the `-p` prompt, and agy seats get a note to work from the packet and
  use only in-workspace file viewing. No temp packet file is written anymore. A prompt over the
  platform's argv bound (768 KiB on macOS, 120 KiB on Linux) fails the seat with a clear reason and
  is never truncated.
- A seat that exits 0 without a parsable reply now shows its stderr in the skip reason, not just
  "no parsable JSON verdict".

## [0.2.2] — 2026-07-20

### Changed
- Renamed the project to **preflight-skills** and the plugin id to **preflight** (was
  `flightcrew`). Reinstall as `preflight@akasecurity`. Telemetry now writes to `~/.preflight/`.

## [0.2.0] — 2026-07-09

First public release.

### Added
- `crew-review` — cross-family multi-model review of a git range: two blind reads
  (RECALL + PRECISION) plus an independent judge, report-only.
- `crew-consult` — the same two-reads-plus-judge pipeline over a design doc or file.
- `biascheck` — neutral median authenticity scorer for a writing draft (N reads of
  one model, median and spread reported).
- `unbias` — prompt-only de-slop pass applying the tells catalog in place.
- Zero-dependency engine `scripts/crew.mjs`; anchor-based freshness pinning; loud
  degradation on missing model seats.
