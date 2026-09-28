# Changelog

Notable changes to preflight-skills. Format loosely follows Keep a Changelog;
versions follow semver.

## [Unreleased]

### Added
- `multiplechoice`: a prompt-only skill that asks the user for the decisions they need to make, as
  multiple-choice questions with the agent's recommendation first. It covers open decisions, the
  consequential calls the agent made on the user's behalf (which go to the picker too, not into
  prose), and choices an experiment could settle, proposed as the experiment. It checks facts before
  framing, quotes the user's own constraints without widening them, and asks rounds of up to four,
  one round per turn. Harnesses without a picker tool get a numbered list answered as `1a 2c`.
- `experiment`: a prompt-only checklist for settling a question by measurement. It checks earlier
  results and your own changes first, then runs a controlled, interleaved, repeated test on a real
  workload with shared systems guarded. Contaminated runs are excluded by timeline, the original
  config is restored and verified, and the result carries its evidence grade: measured, researched,
  inferred or inconclusive.
- `priorart`: a prompt-only checklist for looking before building. It checks the decision log and
  notes, existing scripts, the components on either side (full config and source), platform
  facilities and maintained projects. It prefers turning on or fixing what exists and never edits
  vendored code.

## [0.3.0] — 2026-09-26

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
  platform's argv bound (768 KiB on macOS, 120 KiB on Linux, 30 KiB on Windows), or one the OS
  rejects with E2BIG, is refused before spawning (`not run: …`, outcome `refused` in telemetry) and
  is never truncated. Trade-off: an inline prompt is visible in the process list to other local
  users while the seat runs, which the old owner-only temp file was not.
- agy seats are no longer told they "may freely explore the repository". agy explored with shell
  commands, which headless mode auto-denies.
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
